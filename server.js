const path = require('path');
const fs = require('fs');
const express = require('express');
const QRCode = require('qrcode');
const mime = require('mime');
const { Client, LocalAuth, MessageMedia } = require('./index');
const geminiService = require('./geminiService');
const libraryService = require('./libraryService');

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
app.use(express.static(path.join(__dirname, 'public')));

// Estado global del cliente WhatsApp
let clientStatus = 'initializing'; // initializing, qr_ready, authenticated, ready, disconnected
let currentQrDataUrl = null;
let clientInfo = null;

// Cargar o inicializar datos de persistencia
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (!parsed.library) parsed.library = [];
            return parsed;
        }
    } catch (e) {
        console.error('Error al cargar datos:', e);
    }
    return {
        settings: {
            businessName: "Mi Negocio",
            botEnabled: true,
            simulateTyping: true,
            typingDelaySeconds: 2,
            ignoreGroups: true,
            fallbackMessage: "Escribe *menu* para ver las opciones disponibles."
        },
        rules: [],
        schedules: [],
        leads: []
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

// Inicializar cliente de WhatsApp
let client = null;

function initWhatsAppClient() {
    console.log('Iniciando cliente WhatsApp...');
    clientStatus = 'initializing';
    currentQrDataUrl = null;

    client = new Client({
        authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.wwebjs_auth') }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    client.on('qr', async (qr) => {
        console.log('Nuevo código QR recibido');
        clientStatus = 'qr_ready';
        try {
            currentQrDataUrl = await QRCode.toDataURL(qr, {
                width: 320,
                margin: 2,
                color: { dark: '#0b141a', light: '#ffffff' }
            });
        } catch (err) {
            console.error('Error generando QR DataURL:', err);
        }
    });

    client.on('authenticated', () => {
        console.log('Cliente autenticado correctamente');
        clientStatus = 'authenticated';
        currentQrDataUrl = null;
    });

    client.on('auth_failure', (msg) => {
        console.error('Fallo de autenticación:', msg);
        clientStatus = 'auth_failure';
    });

    client.on('ready', async () => {
        console.log('Cliente WhatsApp LISTO para enviar y recibir mensajes y archivos');
        clientStatus = 'ready';
        currentQrDataUrl = null;
        try {
            clientInfo = {
                pushname: client.info.pushname || 'Bot',
                wid: client.info.wid.user,
                platform: client.info.platform
            };
        } catch (e) {
            clientInfo = { pushname: 'Bot', wid: 'Conectado' };
        }
    });

    client.on('disconnected', (reason) => {
        console.log('Cliente desconectado:', reason);
        clientStatus = 'disconnected';
        clientInfo = null;
        currentQrDataUrl = null;
    });

    client.on('message', async (msg) => {
        try {
            await handleIncomingMessage(msg);
        } catch (err) {
            console.error('Error procesando mensaje entrante:', err);
        }
    });

    client.initialize().catch((err) => {
        console.error('Error en client.initialize():', err);
        clientStatus = 'error';
    });
}

// Limpieza de leyenda de mensaje (evita que miniaturas base64 se interpreten como texto)
function getCleanCaption(body) {
    if (!body || typeof body !== 'string') return '';
    const trimmed = body.trim();
    if (trimmed.startsWith('/9j/') || trimmed.startsWith('data:image') || (!trimmed.includes(' ') && trimmed.length > 80)) {
        return '';
    }
    return trimmed;
}

// Lógica del Bot de Ventas al recibir un mensaje (Texto o Archivo/Nota de voz)
async function handleIncomingMessage(msg) {
    if (!appData.settings.botEnabled) return;
    if (msg.fromMe) return;

    // Ignorar mensajes de grupos si está configurado
    if (appData.settings.ignoreGroups && msg.from.includes('@g.us')) return;

    const senderPhone = msg.from.replace('@c.us', '').replace('@g.us', '');
    const cleanText = getCleanCaption(msg.body);
    const text = cleanText.toLowerCase();

    // 1. Detectar si es mensaje de voz / audio o archivo adjunto
    const isAudioType = msg.type === 'ptt' || msg.type === 'audio';
    const hasMedia = Boolean(msg.hasMedia || isAudioType);

    let receivedMedia = null;
    let rawAudioMedia = null;

    if (hasMedia) {
        try {
            console.log(`📥 Descargando archivo recibido de ${senderPhone}... (tipo: ${msg.type})`);

            // Reintentos automáticos para asegurar que WhatsApp Web haya completado la descarga/desencriptado
            let downloaded = null;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    downloaded = await msg.downloadMedia();
                    if (downloaded && downloaded.data) break;
                } catch (e) {
                    console.warn(`Intento ${attempt + 1} de descarga de media:`, e.message);
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
                console.log(`✅ Archivo recibido guardado: ${receivedMedia.url} (${downloaded.mimetype})`);

                const isAudio = isAudioType || (downloaded.mimetype || '').startsWith('audio/') || (downloaded.mimetype || '').includes('ogg');
                if (isAudio) {
                    rawAudioMedia = {
                        data: downloaded.data,
                        mimetype: downloaded.mimetype || 'audio/ogg; codecs=opus'
                    };
                }
            } else {
                console.warn(`⚠️ No se pudo descargar el archivo adjunto de ${senderPhone}`);
            }
        } catch (err) {
            console.error('Error descargando archivo adjunto de WhatsApp:', err);
        }
    }

    // Si era nota de voz y falló la descarga
    if (isAudioType && !rawAudioMedia) {
        console.warn(`⚠️ La nota de voz de ${senderPhone} no se pudo procesar.`);
        if (appData.settings.fallbackMessage) {
            await msg.reply('Disculpa, no pude escuchar tu nota de voz en este momento. ¿Podrías enviarla nuevamente o escribir tu consulta en texto?');
        }
        return;
    }

    // Si no hay texto ni archivo recibido, nada por hacer
    if (!text && !receivedMedia && !rawAudioMedia) return;

    // 2. Buscar o registrar lead / prospecto
    let lead = appData.leads.find(l => l.phone === senderPhone);
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
        appData.leads.unshift(lead);
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

    // Si el contacto está pausado por atención humana
    if (lead.humanPaused) {
        console.log(`Mensaje recibido de ${senderPhone}, pero el bot está pausado para este contacto (atención humana).`);
        saveData(appData);
        return;
    }

    // 3. Buscar regla coincidente (considerando texto y/o tipo de archivo y contexto del último mensaje del bot)
    const hasMediaFlag = Boolean(receivedMedia);
    const mediaMimetype = receivedMedia ? receivedMedia.mimetype : (isAudioType ? 'audio/ogg' : '');
    const context = { lastSentRuleId: lead ? lead.lastSentRuleId : null };
    const matchedRule = matchRule(text, appData.rules, hasMediaFlag, mediaMimetype, context);

    if (matchedRule) {
        console.log(`Regla activada: "${matchedRule.name}" para contacto ${senderPhone}`);

        if (matchedRule.leadTag) {
            lead.tag = matchedRule.leadTag;
        }

        if (matchedRule.pauseBot) {
            lead.humanPaused = true;
            console.log(`Bot pausado para ${senderPhone} debido a la regla "${matchedRule.name}".`);
        }

        lead.lastSentRuleId = matchedRule.id;
        saveData(appData);

        // Simular escritura natural
        if (appData.settings.simulateTyping) {
            try {
                const chat = await msg.getChat();
                await chat.sendStateTyping();
                const delayMs = (appData.settings.typingDelaySeconds || 2) * 1000;
                await new Promise(r => setTimeout(r, delayMs));
                await chat.clearStateTyping();
            } catch (e) {}
        }

        // 4. Enviar respuesta (Con archivo adjunto si la regla lo especifica)
        await sendRuleResponse(msg, matchedRule);

    } else if (appData.settings.geminiEnabled !== false && geminiService.isConfigured() && (text.length > 0 || rawAudioMedia)) {
        saveData(appData);
        if (rawAudioMedia) {
            console.log(`🎙️ Escuchando y procesando nota de voz de ${senderPhone} con Gemini...`);
        } else {
            console.log(`🤖 Usando Gemini para responder a ${senderPhone}...`);
        }

        let chat = null;
        try {
            if (appData.settings.simulateTyping) {
                try {
                    chat = await msg.getChat();
                    await chat.sendStateTyping();
                } catch (e) {}
            }

            const businessName = appData.settings.businessName || 'Mi Negocio';
            const geminiInput = rawAudioMedia ? {
                text: cleanText,
                audio: rawAudioMedia
            } : cleanText;

            const aiReply = await geminiService.sendMessage(senderPhone, geminiInput, businessName, appData.library || []);

            if (chat) {
                try {
                    await chat.clearStateTyping();
                } catch (e) {}
            }

            if (aiReply) {
                await msg.reply(aiReply);
                console.log(`✅ Respuesta de Gemini enviada a ${senderPhone}`);

                if (lead) {
                    lead.lastMessage = isAudioMsg 
                        ? `🎤 [Nota de voz]: "${aiReply.replace(/\n/g, ' ').slice(0, 70)}..."`
                        : aiReply.replace(/\n/g, ' ').slice(0, 70);
                    lead.lastInteraction = new Date().toISOString();
                    lead.lastSentRuleId = 'gemini';
                    saveData(appData);
                }
            }
        } catch (geminiErr) {
            console.error('Error al responder con Gemini:', geminiErr.message || geminiErr);
            if (chat) {
                try { await chat.clearStateTyping(); } catch (e) {}
            }
            if (appData.settings.fallbackMessage) {
                await msg.reply(appData.settings.fallbackMessage);
                if (lead) {
                    lead.lastSentRuleId = 'fallback';
                    saveData(appData);
                }
            }
        }

    } else if (appData.settings.fallbackMessage && (text.length > 1 || hasMediaFlag)) {
        if (lead) {
            lead.lastSentRuleId = 'fallback';
        }
        saveData(appData);
        if (appData.settings.simulateTyping) {
            try {
                const chat = await msg.getChat();
                await chat.sendStateTyping();
                await new Promise(r => setTimeout(r, 1500));
                await chat.clearStateTyping();
            } catch (e) {}
        }
        await msg.reply(appData.settings.fallbackMessage);
    } else {
        saveData(appData);
    }
}

// Función auxiliar para responder con texto y/o archivo adjunto
async function sendRuleResponse(msg, rule) {
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

    if (mediaToSend) {
        console.log(`📤 Enviando archivo adjunto "${rule.media.filename || 'archivo'}" a ${msg.from}...`);
        await client.sendMessage(msg.from, mediaToSend, {
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
 * Evalúa si un trigger (palabra clave o número de opción) coincide con el texto del mensaje.
 * - Si el trigger es puramente numérico (ej: "3", "1", "2"):
 *   Representa una opción de menú/submenú y SOLAMENTE coincide si:
 *   1) El último mensaje enviado al usuario corresponde a la regla padre (rule.parentRuleId o por defecto 'rule-welcome').
 *   2) El usuario escribió ese número solo (ej: "3", "3.", "#3", "opcion 3", "el 3", "3️⃣").
 *   NUNCA se activa si el bot no envió previamente ese menú específico (ej: si el chatbot preguntó cantidades "3"
 *   o si está en medio de una conversación general o en otro submenú diferente), ni si forma parte de otro número ("365", "30").
 * - Si el trigger es texto (ej: "pagos", "nequi", "como pago", "suscripciones"):
 *   Evalúa según el matchType ('exact', 'starts_with', 'contains_any') respetando límites de palabra
 *   y normalizando tildes para evitar falsos positivos (ej: 'pago' no se activa con 'apagon').
 */
function checkTriggerMatch(text, trigger, matchType = 'contains_any', context = {}, rule = {}) {
    const rawText = (text || '').trim();
    const rawTrigger = (trigger || '').trim();
    if (!rawText || !rawTrigger) return false;

    // Normalizar espacios múltiples
    const lowerText = rawText.toLowerCase().replace(/\s+/g, ' ');
    const lowerTrigger = rawTrigger.toLowerCase().replace(/\s+/g, ' ');

    // Caso 1: El trigger es un número puro (ej: '1', '2', '3', etc.)
    const isNumericTrigger = /^\d+$/.test(lowerTrigger);

    if (isNumericTrigger) {
        // REGLA FUNDAMENTAL DE SUBMENÚS:
        // Si la regla tiene un parentRuleId definido, SOLAMENTE coincide si el último mensaje del bot fue esa regla padre.
        // Si la regla NO tiene parentRuleId, por compatibilidad con menús principales requiere 'rule-welcome'.
        const requiredParentId = rule.parentRuleId || 'rule-welcome';
        if (!context || context.lastSentRuleId !== requiredParentId) {
            return false;
        }

        // A. Mensaje que contiene solo el número (limpiando posibles signos comunes como #, ., !, ?, paréntesis, emojis)
        // Por ejemplo: '3', ' 3 ', '3.', '#3', '(3)', '3!', '3️⃣'
        const cleanNoEmojis = lowerText.replace(/[\uFE0F\u20E3]/g, '');
        const cleanNoPunct = cleanNoEmojis.replace(/^[#\s([<]+|[.\s!?:)\]>]+$/g, '');
        if (cleanNoPunct === lowerTrigger) return true;

        // B. Elección explícita de la opción del menú (ej: 'opcion 3', 'opción 3', 'el 3', 'la 3', 'numero 3', 'n° 3')
        const escaped = escapeRegExp(lowerTrigger);
        const menuOptionRegex = new RegExp(
            '^(?:(?:hola|buenas|por\\s+favor)?\\s*(?:opci[oó]n|n[uú]mero|num|n°|no\\.?|item|el|la)?\\s*#?\\s*)' +
            escaped +
            '[.\\s!?:)]*$',
            'iu'
        );
        if (menuOptionRegex.test(cleanNoEmojis)) return true;

        // Si no es el número solo ni opción explícita (ej: 'office 365', 'tienen office 365?', '365 días'), NO coincide.
        return false;
    }

    // Caso 2: Palabras clave de texto. Normalización de tildes (ej: 'catalogo' coincide con 'catálogo')
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

    // Default: 'contains_any'
    // Comprobamos con límites de palabra para evitar falsos positivos
    // (ej: 'pago' no debe coincidir con 'apagon', pero 'como pago' sí debe coincidir con 'hola como pago')
    const escaped = escapeRegExp(normTrigger);
    const wordBoundaryRegex = new RegExp('(?<![\\p{L}\\p{N}])' + escaped + '(?![\\p{L}\\p{N}])', 'iu');
    return wordBoundaryRegex.test(normText);
}

// Algoritmo de coincidencia de reglas (Soporta Texto, Archivos o Ambos con Contexto de Estado de Conversación y Submenús)
function matchRule(text, rules, hasMedia = false, mediaMimetype = '', context = {}) {
    const activeRules = rules.filter(r => r.enabled !== false);
    const isAudioMedia = mediaMimetype.startsWith('audio/') || mediaMimetype.includes('ogg');
    const lastSentRuleId = context.lastSentRuleId || null;

    // Prioridad 1: Reglas contextuales cuyo parentRuleId coincide exactamente con el último menú enviado (submenús)
    // Prioridad 2: Reglas globales
    const sortedRules = [...activeRules].sort((a, b) => {
        const aMatchesContext = Boolean(a.parentRuleId && a.parentRuleId === lastSentRuleId);
        const bMatchesContext = Boolean(b.parentRuleId && b.parentRuleId === lastSentRuleId);
        if (aMatchesContext && !bMatchesContext) return -1;
        if (!aMatchesContext && bMatchesContext) return 1;
        return 0;
    });

    for (const rule of sortedRules) {
        const triggerType = rule.triggerType || 'text'; // 'text', 'media', 'both'

        // A. Coincidencia por archivo recibido
        if (hasMedia && (triggerType === 'media' || triggerType === 'both' || rule.matchType === 'on_media')) {
            const filter = rule.mediaTypeFilter || 'any'; // 'any', 'image', 'document', 'audio'
            let mediaMatches = false;

            if (filter === 'any') {
                if (!isAudioMedia) {
                    mediaMatches = true;
                }
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
                if (!triggers.length || !text) {
                    return rule;
                }
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

// Motor de Programación de Mensajes (Revisa cada 10 segundos)
setInterval(async () => {
    if (clientStatus !== 'ready' || !client) return;

    const now = new Date();
    let hasChanges = false;

    for (const item of appData.schedules) {
        if (item.status === 'pending') {
            const scheduledDate = new Date(item.scheduledTime);
            if (scheduledDate <= now) {
                console.log(`⏰ Ejecutando envío programado a ${item.recipient}: "${(item.message || '').slice(0, 30)}..."`);
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
                            await client.sendMessage(chatId, mediaInstance, { caption: item.message || undefined });
                        } else {
                            await client.sendMessage(chatId, item.message || '');
                        }
                    } else {
                        await client.sendMessage(chatId, item.message);
                    }

                    item.status = 'sent';
                    item.sentAt = new Date().toISOString();
                    console.log(`✅ Envío programado exitoso a ${cleanPhone}`);
                } catch (err) {
                    console.error(`❌ Error en envío programado a ${item.recipient}:`, err);
                    item.status = 'failed';
                    item.error = err.message || 'Error al enviar';
                }
                hasChanges = true;
            }
        }
    }

    if (hasChanges) {
        saveData(appData);
    }
}, 10000);

// --- RUTAS DE API ---

// 1. Estado del cliente WhatsApp
app.get('/api/status', (req, res) => {
    res.json({
        status: clientStatus,
        qrCode: currentQrDataUrl,
        clientInfo,
        botEnabled: appData.settings.botEnabled,
        rulesCount: appData.rules.length,
        leadsCount: appData.leads.length,
        pendingSchedulesCount: appData.schedules.filter(s => s.status === 'pending').length
    });
});

// 2. Subida de Archivos (Para enviar en rutas, campañas o envío rápido)
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

        // Remover encabezado "data:*/*;base64," si viene del FileReader
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

// 3. Reiniciar o reconectar cliente
app.post('/api/bot/restart', async (req, res) => {
    try {
        if (client) {
            await client.destroy().catch(() => {});
        }
        initWhatsAppClient();
        res.json({ success: true, message: 'Reiniciando cliente...' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. Activar/Desactivar bot general
app.post('/api/bot/toggle', (req, res) => {
    appData.settings.botEnabled = !appData.settings.botEnabled;
    saveData(appData);
    res.json({ botEnabled: appData.settings.botEnabled });
});

// 5. Enviar mensaje directo / prueba inmediata (con soporte de archivo adjunto)
app.post('/api/send', async (req, res) => {
    const { phone, message, media } = req.body;
    if (!phone || (!message && !media)) {
        return res.status(400).json({ error: 'Faltan parámetros phone y (message o media)' });
    }

    if (clientStatus !== 'ready' || !client) {
        return res.status(503).json({ error: 'WhatsApp no está conectado todavía. Escanea el código QR primero.' });
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
                result = await client.sendMessage(chatId, mediaInstance, { caption: message || undefined });
            } else {
                result = await client.sendMessage(chatId, message || '');
            }
        } else {
            result = await client.sendMessage(chatId, message);
        }

        res.json({ success: true, message: `Mensaje entregado a ${cleanPhone}`, id: result.id?._serialized });
    } catch (err) {
        console.error('Error enviando mensaje directo:', err);
        res.status(500).json({ error: err.message || 'Error al enviar el mensaje' });
    }
});

// 6. CRUD de Reglas / Rutas de Respuesta (con soporte para archivos adjuntos y triggers de medios)
app.get('/api/rules', (req, res) => {
    res.json(appData.rules);
});

app.post('/api/rules', (req, res) => {
    const { name, triggers, response, matchType, leadTag, pauseBot, triggerType, mediaTypeFilter, media, parentRuleId } = req.body;
    if (!name || (!response && !media)) {
        return res.status(400).json({ error: 'Campos requeridos: name y (response o archivo adjunto)' });
    }

    const newRule = {
        id: 'rule-' + Date.now(),
        name,
        enabled: true,
        parentRuleId: parentRuleId || null,
        triggerType: triggerType || 'text', // 'text', 'media', 'both'
        mediaTypeFilter: mediaTypeFilter || 'any', // 'any', 'image', 'document', 'audio'
        matchType: matchType || 'contains_any',
        triggers: Array.isArray(triggers) ? triggers : (triggers ? triggers.split(',').map(s => s.trim()) : []),
        response: response || '',
        media: media || null, // { url, filename, mimetype, size }
        leadTag: leadTag || 'Interesado',
        pauseBot: Boolean(pauseBot)
    };

    appData.rules.push(newRule);
    saveData(appData);
    res.json(newRule);
});

app.put('/api/rules/:id', (req, res) => {
    const index = appData.rules.findIndex(r => r.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Regla no encontrada' });

    const updatedParentRuleId = req.body.parentRuleId !== undefined 
        ? (req.body.parentRuleId || null) 
        : appData.rules[index].parentRuleId;

    appData.rules[index] = { 
        ...appData.rules[index], 
        ...req.body, 
        parentRuleId: updatedParentRuleId,
        id: req.params.id 
    };
    saveData(appData);
    res.json(appData.rules[index]);
});

app.delete('/api/rules/:id', (req, res) => {
    appData.rules = appData.rules.filter(r => r.id !== req.params.id);
    saveData(appData);
    res.json({ success: true });
});

// 7. CRUD de Programación de Envíos
app.get('/api/schedules', (req, res) => {
    res.json(appData.schedules);
});

app.post('/api/schedules', (req, res) => {
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

    appData.schedules.unshift(newSchedule);
    saveData(appData);
    res.json(newSchedule);
});

app.delete('/api/schedules/:id', (req, res) => {
    appData.schedules = appData.schedules.filter(s => s.id !== req.params.id);
    saveData(appData);
    res.json({ success: true });
});

app.post('/api/schedules/:id/send-now', async (req, res) => {
    const item = appData.schedules.find(s => s.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Envío no encontrado' });

    if (clientStatus !== 'ready' || !client) {
        return res.status(503).json({ error: 'WhatsApp no está conectado aún' });
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
                await client.sendMessage(chatId, mediaInstance, { caption: item.message || undefined });
            } else {
                await client.sendMessage(chatId, item.message || '');
            }
        } else {
            await client.sendMessage(chatId, item.message);
        }

        item.status = 'sent';
        item.sentAt = new Date().toISOString();
        saveData(appData);
        res.json({ success: true, message: 'Mensaje enviado de inmediato' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 8. Leads / Contactos y Archivos Recibidos
app.get('/api/leads', (req, res) => {
    res.json(appData.leads);
});

app.post('/api/leads/:phone/toggle-pause', (req, res) => {
    const lead = appData.leads.find(l => l.phone === req.params.phone);
    if (!lead) return res.status(404).json({ error: 'Contacto no encontrado' });

    lead.humanPaused = !lead.humanPaused;
    saveData(appData);
    res.json({ success: true, humanPaused: lead.humanPaused });
});

// Variable en memoria para rastrear el estado de conversación del simulador en vivo
let simulatorLastSentRuleId = null;

// 9. Simulador en Vivo (Soporta texto, simulación de archivo recibido, notas de voz y Gemini AI)
app.post('/api/simulate', async (req, res) => {
    const rawText = (req.body.text || '').trim();
    const text = rawText.toLowerCase();
    const hasMedia = Boolean(req.body.hasMedia);
    const mediaMimetype = req.body.mediaMimetype || (hasMedia ? 'image/jpeg' : '');
    const audio = req.body.audio; // { data: base64, mimetype }

    const isAudioSim = Boolean(audio || (mediaMimetype && (mediaMimetype.startsWith('audio/') || mediaMimetype.includes('ogg'))));

    const context = { lastSentRuleId: simulatorLastSentRuleId };
    const matched = matchRule(text, appData.rules, hasMedia || isAudioSim, mediaMimetype || (isAudioSim ? 'audio/ogg' : ''), context);
    if (matched) {
        simulatorLastSentRuleId = matched.id;
        res.json({
            matched: true,
            ruleName: matched.name,
            response: matched.response,
            media: matched.media || null,
            leadTag: matched.leadTag,
            pauseBot: matched.pauseBot
        });
    } else if (appData.settings.geminiEnabled !== false && geminiService.isConfigured() && (rawText || audio)) {
        simulatorLastSentRuleId = 'gemini';
        try {
            const businessName = appData.settings.businessName || 'Mi Negocio';
            const geminiInput = audio ? {
                text: rawText,
                audio: audio
            } : rawText;

            const aiReply = await geminiService.sendMessage('simulator-session', geminiInput, businessName, appData.library || []);
            res.json({
                matched: false,
                isGemini: true,
                response: aiReply
            });
        } catch (err) {
            console.error('Error en simulador con Gemini:', err.message);
            res.json({
                matched: false,
                response: appData.settings.fallbackMessage || 'El bot no tiene una respuesta configurada para este mensaje.'
            });
        }
    } else {
        simulatorLastSentRuleId = 'fallback';
        res.json({
            matched: false,
            response: appData.settings.fallbackMessage || 'El bot no tiene una respuesta configurada para este mensaje.'
        });
    }
});

// Endpoint para reiniciar la sesión del simulador o de un contacto
app.post('/api/gemini/reset', (req, res) => {
    const sessionId = req.body.sessionId || 'simulator-session';
    geminiService.resetSession(sessionId);
    if (sessionId === 'simulator-session') {
        simulatorLastSentRuleId = null;
    }
    res.json({ success: true, message: `Sesión de ${sessionId} reiniciada.` });
});

// Endpoint de estado de Gemini
app.get('/api/gemini/status', (req, res) => {
    res.json({
        configured: geminiService.isConfigured(),
        model: 'gemini-3.5-flash-lite',
        supportsAudio: true
    });
});

// 10. Configuración General
app.get('/api/settings', (req, res) => {
    res.json(appData.settings);
});

app.post('/api/settings', (req, res) => {
    appData.settings = { ...appData.settings, ...req.body };
    saveData(appData);
    res.json(appData.settings);
});

// 11. Biblioteca de Contexto para Inteligencia Artificial (Conversión Word a Markdown)
app.get('/api/library', (req, res) => {
    appData.library = appData.library || [];
    const stats = libraryService.getActiveLibraryContext(appData.library);
    res.json({
        documents: appData.library,
        stats: {
            totalDocuments: appData.library.length,
            activeDocuments: stats.activeCount,
            totalWords: stats.totalWords
        }
    });
});

app.post('/api/library/upload', async (req, res) => {
    const { filename, data } = req.body;
    if (!filename || !data) {
        return res.status(400).json({ error: 'Faltan parámetros filename o data (base64)' });
    }

    try {
        const rawBase64 = data.includes('base64,') ? data.split('base64,')[1] : data;
        const buffer = Buffer.from(rawBase64, 'base64');
        const customTitle = (req.body.name || '').trim();
        console.log(`📚 Procesando documento subido: "${filename}" (${buffer.length} bytes)...`);
        
        // Convertir Word/texto a Markdown limpio sin etiquetas basura
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

        appData.library = appData.library || [];
        appData.library.unshift(newDoc);
        saveData(appData);

        // Reiniciar sesiones de Gemini para que tomen el nuevo contexto de inmediato
        geminiService.clearAllSessions();

        console.log(`✅ Documento "${filename}" convertido a Markdown limpio (${stats.wordCount} palabras).`);
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

app.get('/api/library/:id', (req, res) => {
    appData.library = appData.library || [];
    const doc = appData.library.find(d => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

    const content = libraryService.getMarkdownContent(doc.id);
    res.json({
        document: doc,
        content
    });
});

app.put('/api/library/:id', (req, res) => {
    appData.library = appData.library || [];
    const doc = appData.library.find(d => d.id === req.params.id);
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
    geminiService.clearAllSessions();

    res.json({ success: true, document: doc });
});

app.delete('/api/library/:id', (req, res) => {
    appData.library = appData.library || [];
    const index = appData.library.findIndex(d => d.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Documento no encontrado' });

    libraryService.deleteMarkdownFile(req.params.id);
    appData.library.splice(index, 1);
    saveData(appData);
    geminiService.clearAllSessions();

    res.json({ success: true });
});

app.post('/api/library/:id/toggle', (req, res) => {
    appData.library = appData.library || [];
    const doc = appData.library.find(d => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

    doc.active = !doc.active;
    saveData(appData);
    geminiService.clearAllSessions();

    res.json({ success: true, active: doc.active });
});

// Iniciar Servidor Web
app.listen(PORT, () => {
    console.log(`======================================================`);
    console.log(`🚀 Panel Visual del Bot de Ventas corriendo en:`);
    console.log(`👉 http://localhost:${PORT}`);
    console.log(`======================================================`);
    initWhatsAppClient();
});
