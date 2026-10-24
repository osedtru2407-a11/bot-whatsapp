const path = require('path');
const fs = require('fs');
const express = require('express');
const QRCode = require('qrcode');
const mime = require('mime');
const { Client, LocalAuth, MessageMedia } = require('./index');
const geminiService = require('./geminiService');
const libraryService = require('./libraryService');
const { initDb } = require('./db');
const dataStore = require('./dataStore');
const authService = require('./authService');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'sales_bot_data.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

// Asegurar directorios de subida y archivos
['rules', 'received', 'quick'].forEach(dir => {
    const fullPath = path.join(UPLOADS_DIR, dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
    }
});

// Aumentar límites para permitir subida de archivos (imágenes, PDFs de catálogo, etc.)
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Desactivar caché del navegador para todas las rutas API
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

// Middleware de autenticación opcional para poblar req.user si viene Bearer Token
function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        try {
            const decoded = authService.verifyToken(token);
            req.user = decoded;
        } catch (e) {}
    }
    next();
}

// Middleware de autenticación requerida
function requireAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Acceso no autorizado. Inicia sesión.' });
    }
    const token = authHeader.slice(7).trim();
    try {
        const decoded = authService.verifyToken(token);
        req.user = decoded;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Sesión expirada o token inválido. Inicia sesión nuevamente.' });
    }
}

app.use('/api', optionalAuth);
app.use(express.static(path.join(__dirname, 'public')));

// =========================================================================
// GESTIÓN DE PERSISTENCIA Y MULTI-EMPRESA
// =========================================================================

function createDefaultCompany(name = 'Digital Pass', id = 'default') {
    return {
        id,
        name,
        settings: {
            businessName: name,
            botEnabled: true,
            simulateTyping: true,
            typingDelaySeconds: 2,
            ignoreGroups: true,
            fallbackMessage: `¡Hola! Gracias por comunicarte con ${name}. Escribe *menu* para ver las opciones disponibles.`,
            geminiEnabled: true
        },
        rules: [],
        schedules: [],
        leads: [],
        library: []
    };
}

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            const parsed = JSON.parse(raw);

            // Migración automática: De sistema mono-empresa plano a sistema multi-empresa
            if (parsed && !parsed.companies && parsed.rules) {
                console.log('🔄 Migrando datos existentes a formato multi-empresa...');
                const defaultCompany = {
                    id: 'default',
                    name: parsed.settings?.businessName || 'Digital Pass',
                    settings: parsed.settings || {
                        businessName: "Digital Pass",
                        botEnabled: true,
                        simulateTyping: true,
                        typingDelaySeconds: 2,
                        ignoreGroups: true,
                        fallbackMessage: "Escribe *menu* para ver las opciones disponibles.",
                        geminiEnabled: true
                    },
                    rules: parsed.rules || [],
                    schedules: parsed.schedules || [],
                    leads: parsed.leads || [],
                    library: parsed.library || []
                };

                const multiData = {
                    activeCompanyId: 'default',
                    companies: [defaultCompany]
                };
                saveData(multiData);
                return multiData;
            }

            // Si ya tiene el esquema multi-empresa
            if (parsed && Array.isArray(parsed.companies)) {
                if (parsed.companies.length === 0) {
                    parsed.companies.push(createDefaultCompany());
                }
                if (!parsed.activeCompanyId) {
                    parsed.activeCompanyId = parsed.companies[0].id;
                }
                parsed.companies.forEach(comp => {
                    if (!comp.rules) comp.rules = [];
                    if (!comp.schedules) comp.schedules = [];
                    if (!comp.leads) comp.leads = [];
                    if (!comp.library) comp.library = [];
                    if (!comp.settings) comp.settings = { businessName: comp.name || 'Mi Negocio', botEnabled: true };
                });
                return parsed;
            }
        }
    } catch (e) {
        console.error('Error al cargar datos:', e);
    }

    return {
        activeCompanyId: 'default',
        companies: [createDefaultCompany()]
    };
}

function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Error al guardar datos:', e);
    }
}

let appData = loadData();

// =========================================================================
// GESTOR DE CLIENTES WHATSAPP MULTI-INSTANCIA
// =========================================================================

// Mapa de instancias de WhatsApp por empresa: Map<companyId, { client, status, qrCode, clientInfo }>
const companyClients = new Map();

function initCompanyWhatsAppClient(companyId) {
    const company = appData.companies.find(c => c.id === companyId);
    if (!company) {
        console.warn(`[Multi-Bot] No se encontró la empresa con ID: ${companyId}`);
        return;
    }

    // Detener instancia previa si existe
    if (companyClients.has(companyId)) {
        const existing = companyClients.get(companyId);
        if (existing && existing.client) {
            try {
                existing.client.destroy().catch(() => {});
            } catch (e) {}
        }
    }

    const state = {
        client: null,
        status: 'initializing',
        qrCode: null,
        clientInfo: null
    };
    companyClients.set(companyId, state);

    console.log(`[Empresa: ${company.name} (${companyId})] Iniciando cliente WhatsApp...`);

    // Para la empresa 'default', usamos clientId: null para reutilizar la sesión existente en .wwebjs_auth/session
    // Para las demás empresas, usamos clientId: companyId (se guarda en .wwebjs_auth/session-<companyId>)
    const authClientId = (companyId === 'default') ? null : companyId;

    // Limpieza preventiva de lockfile huérfano si una sesión previa cerró de forma anómala
    const sessionDir = path.join(__dirname, '.wwebjs_auth', (companyId === 'default' ? 'session' : `session-${companyId}`));
    const lockfilePath = path.join(sessionDir, 'lockfile');
    if (fs.existsSync(lockfilePath)) {
        try {
            fs.unlinkSync(lockfilePath);
            console.log(`[Empresa: ${company.name}] 🧹 Lockfile huérfano liberado correctamente.`);
        } catch (e) {
            console.warn(`[Empresa: ${company.name}] ⚠️ Archivo de sesión ocupado o en uso: ${e.message}`);
        }
    }

    const clientInstance = new Client({
        authStrategy: new LocalAuth({
            clientId: authClientId,
            dataPath: path.join(__dirname, '.wwebjs_auth')
        }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    state.client = clientInstance;

    clientInstance.on('qr', async (qr) => {
        console.log(`[Empresa: ${company.name}] Nuevo código QR recibido`);
        state.status = 'qr_ready';
        try {
            state.qrCode = await QRCode.toDataURL(qr, {
                width: 320,
                margin: 2,
                color: { dark: '#0b141a', light: '#ffffff' }
            });
        } catch (err) {
            console.error(`[Empresa: ${company.name}] Error generando QR DataURL:`, err);
        }
    });

    clientInstance.on('authenticated', () => {
        console.log(`[Empresa: ${company.name}] Autenticado correctamente`);
        state.status = 'authenticated';
        state.qrCode = null;
    });

    clientInstance.on('auth_failure', (msg) => {
        console.error(`[Empresa: ${company.name}] Fallo de autenticación:`, msg);
        state.status = 'auth_failure';
    });

    clientInstance.on('ready', async () => {
        console.log(`[Empresa: ${company.name}] WhatsApp LISTO para enviar y recibir`);
        state.status = 'ready';
        state.qrCode = null;
        try {
            state.clientInfo = {
                pushname: clientInstance.info?.pushname || company.name,
                wid: clientInstance.info?.wid?.user || 'Conectado',
                platform: clientInstance.info?.platform || 'web'
            };
        } catch (e) {
            state.clientInfo = { pushname: company.name, wid: 'Conectado' };
        }
    });

    clientInstance.on('disconnected', (reason) => {
        console.log(`[Empresa: ${company.name}] Desconectado:`, reason);
        state.status = 'disconnected';
        state.clientInfo = null;
        state.qrCode = null;
    });

    clientInstance.on('message', async (msg) => {
        try {
            await handleIncomingMessage(companyId, msg);
        } catch (err) {
            console.error(`[Empresa: ${company.name}] Error procesando mensaje entrante:`, err);
        }
    });

    clientInstance.initialize().catch((err) => {
        console.error(`[Empresa: ${company.name}] Error en client.initialize():`, err);
        state.status = 'error';
    });
}

async function stopCompanyWhatsAppClient(companyId) {
    if (companyClients.has(companyId)) {
        const holder = companyClients.get(companyId);
        if (holder && holder.client) {
            try {
                await holder.client.destroy();
            } catch (e) {
                console.error(`Error deteniendo cliente de empresa ${companyId}:`, e.message);
            }
        }
        companyClients.delete(companyId);
    }
}

function initAllCompanyClients() {
    for (const comp of appData.companies) {
        initCompanyWhatsAppClient(comp.id);
    }
}

// Limpieza de leyenda de mensaje
function getCleanCaption(body) {
    if (!body || typeof body !== 'string') return '';
    const trimmed = body.trim();
    if (trimmed.startsWith('/9j/') || trimmed.startsWith('data:image') || (!trimmed.includes(' ') && trimmed.length > 80)) {
        return '';
    }
    return trimmed;
}

// Persistir lead en PostgreSQL de manera asíncrona
function persistLead(companyId, lead) {
    saveData(appData);
    if (companyId && lead) {
        dataStore.upsertLeadInDb(companyId, lead).catch(e => console.error(`[DB] Error guardando lead ${lead.phone}:`, e.message));
    }
}

// =========================================================================
// LÓGICA DE ATENCIÓN AUTOMÁTICA POR EMPRESA
// =========================================================================

async function handleIncomingMessage(companyId, msg) {
    const company = appData.companies.find(c => c.id === companyId);
    if (!company) return;
    if (!company.settings || !company.settings.botEnabled) return;
    if (msg.fromMe) return;

    if (company.settings.ignoreGroups && msg.from.includes('@g.us')) return;

    const senderPhone = msg.from.replace('@c.us', '').replace('@g.us', '');
    const cleanText = getCleanCaption(msg.body);
    const text = cleanText.toLowerCase();

    // 1. Detectar si es nota de voz o archivo adjunto
    const isAudioType = msg.type === 'ptt' || msg.type === 'audio';
    const hasMedia = Boolean(msg.hasMedia || isAudioType);

    let receivedMedia = null;
    let rawAudioMedia = null;

    if (hasMedia) {
        try {
            console.log(`[${company.name}] 📥 Descargando archivo recibido de ${senderPhone}... (tipo: ${msg.type})`);

            let downloaded = null;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    downloaded = await msg.downloadMedia();
                    if (downloaded && downloaded.data) break;
                } catch (e) {
                    console.warn(`[${company.name}] Intento ${attempt + 1} de descarga:`, e.message);
                }
                await new Promise(r => setTimeout(r, 600));
            }

            if (downloaded && downloaded.data) {
                const ext = mime.getExtension(downloaded.mimetype) || (isAudioType ? 'oga' : 'bin');
                const originalName = downloaded.filename || `recibido_${Date.now()}.${ext}`;
                const cleanOriginal = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
                const uniqueFilename = `${Date.now()}_${cleanOriginal}`;
                const savePath = path.join(UPLOADS_DIR, 'received', uniqueFilename);

                fs.writeFileSync(savePath, Buffer.from(downloaded.data, 'base64'));

                receivedMedia = {
                    id: 'med-' + Date.now(),
                    filename: originalName,
                    mimetype: downloaded.mimetype,
                    size: downloaded.filesize || (downloaded.data ? Math.round(downloaded.data.length * 0.75) : 0),
                    url: `/uploads/received/${uniqueFilename}`,
                    receivedAt: new Date().toISOString(),
                    caption: cleanText
                };
                console.log(`[${company.name}] ✅ Archivo recibido guardado: ${receivedMedia.url}`);

                const isAudio = isAudioType || (downloaded.mimetype || '').startsWith('audio/') || (downloaded.mimetype || '').includes('ogg');
                if (isAudio) {
                    rawAudioMedia = {
                        data: downloaded.data,
                        mimetype: downloaded.mimetype || 'audio/ogg; codecs=opus'
                    };
                }
            } else {
                console.warn(`[${company.name}] ⚠️ No se pudo descargar el archivo adjunto de ${senderPhone}`);
            }
        } catch (err) {
            console.error(`[${company.name}] Error descargando archivo adjunto:`, err);
        }
    }

    if (isAudioType && !rawAudioMedia) {
        console.warn(`[${company.name}] ⚠️ La nota de voz de ${senderPhone} no se pudo procesar.`);
        if (company.settings.fallbackMessage) {
            await msg.reply('Disculpa, no pude escuchar tu nota de voz en este momento. ¿Podrías enviarla nuevamente o escribir tu consulta en texto?');
        }
        return;
    }

    if (!text && !receivedMedia && !rawAudioMedia) return;

    // 2. Buscar o registrar lead para esta empresa específica
    if (!company.leads) company.leads = [];
    let lead = company.leads.find(l => l.phone === senderPhone);
    const isAudioMsg = Boolean(rawAudioMedia || isAudioType || (receivedMedia && (receivedMedia.mimetype || '').startsWith('audio/')));
    const displayMsg = isAudioMsg 
        ? (cleanText ? `🎤 [Nota de voz] ${cleanText}` : `🎤 [Nota de voz / Audio]`)
        : (receivedMedia 
            ? (cleanText ? `📎 [${receivedMedia.filename}] ${cleanText}` : `📎 [${receivedMedia.filename}]`) 
            : cleanText);

    if (!lead) {
        lead = {
            phone: senderPhone,
            name: msg._data?.notifyName || senderPhone,
            tag: isAudioMsg ? 'Audio / Nota de voz' : (receivedMedia ? 'Comprobante/Archivo Enviado' : 'Nuevo'),
            lastMessage: displayMsg,
            lastInteraction: new Date().toISOString(),
            lastSentRuleId: null,
            humanPaused: false,
            receivedFiles: []
        };
        company.leads.unshift(lead);
    } else {
        lead.lastMessage = displayMsg;
        lead.lastInteraction = new Date().toISOString();
        if (msg._data?.notifyName && lead.name === senderPhone) {
            lead.name = msg._data.notifyName;
        }
    }

    if (!lead.receivedFiles) lead.receivedFiles = [];
    if (receivedMedia) {
        lead.receivedFiles.unshift(receivedMedia);
    }

    if (lead.humanPaused) {
        console.log(`[${company.name}] Mensaje recibido de ${senderPhone}, pero el bot está pausado para este contacto (atención humana).`);
        persistLead(companyId, lead);
        return;
    }

    // 3. Buscar regla coincidente en las rutas de esta empresa
    const hasMediaFlag = Boolean(receivedMedia);
    const mediaMimetype = receivedMedia ? receivedMedia.mimetype : (isAudioType ? 'audio/ogg' : '');
    const context = { lastSentRuleId: lead ? lead.lastSentRuleId : null };
    const matchedRule = matchRule(text, company.rules || [], hasMediaFlag, mediaMimetype, context);

    if (matchedRule) {
        console.log(`[${company.name}] Regla activada: "${matchedRule.name}" para ${senderPhone}`);

        if (matchedRule.leadTag) {
            lead.tag = matchedRule.leadTag;
        }

        if (matchedRule.pauseBot) {
            lead.humanPaused = true;
            console.log(`[${company.name}] Bot pausado para ${senderPhone} debido a la regla "${matchedRule.name}".`);
        }

        lead.lastSentRuleId = matchedRule.id;
        persistLead(companyId, lead);

        // Simular escritura natural
        if (company.settings.simulateTyping) {
            try {
                const chat = await msg.getChat();
                await chat.sendStateTyping();
                const delayMs = (company.settings.typingDelaySeconds || 2) * 1000;
                await new Promise(r => setTimeout(r, delayMs));
                await chat.clearStateTyping();
            } catch (e) {}
        }

        // 4. Enviar respuesta con el cliente de WhatsApp de esta empresa
        await sendRuleResponse(companyId, msg, matchedRule);

    } else if (company.settings.geminiEnabled !== false && geminiService.isConfigured() && libraryService.hasActiveKnowledge(company.library) && (text.length > 0 || rawAudioMedia)) {
        persistLead(companyId, lead);
        if (rawAudioMedia) {
            console.log(`[${company.name}] 🎙️ Escuchando nota de voz de ${senderPhone} con Gemini (Base de conocimiento activa)...`);
        } else {
            console.log(`[${company.name}] 🤖 Usando Gemini para responder a ${senderPhone} (Base de conocimiento activa)...`);
        }

        let chat = null;
        try {
            if (company.settings.simulateTyping) {
                try {
                    chat = await msg.getChat();
                    await chat.sendStateTyping();
                } catch (e) {}
            }

            const businessName = company.settings.businessName || company.name || 'Mi Negocio';
            const geminiInput = rawAudioMedia ? {
                text: cleanText,
                audio: rawAudioMedia
            } : cleanText;

            // Sesión de Gemini aislada por empresa y remitente
            const sessionKey = `${companyId}_${senderPhone}`;
            const aiReply = await geminiService.sendMessage(sessionKey, geminiInput, businessName, company.library || []);

            if (chat) {
                try { await chat.clearStateTyping(); } catch (e) {}
            }

            if (aiReply) {
                await msg.reply(aiReply);
                console.log(`[${company.name}] ✅ Respuesta de Gemini enviada a ${senderPhone}`);

                if (lead) {
                    lead.lastMessage = isAudioMsg 
                        ? `🎤 [Nota de voz]: "${aiReply.replace(/\n/g, ' ').slice(0, 70)}..."`
                        : aiReply.replace(/\n/g, ' ').slice(0, 70);
                    lead.lastInteraction = new Date().toISOString();
                    lead.lastSentRuleId = 'gemini';
                    persistLead(companyId, lead);
                }
            }
        } catch (geminiErr) {
            console.error(`[${company.name}] Error al responder con Gemini:`, geminiErr.message || geminiErr);
            if (chat) {
                try { await chat.clearStateTyping(); } catch (e) {}
            }
            if (company.settings.fallbackMessage) {
                await msg.reply(company.settings.fallbackMessage);
                if (lead) {
                    lead.lastSentRuleId = 'fallback';
                    persistLead(companyId, lead);
                }
            }
        }

    } else if (company.settings.fallbackMessage && (text.length > 0 || hasMediaFlag || isAudioMsg)) {
        if (lead) {
            lead.lastSentRuleId = 'fallback';
        }
        persistLead(companyId, lead);
        if (company.settings.simulateTyping) {
            try {
                const chat = await msg.getChat();
                await chat.sendStateTyping();
                const delayMs = (company.settings.typingDelaySeconds || 2) * 1000;
                await new Promise(r => setTimeout(r, delayMs));
                await chat.clearStateTyping();
            } catch (e) {}
        }
        await msg.reply(company.settings.fallbackMessage);
        console.log(`[${company.name}] 💬 Respuesta por defecto enviada a ${senderPhone} (sin coincidencia de regla y biblioteca sin datos activos para Gemini)`);
    } else {
        persistLead(companyId, lead);
    }
}

// Envío de respuesta con soporte de medios
async function sendRuleResponse(companyId, msg, rule) {
    let mediaToSend = null;

    if (rule.media && rule.media.url) {
        try {
            const relPath = rule.media.url.startsWith('/') ? rule.media.url.slice(1) : rule.media.url;
            const fullLocalPath = path.join(__dirname, 'public', relPath);

            if (fs.existsSync(fullLocalPath)) {
                mediaToSend = MessageMedia.fromFilePath(fullLocalPath);
            } else if (rule.media.url.startsWith('http')) {
                mediaToSend = await MessageMedia.fromUrl(rule.media.url);
            }
        } catch (err) {
            console.error('Error cargando archivo para enviar en regla:', err);
        }
    }

    const holder = companyClients.get(companyId);
    const clientInstance = holder ? holder.client : null;

    if (mediaToSend && clientInstance) {
        console.log(`📤 Enviando archivo adjunto "${rule.media.filename || 'archivo'}" a ${msg.from}...`);
        await clientInstance.sendMessage(msg.from, mediaToSend, {
            caption: rule.response || undefined
        });
    } else {
        await msg.reply(rule.response);
    }
}

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeAccents(str) {
    return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Evalúa si un trigger coincide con el texto del mensaje considerando submenús y palabras clave.
 */
function checkTriggerMatch(text, trigger, matchType = 'contains_any', context = {}, rule = {}) {
    const rawText = (text || '').trim();
    const rawTrigger = (trigger || '').trim();
    if (!rawText || !rawTrigger) return false;

    const lowerText = rawText.toLowerCase().replace(/\s+/g, ' ');
    const lowerTrigger = rawTrigger.toLowerCase().replace(/\s+/g, ' ');

    // Caso 1: El trigger es un número puro (ej: '1', '2', '3')
    const isNumericTrigger = /^\d+$/.test(lowerTrigger);

    if (isNumericTrigger) {
        const requiredParentId = rule.parentRuleId || 'rule-welcome';
        if (!context || context.lastSentRuleId !== requiredParentId) {
            return false;
        }

        const cleanNoEmojis = lowerText.replace(/[\uFE0F\u20E3]/g, '');
        const cleanNoPunct = cleanNoEmojis.replace(/^[#\s([<]+|[.\s!?:)\]>]+$/g, '');
        if (cleanNoPunct === lowerTrigger) return true;

        const escaped = escapeRegExp(lowerTrigger);
        const menuOptionRegex = new RegExp(
            '^(?:(?:hola|buenas|por\\s+favor)?\\s*(?:opci[oó]n|n[uú]mero|num|n°|no\\.?|item|el|la)?\\s*#?\\s*)' +
            escaped +
            '[.\\s!?:)]*$',
            'iu'
        );
        if (menuOptionRegex.test(cleanNoEmojis)) return true;

        return false;
    }

    // Caso 2: Palabras clave de texto
    const normText = normalizeAccents(lowerText);
    const normTrigger = normalizeAccents(lowerTrigger);

    if (matchType === 'exact') {
        const cleanNoPunct = normText.replace(/^[¿¡!?,.:;\s]+|[¿¡!?,.:;\s]+$/g, '');
        return cleanNoPunct === normTrigger;
    }

    if (matchType === 'starts_with') {
        const escaped = escapeRegExp(normTrigger);
        const startsRegex = new RegExp('^(?:[¿¡!?,.:;\\s]*)(?:' + escaped + ')(?:(?![\\p{L}\\p{N}])|$)', 'iu');
        return startsRegex.test(normText);
    }

    const escaped = escapeRegExp(normTrigger);
    const wordBoundaryRegex = new RegExp('(?<![\\p{L}\\p{N}])' + escaped + '(?![\\p{L}\\p{N}])', 'iu');
    return wordBoundaryRegex.test(normText);
}

// Algoritmo de coincidencia de reglas
function matchRule(text, rules, hasMedia = false, mediaMimetype = '', context = {}) {
    const activeRules = rules.filter(r => r.enabled !== false);
    const isAudioMedia = mediaMimetype.startsWith('audio/') || mediaMimetype.includes('ogg');
    const lastSentRuleId = context.lastSentRuleId || null;

    // Prioridad 1: Submenús contextuales cuyo parentRuleId coincide con el último menú enviado
    // Prioridad 2: Reglas globales
    const sortedRules = [...activeRules].sort((a, b) => {
        const aMatchesContext = Boolean(a.parentRuleId && a.parentRuleId === lastSentRuleId);
        const bMatchesContext = Boolean(b.parentRuleId && b.parentRuleId === lastSentRuleId);
        if (aMatchesContext && !bMatchesContext) return -1;
        if (!aMatchesContext && bMatchesContext) return 1;
        return 0;
    });

    for (const rule of sortedRules) {
        const triggerType = rule.triggerType || 'text';

        // A. Coincidencia por archivo recibido
        if (hasMedia && (triggerType === 'media' || triggerType === 'both' || rule.matchType === 'on_media')) {
            const filter = rule.mediaTypeFilter || 'any';
            let mediaMatches = false;

            if (filter === 'any') {
                if (!isAudioMedia) mediaMatches = true;
            } else if (filter === 'image' && mediaMimetype.startsWith('image/')) {
                mediaMatches = true;
            } else if (filter === 'document' && (
                mediaMimetype.includes('pdf') || 
                mediaMimetype.includes('document') || 
                mediaMimetype.includes('sheet') || 
                mediaMimetype.includes('msword') || 
                mediaMimetype.includes('text') || 
                mediaMimetype.includes('octet-stream')
            )) {
                mediaMatches = true;
            } else if (filter === 'audio' && isAudioMedia) {
                mediaMatches = true;
            }

            if (mediaMatches) {
                const triggers = (rule.triggers || []).map(t => t.trim().toLowerCase()).filter(Boolean);
                if (!triggers.length || !text) return rule;
                const matchType = rule.matchType || 'contains_any';
                if (triggers.some(t => checkTriggerMatch(text, t, matchType, context, rule))) {
                    return rule;
                }
                if (triggerType === 'media' || rule.matchType === 'on_media') {
                    return rule;
                }
            }
        }

        // B. Coincidencia por texto / palabras clave
        if (text && (triggerType === 'text' || triggerType === 'both' || !rule.triggerType)) {
            const triggers = (rule.triggers || []).map(t => t.trim().toLowerCase()).filter(Boolean);
            if (!triggers.length) continue;

            const matchType = rule.matchType || 'contains_any';
            if (triggers.some(t => checkTriggerMatch(text, t, matchType, context, rule))) {
                return rule;
            }
        }
    }
    return null;
}

// =========================================================================
// MOTOR DE PROGRAMACIÓN DE ENVÍOS MULTI-EMPRESA
// =========================================================================

setInterval(async () => {
    const now = new Date();
    let hasChanges = false;

    for (const company of (appData.companies || [])) {
        const holder = companyClients.get(company.id);
        if (!holder || holder.status !== 'ready' || !holder.client) continue;

        for (const item of (company.schedules || [])) {
            if (item.status === 'pending') {
                const scheduledDate = new Date(item.scheduledTime);
                if (scheduledDate <= now) {
                    console.log(`[${company.name}] ⏰ Ejecutando envío programado a ${item.recipient}: "${(item.message || '').slice(0, 30)}..."`);
                    try {
                        const cleanPhone = item.recipient.replace(/\D/g, '');
                        const chatId = `${cleanPhone}@c.us`;

                        if (item.media && item.media.url) {
                            const relPath = item.media.url.startsWith('/') ? item.media.url.slice(1) : item.media.url;
                            const fullPath = path.join(__dirname, 'public', relPath);
                            let mediaInstance = null;
                            if (fs.existsSync(fullPath)) {
                                mediaInstance = MessageMedia.fromFilePath(fullPath);
                            } else if (item.media.url.startsWith('http')) {
                                mediaInstance = await MessageMedia.fromUrl(item.media.url);
                            }

                            if (mediaInstance) {
                                await holder.client.sendMessage(chatId, mediaInstance, { caption: item.message || undefined });
                            } else {
                                await holder.client.sendMessage(chatId, item.message || '');
                            }
                        } else {
                            await holder.client.sendMessage(chatId, item.message);
                        }

                        item.status = 'sent';
                        item.sentAt = new Date().toISOString();
                        console.log(`[${company.name}] ✅ Envío programado exitoso a ${cleanPhone}`);
                    } catch (err) {
                        console.error(`[${company.name}] ❌ Error en envío programado a ${item.recipient}:`, err);
                        item.status = 'failed';
                        item.error = err.message || 'Error al enviar';
                    }
                    hasChanges = true;
                }
            }
        }
    }

    if (hasChanges) {
        saveData(appData);
    }
}, 10000);

// =========================================================================
// MIDDLEWARE DE RESOLUCIÓN DE EMPRESA
// =========================================================================

function resolveCompany(req, res, next) {
    const rawQueryId = req.query.companyId;
    const rawHeaderId = req.headers['x-company-id'];
    const rawBodyId = req.body?.companyId;

    let requestedId = null;
    if (rawQueryId && rawQueryId !== 'undefined' && rawQueryId !== 'null' && typeof rawQueryId === 'string' && rawQueryId.trim()) {
        requestedId = rawQueryId.trim();
    } else if (rawHeaderId && rawHeaderId !== 'undefined' && rawHeaderId !== 'null' && typeof rawHeaderId === 'string' && rawHeaderId.trim()) {
        requestedId = rawHeaderId.trim();
    } else if (rawBodyId && rawBodyId !== 'undefined' && rawBodyId !== 'null' && typeof rawBodyId === 'string' && rawBodyId.trim()) {
        requestedId = rawBodyId.trim();
    } else {
        requestedId = appData.activeCompanyId || 'default';
    }

    let company = appData.companies.find(c => c.id === requestedId);
    if (!company) {
        company = appData.companies.find(c => c.id === appData.activeCompanyId) || appData.companies[0];
    }
    if (!company) {
        return res.status(404).json({ error: 'No se encontró la empresa solicitada en el sistema.' });
    }
    req.company = company;
    req.companyId = company.id;
    next();
}

// =========================================================================
// RUTAS DE AUTENTICACIÓN & CONTROL DE ACCESO
// =========================================================================

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await authService.login(email, password);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, password, companyName } = req.body;
        const result = await authService.register(fullName, email, password, companyName);
        // Recargar datos multi-empresa
        appData = await dataStore.loadAllAppData();
        initCompanyWhatsAppClient(result.company.id);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
        const targetCompId = req.query.companyId || req.headers['x-company-id'] || appData.activeCompanyId;
        const context = await authService.getUserContext(req.user.id, targetCompId);
        res.json({ success: true, ...context });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const result = await authService.changePassword(req.user.id, currentPassword, newPassword);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// =========================================================================
// RUTAS DE GESTIÓN DE EQUIPO Y ROLES POR EMPRESA
// =========================================================================

app.get('/api/companies/:id/team', requireAuth, async (req, res) => {
    try {
        const members = await authService.getTeamMembers(req.params.id);
        const roles = await authService.getCompanyRoles(req.params.id);
        res.json({ success: true, members, roles });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/companies/:id/team/members', requireAuth, async (req, res) => {
    try {
        const result = await authService.addTeamMember(req.params.id, req.user.id, req.body);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/companies/:id/team/members/:userId', requireAuth, async (req, res) => {
    try {
        const result = await authService.updateTeamMemberRole(req.params.id, req.user.id, req.params.userId, req.body.roleId);
        res.json({ success: true, member: result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/companies/:id/team/members/:userId', requireAuth, async (req, res) => {
    try {
        const result = await authService.removeTeamMember(req.params.id, req.user.id, req.params.userId);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/companies/:id/roles', requireAuth, async (req, res) => {
    try {
        const roles = await authService.getCompanyRoles(req.params.id);
        res.json({ success: true, roles });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/companies/:id/roles', requireAuth, async (req, res) => {
    try {
        const role = await authService.createCustomRole(req.params.id, req.body);
        res.json({ success: true, role });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// =========================================================================
// RUTAS DE GESTIÓN DE EMPRESAS (MULTI-TENANT CON PERSISTENCIA EN DB)
// =========================================================================

// Listar empresas disponibles para el usuario
app.get('/api/companies', async (req, res) => {
    let allowedCompanyIds = null;
    if (req.user && req.user.id) {
        try {
            const userComps = await authService.getUserCompanies(req.user.id);
            allowedCompanyIds = new Set(userComps.map(c => c.id));
        } catch (e) {}
    }

    const filtered = allowedCompanyIds 
        ? appData.companies.filter(c => allowedCompanyIds.has(c.id))
        : appData.companies;

    const list = filtered.map(c => {
        const holder = companyClients.get(c.id);
        return {
            id: c.id,
            name: c.name,
            isActive: c.id === appData.activeCompanyId,
            status: holder ? holder.status : 'disconnected',
            phone: holder?.clientInfo?.wid || null,
            pushname: holder?.clientInfo?.pushname || null,
            botEnabled: c.settings?.botEnabled !== false,
            rulesCount: (c.rules || []).length,
            leadsCount: (c.leads || []).length,
            libraryCount: (c.library || []).length,
            pendingSchedulesCount: (c.schedules || []).filter(s => s.status === 'pending').length
        };
    });

    res.json({
        activeCompanyId: appData.activeCompanyId,
        companies: list
    });
});

// Crear una nueva empresa con su propio bot y entorno aislado
app.post('/api/companies', async (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        if (!name) {
            return res.status(400).json({ error: 'El nombre de la empresa es obligatorio' });
        }

        const id = 'comp_' + Date.now();
        const newCompany = createDefaultCompany(name, id);
        newCompany.createdBy = req.user ? req.user.id : null;

        appData.companies.push(newCompany);
        appData.activeCompanyId = id;
        saveData(appData);

        // Persistir en PostgreSQL
        await dataStore.createCompanyInDb(id, name, req.user ? req.user.id : null);

        // Inicializar bot exclusivo para esta empresa
        initCompanyWhatsAppClient(id);

        res.json({ success: true, company: newCompany, activeCompanyId: id });
    } catch (e) {
        console.error('Error creando empresa:', e);
        res.status(500).json({ error: e.message || 'Error al crear la empresa' });
    }
});

// Actualizar nombre de empresa
app.put('/api/companies/:id', async (req, res) => {
    const comp = appData.companies.find(c => c.id === req.params.id);
    if (!comp) return res.status(404).json({ error: 'Empresa no encontrada' });

    if (req.body.name) {
        const cleanName = req.body.name.trim();
        if (cleanName) {
            const oldName = comp.name;
            comp.name = cleanName;
            if (comp.settings) {
                comp.settings.businessName = cleanName;
                if (comp.settings.fallbackMessage && oldName && comp.settings.fallbackMessage.includes(oldName)) {
                    comp.settings.fallbackMessage = comp.settings.fallbackMessage.split(oldName).join(cleanName);
                }
            }
            // Persistir en PostgreSQL
            await dataStore.updateCompanyNameInDb(req.params.id, cleanName).catch(e => console.error('Error actualizando empresa en DB:', e));
        }
    }

    saveData(appData);
    res.json({ success: true, company: comp });
});

// Seleccionar empresa activa
app.post('/api/companies/:id/select', (req, res) => {
    const comp = appData.companies.find(c => c.id === req.params.id);
    if (!comp) return res.status(404).json({ error: 'Empresa no encontrada' });

    appData.activeCompanyId = comp.id;
    saveData(appData);
    res.json({ success: true, activeCompanyId: comp.id, name: comp.name });
});

// Eliminar una empresa (no se permite si es la única)
app.delete('/api/companies/:id', async (req, res) => {
    if (appData.companies.length <= 1) {
        return res.status(400).json({ error: 'No es posible eliminar la única empresa registrada.' });
    }

    const index = appData.companies.findIndex(c => c.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Empresa no encontrada' });

    const toDeleteId = req.params.id;

    await stopCompanyWhatsAppClient(toDeleteId);

    appData.companies.splice(index, 1);
    if (appData.activeCompanyId === toDeleteId) {
        appData.activeCompanyId = appData.companies[0].id;
    }

    saveData(appData);
    await dataStore.deleteCompanyFromDb(toDeleteId).catch(e => console.error('Error eliminando empresa en DB:', e));

    res.json({ success: true, activeCompanyId: appData.activeCompanyId });
});

// =========================================================================
// RUTAS OPERATIVAS (AISLADAS POR EMPRESA VIA resolveCompany)
// =========================================================================

// 1. Estado del cliente WhatsApp de la empresa seleccionada
app.get('/api/status', resolveCompany, (req, res) => {
    const holder = companyClients.get(req.companyId);
    res.json({
        companyId: req.company.id,
        companyName: req.company.name,
        status: holder ? holder.status : 'disconnected',
        qrCode: holder ? holder.qrCode : null,
        clientInfo: holder ? holder.clientInfo : null,
        botEnabled: req.company.settings.botEnabled,
        rulesCount: (req.company.rules || []).length,
        leadsCount: (req.company.leads || []).length,
        pendingSchedulesCount: (req.company.schedules || []).filter(s => s.status === 'pending').length
    });
});

// 2. Subida de Archivos
app.post('/api/upload', (req, res) => {
    try {
        const { filename, mimetype, data, folder } = req.body;
        if (!filename || !data) {
            return res.status(400).json({ error: 'Faltan parámetros: filename y data (base64) son requeridos' });
        }

        const targetFolder = ['rules', 'quick', 'received'].includes(folder) ? folder : 'rules';
        const cleanName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const uniqueFilename = `${Date.now()}_${cleanName}`;
        const savePath = path.join(UPLOADS_DIR, targetFolder, uniqueFilename);

        const cleanBase64 = data.includes(';base64,') ? data.split(';base64,').pop() : data;
        const buffer = Buffer.from(cleanBase64, 'base64');
        fs.writeFileSync(savePath, buffer);

        const detectedMime = mimetype || mime.getType(savePath) || 'application/octet-stream';
        const fileUrl = `/uploads/${targetFolder}/${uniqueFilename}`;

        res.json({
            success: true,
            url: fileUrl,
            filename: cleanName,
            mimetype: detectedMime,
            size: buffer.length
        });
    } catch (e) {
        console.error('Error en /api/upload:', e);
        res.status(500).json({ error: e.message || 'Error al procesar el archivo subido' });
    }
});

// 3. Reiniciar cliente WhatsApp de la empresa seleccionada
app.post('/api/bot/restart', resolveCompany, async (req, res) => {
    try {
        await stopCompanyWhatsAppClient(req.companyId);
        initCompanyWhatsAppClient(req.companyId);
        res.json({ success: true, message: `Reiniciando cliente de WhatsApp para ${req.company.name}...` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Desvincular / Cerrar sesión de WhatsApp de la empresa para permitir vincular un número nuevo
app.post('/api/bot/disconnect', resolveCompany, async (req, res) => {
    try {
        await stopCompanyWhatsAppClient(req.companyId);
        const authClientId = (req.companyId === 'default') ? null : req.companyId;
        const sessionDir = path.join(__dirname, '.wwebjs_auth', authClientId ? `session-${authClientId}` : 'session');
        if (fs.existsSync(sessionDir)) {
            try {
                fs.rmSync(sessionDir, { recursive: true, force: true });
            } catch (err) {
                console.warn('Aviso limpiando carpeta de sesión:', err.message);
            }
        }
        initCompanyWhatsAppClient(req.companyId);
        res.json({ success: true, message: `Sesión de WhatsApp cerrada para ${req.company.name}. Generando nuevo código QR...` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. Activar/Desactivar bot de la empresa seleccionada
app.post('/api/bot/toggle', resolveCompany, (req, res) => {
    req.company.settings.botEnabled = !req.company.settings.botEnabled;
    saveData(appData);
    res.json({ botEnabled: req.company.settings.botEnabled });
});

// 5. Enviar mensaje directo / prueba inmediata con el WhatsApp de la empresa seleccionada
app.post('/api/send', resolveCompany, async (req, res) => {
    const { phone, message, media } = req.body;
    if (!phone || (!message && !media)) {
        return res.status(400).json({ error: 'Faltan parámetros phone y (message o media)' });
    }

    const holder = companyClients.get(req.companyId);
    if (!holder || holder.status !== 'ready' || !holder.client) {
        return res.status(503).json({ error: `El WhatsApp de ${req.company.name} no está conectado todavía. Escanea el código QR primero.` });
    }

    try {
        const cleanPhone = phone.replace(/\D/g, '');
        const chatId = `${cleanPhone}@c.us`;
        let result;

        if (media && media.url) {
            const relPath = media.url.startsWith('/') ? media.url.slice(1) : media.url;
            const fullPath = path.join(__dirname, 'public', relPath);
            let mediaInstance = null;

            if (fs.existsSync(fullPath)) {
                mediaInstance = MessageMedia.fromFilePath(fullPath);
            } else if (media.url.startsWith('http')) {
                mediaInstance = await MessageMedia.fromUrl(media.url);
            }

            if (mediaInstance) {
                result = await holder.client.sendMessage(chatId, mediaInstance, { caption: message || undefined });
            } else {
                result = await holder.client.sendMessage(chatId, message || '');
            }
        } else {
            result = await holder.client.sendMessage(chatId, message);
        }

        res.json({ success: true, message: `Mensaje entregado a ${cleanPhone}`, id: result.id?._serialized });
    } catch (err) {
        console.error('Error enviando mensaje directo:', err);
        res.status(500).json({ error: err.message || 'Error al enviar el mensaje' });
    }
});

// 6. CRUD de Reglas / Rutas de Respuesta de la empresa seleccionada
app.get('/api/rules', resolveCompany, (req, res) => {
    res.json(req.company.rules || []);
});

app.post('/api/rules', resolveCompany, async (req, res) => {
    const { name, triggers, response, matchType, leadTag, pauseBot, triggerType, mediaTypeFilter, media, parentRuleId } = req.body;
    if (!name || (!response && !media)) {
        return res.status(400).json({ error: 'Campos requeridos: name y (response o archivo adjunto)' });
    }

    const newRule = {
        id: 'rule-' + Date.now(),
        name,
        enabled: true,
        parentRuleId: parentRuleId || null,
        triggerType: triggerType || 'text',
        mediaTypeFilter: mediaTypeFilter || 'any',
        matchType: matchType || 'contains_any',
        triggers: Array.isArray(triggers) ? triggers : (triggers ? triggers.split(',').map(s => s.trim()) : []),
        response: response || '',
        media: media || null,
        leadTag: leadTag || 'Interesado',
        pauseBot: Boolean(pauseBot)
    };

    if (!req.company.rules) req.company.rules = [];
    req.company.rules.push(newRule);
    saveData(appData);
    await dataStore.saveRuleInDb(req.companyId, newRule).catch(e => console.error('Error guardando regla en DB:', e));

    res.json(newRule);
});

app.put('/api/rules/:id', resolveCompany, async (req, res) => {
    if (!req.company.rules) req.company.rules = [];
    const index = req.company.rules.findIndex(r => r.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Regla no encontrada' });

    const updatedParentRuleId = req.body.parentRuleId !== undefined 
        ? (req.body.parentRuleId || null) 
        : req.company.rules[index].parentRuleId;

    req.company.rules[index] = { 
        ...req.company.rules[index], 
        ...req.body, 
        parentRuleId: updatedParentRuleId,
        id: req.params.id 
    };
    saveData(appData);
    await dataStore.saveRuleInDb(req.companyId, req.company.rules[index]).catch(e => console.error('Error actualizando regla en DB:', e));

    res.json(req.company.rules[index]);
});

app.delete('/api/rules/:id', resolveCompany, async (req, res) => {
    if (!req.company.rules) req.company.rules = [];
    req.company.rules = req.company.rules.filter(r => r.id !== req.params.id);
    saveData(appData);
    await dataStore.deleteRuleFromDb(req.companyId, req.params.id).catch(e => console.error('Error eliminando regla en DB:', e));

    res.json({ success: true });
});

// 7. CRUD de Programación de Envíos de la empresa seleccionada
app.get('/api/schedules', resolveCompany, (req, res) => {
    res.json(req.company.schedules || []);
});

app.post('/api/schedules', resolveCompany, async (req, res) => {
    const { name, recipient, message, scheduledTime, media } = req.body;
    if (!recipient || (!message && !media) || !scheduledTime) {
        return res.status(400).json({ error: 'recipient, scheduledTime y (message o media) son obligatorios' });
    }

    const newSchedule = {
        id: 'sched-' + Date.now(),
        name: name || 'Campaña sin título',
        recipient: recipient.replace(/\D/g, ''),
        message: message || '',
        media: media || null,
        scheduledTime,
        status: 'pending',
        createdAt: new Date().toISOString()
    };

    if (!req.company.schedules) req.company.schedules = [];
    req.company.schedules.unshift(newSchedule);
    saveData(appData);
    await dataStore.saveScheduleInDb(req.companyId, newSchedule).catch(e => console.error('Error guardando envío en DB:', e));

    res.json(newSchedule);
});

app.delete('/api/schedules/:id', resolveCompany, async (req, res) => {
    if (!req.company.schedules) req.company.schedules = [];
    req.company.schedules = req.company.schedules.filter(s => s.id !== req.params.id);
    saveData(appData);
    await dataStore.deleteScheduleFromDb(req.companyId, req.params.id).catch(e => console.error('Error eliminando envío en DB:', e));

    res.json({ success: true });
});

app.post('/api/schedules/:id/send-now', resolveCompany, async (req, res) => {
    if (!req.company.schedules) req.company.schedules = [];
    const item = req.company.schedules.find(s => s.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Envío no encontrado' });

    const holder = companyClients.get(req.companyId);
    if (!holder || holder.status !== 'ready' || !holder.client) {
        return res.status(503).json({ error: `WhatsApp de ${req.company.name} no está conectado aún.` });
    }

    try {
        const cleanPhone = item.recipient.replace(/\D/g, '');
        const chatId = `${cleanPhone}@c.us`;

        if (item.media && item.media.url) {
            const relPath = item.media.url.startsWith('/') ? item.media.url.slice(1) : item.media.url;
            const fullPath = path.join(__dirname, 'public', relPath);
            let mediaInstance = null;
            if (fs.existsSync(fullPath)) {
                mediaInstance = MessageMedia.fromFilePath(fullPath);
            }
            if (mediaInstance) {
                await holder.client.sendMessage(chatId, mediaInstance, { caption: item.message || undefined });
            } else {
                await holder.client.sendMessage(chatId, item.message || '');
            }
        } else {
            await holder.client.sendMessage(chatId, item.message);
        }

        item.status = 'sent';
        item.sentAt = new Date().toISOString();
        saveData(appData);
        await dataStore.saveScheduleInDb(req.companyId, item).catch(e => console.error('Error actualizando envío en DB:', e));

        res.json({ success: true, message: 'Mensaje enviado de inmediato' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 8. Leads / Contactos y Archivos de la empresa seleccionada
app.get('/api/leads', resolveCompany, (req, res) => {
    res.json(req.company.leads || []);
});

app.post('/api/leads/:phone/toggle-pause', resolveCompany, async (req, res) => {
    if (!req.company.leads) req.company.leads = [];
    const lead = req.company.leads.find(l => l.phone === req.params.phone);
    if (!lead) return res.status(404).json({ error: 'Contacto no encontrado' });

    lead.humanPaused = !lead.humanPaused;
    saveData(appData);
    await dataStore.upsertLeadInDb(req.companyId, lead).catch(e => console.error('Error actualizando pausa de lead en DB:', e));

    res.json({ success: true, humanPaused: lead.humanPaused });
});

// 9. Simulador en Vivo de la empresa seleccionada
const simulatorLastSentRuleId = new Map(); // Map<companyId, lastSentRuleId>

app.post('/api/simulate', resolveCompany, async (req, res) => {
    const rawText = (req.body.text || '').trim();
    const text = rawText.toLowerCase();
    const hasMedia = Boolean(req.body.hasMedia);
    const mediaMimetype = req.body.mediaMimetype || (hasMedia ? 'image/jpeg' : '');
    const audio = req.body.audio;

    const isAudioSim = Boolean(audio || (mediaMimetype && (mediaMimetype.startsWith('audio/') || mediaMimetype.includes('ogg'))));

    const currentLastSent = simulatorLastSentRuleId.get(req.companyId) || null;
    const context = { lastSentRuleId: currentLastSent };
    const matched = matchRule(text, req.company.rules || [], hasMedia || isAudioSim, mediaMimetype || (isAudioSim ? 'audio/ogg' : ''), context);

    if (matched) {
        simulatorLastSentRuleId.set(req.companyId, matched.id);
        res.json({
            matched: true,
            ruleName: matched.name,
            response: matched.response,
            media: matched.media || null,
            leadTag: matched.leadTag,
            pauseBot: matched.pauseBot
        });
    } else if (req.company.settings.geminiEnabled !== false && geminiService.isConfigured() && libraryService.hasActiveKnowledge(req.company.library) && (rawText || audio)) {
        simulatorLastSentRuleId.set(req.companyId, 'gemini');
        try {
            const businessName = req.company.settings.businessName || req.company.name || 'Mi Negocio';
            const geminiInput = audio ? {
                text: rawText,
                audio: audio
            } : rawText;

            const sessionKey = `sim_${req.companyId}`;
            const aiReply = await geminiService.sendMessage(sessionKey, geminiInput, businessName, req.company.library || []);
            res.json({
                matched: false,
                isGemini: true,
                response: aiReply
            });
        } catch (err) {
            console.error('Error en simulador con Gemini:', err.message);
            res.json({
                matched: false,
                response: req.company.settings.fallbackMessage || 'El bot no tiene una respuesta configurada para este mensaje.'
            });
        }
    } else {
        simulatorLastSentRuleId.set(req.companyId, 'fallback');
        res.json({
            matched: false,
            response: req.company.settings.fallbackMessage || 'El bot no tiene una respuesta configurada para este mensaje.'
        });
    }
});

// Reinicio de sesión de Gemini
app.post('/api/gemini/reset', resolveCompany, (req, res) => {
    const sessionId = req.body.sessionId || `sim_${req.companyId}`;
    geminiService.resetSession(sessionId);
    if (sessionId === `sim_${req.companyId}` || sessionId === 'simulator-session') {
        simulatorLastSentRuleId.delete(req.companyId);
    }
    res.json({ success: true, message: `Sesión de ${sessionId} reiniciada.` });
});

app.get('/api/gemini/status', (req, res) => {
    res.json({
        configured: geminiService.isConfigured(),
        model: 'gemini-2.5-flash',
        supportsAudio: true
    });
});

// 10. Configuración General de la empresa seleccionada
app.get('/api/settings', resolveCompany, (req, res) => {
    res.json(req.company.settings || {});
});

app.post('/api/settings', resolveCompany, async (req, res) => {
    req.company.settings = { ...req.company.settings, ...req.body };
    if (req.body.businessName) {
        req.company.name = req.body.businessName;
    }
    saveData(appData);
    await dataStore.saveCompanySettingsInDb(req.companyId, req.company.settings).catch(e => console.error('Error guardando configuración en DB:', e));

    res.json(req.company.settings);
});

// 11. Biblioteca de Contexto de la empresa seleccionada
app.get('/api/library', resolveCompany, (req, res) => {
    req.company.library = req.company.library || [];
    const stats = libraryService.getActiveLibraryContext(req.company.library);
    res.json({
        documents: req.company.library,
        hasActiveKnowledge: libraryService.hasActiveKnowledge(req.company.library),
        stats: {
            totalDocuments: req.company.library.length,
            activeDocuments: stats.activeCount,
            totalWords: stats.totalWords
        }
    });
});

app.post('/api/library/upload', resolveCompany, async (req, res) => {
    const { filename, data } = req.body;
    if (!filename || !data) {
        return res.status(400).json({ error: 'Faltan parámetros filename o data (base64)' });
    }

    try {
        const rawBase64 = data.includes('base64,') ? data.split('base64,')[1] : data;
        const buffer = Buffer.from(rawBase64, 'base64');
        const customTitle = (req.body.name || '').trim();
        console.log(`[${req.company.name}] 📚 Procesando documento para biblioteca: "${filename}" (${buffer.length} bytes)...`);
        
        const markdown = await libraryService.convertToMarkdown(buffer, filename);
        const stats = libraryService.calculateStats(markdown);

        const docId = 'doc_' + Date.now();
        libraryService.saveMarkdownFile(docId, markdown);

        const newDoc = {
            id: docId,
            name: customTitle || filename.replace(/\.[^/.]+$/, ""),
            originalFilename: filename,
            wordCount: stats.wordCount,
            charCount: stats.charCount,
            size: buffer.length,
            createdAt: new Date().toISOString(),
            active: true
        };

        if (!req.company.library) req.company.library = [];
        req.company.library.unshift(newDoc);
        saveData(appData);
        await dataStore.saveLibraryDocInDb(req.companyId, newDoc).catch(e => console.error('Error guardando doc en DB:', e));

        geminiService.clearAllSessions();

        console.log(`[${req.company.name}] ✅ Documento "${filename}" convertido a Markdown limpio (${stats.wordCount} palabras).`);
        res.json({
            success: true,
            document: newDoc,
            preview: markdown.slice(0, 500)
        });
    } catch (err) {
        console.error('Error procesando archivo para biblioteca:', err);
        res.status(500).json({ error: err.message || 'Error procesando el archivo' });
    }
});

app.get('/api/library/:id', resolveCompany, (req, res) => {
    req.company.library = req.company.library || [];
    const doc = req.company.library.find(d => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

    const content = libraryService.getMarkdownContent(doc.id);
    res.json({ document: doc, content });
});

app.put('/api/library/:id', resolveCompany, async (req, res) => {
    req.company.library = req.company.library || [];
    const doc = req.company.library.find(d => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

    const { content, name, active } = req.body;
    if (content !== undefined) {
        libraryService.saveMarkdownFile(doc.id, content);
        const stats = libraryService.calculateStats(content);
        doc.wordCount = stats.wordCount;
        doc.charCount = stats.charCount;
    }
    if (name !== undefined) doc.name = name;
    if (active !== undefined) doc.active = Boolean(active);

    doc.updatedAt = new Date().toISOString();
    saveData(appData);
    await dataStore.saveLibraryDocInDb(req.companyId, doc).catch(e => console.error('Error actualizando doc en DB:', e));
    geminiService.clearAllSessions();

    res.json({ success: true, document: doc });
});

app.delete('/api/library/:id', resolveCompany, async (req, res) => {
    req.company.library = req.company.library || [];
    const index = req.company.library.findIndex(d => d.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Documento no encontrado' });

    libraryService.deleteMarkdownFile(req.params.id);
    req.company.library.splice(index, 1);
    saveData(appData);
    await dataStore.deleteLibraryDocFromDb(req.companyId, req.params.id).catch(e => console.error('Error eliminando doc en DB:', e));
    geminiService.clearAllSessions();

    res.json({ success: true });
});

app.post('/api/library/:id/toggle', resolveCompany, async (req, res) => {
    req.company.library = req.company.library || [];
    const doc = req.company.library.find(d => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

    doc.active = !doc.active;
    saveData(appData);
    await dataStore.saveLibraryDocInDb(req.companyId, doc).catch(e => console.error('Error actualizando toggle doc en DB:', e));
    geminiService.clearAllSessions();

    res.json({ success: true, active: doc.active });
});

// =========================================================================
// INICIAR SERVIDOR WEB Y CLIENTES MULTI-EMPRESA CON POSTGRESQL
// =========================================================================

app.listen(PORT, async () => {
    try {
        await initDb();
        const dbData = await dataStore.loadAllAppData();
        if (dbData && dbData.companies && dbData.companies.length > 0) {
            appData = dbData;
            console.log(`🗄️ Datos cargados exitosamente desde PostgreSQL (${appData.companies.length} empresas registradas)`);
        }
    } catch (err) {
        console.error('⚠️ Aviso cargando datos iniciales de PostgreSQL:', err.message);
    }

    console.log(`======================================================`);
    console.log(`🚀 Panel Visual del Bot de Ventas Multi-Empresa corriendo en:`);
    console.log(`👉 http://localhost:${PORT}`);
    console.log(`🏢 Empresas registradas: ${appData.companies.length} (Activa: ${appData.companies.find(c => c.id === appData.activeCompanyId)?.name || 'Default'})`);
    console.log(`======================================================`);
    initAllCompanyClients();
});

// Manejo de apagado seguro (Graceful Shutdown)
let isShuttingDown = false;
async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n🛑 Señal ${signal} detectada. Cerrando instancias de WhatsApp de forma segura...`);
    const closePromises = [];
    for (const [compKey, holder] of companyClients.entries()) {
        if (holder && holder.client) {
            console.log(`Cerrando cliente de WhatsApp [${compKey}]...`);
            closePromises.push(holder.client.destroy().catch(e => console.warn(`Error cerrando cliente ${compKey}:`, e.message)));
        }
    }
    try {
        await Promise.all(closePromises);
    } catch (e) {}
    console.log('✅ Clientes cerrados correctamente. Servidor detenido.');
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
