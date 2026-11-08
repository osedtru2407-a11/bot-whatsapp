const path = require('path');
const fs = require('fs');
const express = require('express');
const QRCode = require('qrcode');
const mime = require('mime');
const { Client, LocalAuth, MessageMedia } = require('./index');
const geminiService = require('./geminiService');
const libraryService = require('./libraryService');
const { initDb, pool } = require('./db');
const dataStore = require('./dataStore');
const authService = require('./authService');
const contactsService = require('./contactsService');

// Protección global ante bloqueos EBUSY en Windows / OneDrive
process.on('unhandledRejection', (reason) => {
    console.warn(
        '⚠️ [Process] Rechazo de promesa no manejado interceptado:',
        reason?.message || reason,
    );
});
process.on('uncaughtException', (err) => {
    console.warn('⚠️ [Process] Excepción no capturada:', err?.message || err);
    if (err?.code === 'EBUSY') {
        console.warn(
            '⚠️ [Process] Error EBUSY (archivo temporal ocupado por Chromium o OneDrive). El servidor continúa operando normalmente.',
        );
    }
});

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

// Asegurar directorios de subida y archivos
['rules', 'received', 'quick'].forEach((dir) => {
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
        return res
            .status(401)
            .json({ error: 'Acceso no autorizado. Inicia sesión.' });
    }
    const token = authHeader.slice(7).trim();
    try {
        const decoded = authService.verifyToken(token);
        req.user = decoded;
        next();
    } catch (e) {
        return res.status(401).json({
            error: 'Sesión expirada o token inválido. Inicia sesión nuevamente.',
        });
    }
}

// Middleware de Superusuario del sistema (acceso exclusivo para administradores de toda la plataforma)
async function requireSuperadmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res
            .status(401)
            .json({ error: 'Inicia sesión como superusuario para continuar.' });
    }
    const token = authHeader.slice(7).trim();
    let decoded;
    try {
        decoded = authService.verifyToken(token);
        req.user = decoded;
    } catch (e) {
        return res
            .status(401)
            .json({ error: 'Sesión expirada o token inválido.' });
    }

    try {
        const uRes = await pool.query(
            'SELECT is_superadmin, is_active FROM users WHERE id = $1',
            [decoded.id],
        );
        if (
            uRes.rows.length === 0 ||
            !uRes.rows[0].is_active ||
            !uRes.rows[0].is_superadmin
        ) {
            return res.status(403).json({
                error: 'Acceso denegado. Se requieren privilegios de Superusuario del sistema.',
            });
        }
        req.user.isSuperadmin = true;
        next();
    } catch (err) {
        console.error('Error verificando superusuario:', err);
        return res
            .status(500)
            .json({ error: 'Error verificando permisos de superusuario' });
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
            geminiEnabled: true,
        },
        rules: [],
        schedules: [],
        leads: [],
        groups: [],
        library: [],
    };
}

// La persistencia de datos (prospectos, contactos, reglas, archivos, campañas y mensajes)
// se almacena exclusivamente en PostgreSQL a través de dataStore para garantizar seguridad y privacidad.
function saveData(data) {
    // Operación en memoria para el estado en tiempo de ejecución.
    // Todas las operaciones persistentes se canalizan a PostgreSQL vía dataStore.
}

let appData = {
    activeCompanyId: 'default',
    companies: [createDefaultCompany()],
};

// =========================================================================
// GESTOR DE CLIENTES WHATSAPP MULTI-INSTANCIA
// =========================================================================

// Mapa de instancias de WhatsApp por empresa: Map<companyId, { client, status, qrCode, clientInfo }>
const companyClients = new Map();

// Clientes SSE para transmisión de chat en tiempo real: Map<`${companyId}_${phone}`, Set<res>>
const chatSSEClients = new Map();

// Clientes SSE para eventos generales de la empresa (actualización en vivo de prospectos/CRM): Map<companyId, Set<res>>
const companyEventsClients = new Map();

function broadcastChatMessage(companyId, phone, messageData) {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (!cleanPhone) return;
    const key = `${companyId}_${cleanPhone}`;
    const clients = chatSSEClients.get(key);
    if (clients && clients.size > 0) {
        const payload = `data: ${JSON.stringify(messageData)}\n\n`;
        for (const clientRes of clients) {
            try {
                clientRes.write(payload);
            } catch (e) {
                clients.delete(clientRes);
            }
        }
    }
}

function broadcastCompanyEvent(companyId, eventName, payload) {
    if (!companyId) return;
    const clients = companyEventsClients.get(companyId);
    if (clients && clients.size > 0) {
        const data = `data: ${JSON.stringify({ event: eventName, payload, timestamp: Date.now() })}\n\n`;
        for (const clientRes of clients) {
            try {
                clientRes.write(data);
            } catch (e) {
                clients.delete(clientRes);
            }
        }
    }
}

function initCompanyWhatsAppClient(companyId) {
    const company = appData.companies.find((c) => c.id === companyId);
    if (!company) {
        console.warn(
            `[Multi-Bot] No se encontró la empresa con ID: ${companyId}`,
        );
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
        clientInfo: null,
    };
    companyClients.set(companyId, state);

    console.log(
        `[Empresa: ${company.name} (${companyId})] Iniciando cliente WhatsApp...`,
    );

    // Para la empresa 'default', usamos clientId: null para reutilizar la sesión existente en .wwebjs_auth/session
    // Para las demás empresas, usamos clientId: companyId (se guarda en .wwebjs_auth/session-<companyId>)
    const authClientId = companyId === 'default' ? null : companyId;

    // Limpieza preventiva de lockfile huérfano si una sesión previa cerró de forma anómala
    const sessionDir = path.join(
        __dirname,
        '.wwebjs_auth',
        companyId === 'default' ? 'session' : `session-${companyId}`,
    );
    const lockFiles = [
        path.join(sessionDir, 'lockfile'),
        path.join(sessionDir, 'Default', 'LOCK'),
        path.join(sessionDir, 'Default', 'SingletonLock'),
    ];
    for (const lockPath of lockFiles) {
        if (fs.existsSync(lockPath)) {
            try {
                fs.unlinkSync(lockPath);
                console.log(
                    `[Empresa: ${company.name}] 🧹 Lockfile huérfano liberado: ${path.basename(lockPath)}`,
                );
            } catch (e) {
                console.warn(
                    `[Empresa: ${company.name}] ⚠️ Archivo de sesión ocupado (${path.basename(lockPath)}): ${e.message}`,
                );
            }
        }
    }

    const clientInstance = new Client({
        authStrategy: new LocalAuth({
            clientId: authClientId,
            dataPath: path.join(__dirname, '.wwebjs_auth'),
        }),
        authTimeoutMs: 90000,
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        puppeteer: {
            headless: true,
            timeout: 90000,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-extensions',
            ],
        },
    });

    state.client = clientInstance;

    let authTimeout = null;
    let qrCount = 0;

    clientInstance.on('qr', async (qr) => {
        qrCount++;
        if (qrCount > 5) {
            console.log(
                `[Empresa: ${company.name}] ⏱️ Código QR expiró sin ser escaneado tras 5 intentos. Deteniendo proceso para ahorrar recursos.`,
            );
            state.status = 'disconnected';
            state.qrCode = null;
            await stopCompanyWhatsAppClient(companyId);
            return;
        }

        console.log(
            `[Empresa: ${company.name}] Nuevo código QR recibido (#${qrCount}/5)`,
        );
        state.status = 'qr_ready';
        try {
            state.qrCode = await QRCode.toDataURL(qr, {
                width: 320,
                margin: 2,
                color: { dark: '#0b141a', light: '#ffffff' },
            });
        } catch (err) {
            console.error(
                `[Empresa: ${company.name}] Error generando QR DataURL:`,
                err,
            );
        }
    });

    clientInstance.on('authenticated', () => {
        qrCount = 0;
        console.log(`[Empresa: ${company.name}] Autenticado correctamente`);
        state.status = 'authenticated';
        state.qrCode = null;

        // Si la sesión no pasa a 'ready' tras 45s (credenciales locales revocadas externamente), reiniciar limpio
        if (authTimeout) clearTimeout(authTimeout);
        authTimeout = setTimeout(async () => {
            if (state.status === 'authenticated') {
                console.warn(
                    `[Empresa: ${company.name}] ⚠️ Sesión de WhatsApp atascada en 'authenticated'. Restaurando credenciales limpias...`,
                );
                try {
                    await unlinkCompanyWhatsApp(companyId);
                } catch (e) {
                    console.error(
                        `[Empresa: ${company.name}] Error en autorecuperación:`,
                        e.message,
                    );
                }
            }
        }, 45000);
    });

    clientInstance.on('auth_failure', async (msg) => {
        console.error(
            `[Empresa: ${company.name}] Fallo de autenticación:`,
            msg,
        );
        state.status = 'auth_failure';
        if (authTimeout) clearTimeout(authTimeout);
        try {
            await unlinkCompanyWhatsApp(companyId);
        } catch (e) {
            console.error(
                `[Empresa: ${company.name}] Error reiniciando tras auth_failure:`,
                e.message,
            );
        }
    });

    clientInstance.on('ready', async () => {
        if (authTimeout) clearTimeout(authTimeout);
        console.log(
            `[Empresa: ${company.name}] WhatsApp LISTO para enviar y recibir`,
        );
        state.status = 'ready';
        state.qrCode = null;
        try {
            state.clientInfo = {
                pushname: clientInstance.info?.pushname || company.name,
                wid: clientInstance.info?.wid?.user || 'Conectado',
                platform: clientInstance.info?.platform || 'web',
            };
        } catch (e) {
            state.clientInfo = { pushname: company.name, wid: 'Conectado' };
        }
    });

    clientInstance.on('disconnected', (reason) => {
        if (authTimeout) clearTimeout(authTimeout);
        console.log(`[Empresa: ${company.name}] Desconectado:`, reason);
        state.status = 'disconnected';
        state.clientInfo = null;
        state.qrCode = null;
    });

    clientInstance.on('message', async (msg) => {
        try {
            await handleIncomingMessage(companyId, msg);
        } catch (err) {
            console.error(
                `[Empresa: ${company.name}] Error procesando mensaje entrante:`,
                err,
            );
        }
    });

    clientInstance.on('message_create', async (msg) => {
        try {
            // Detectar mensajes enviados desde el teléfono físico u otro cliente WhatsApp
            if (msg.fromMe) {
                const toId = msg.to || '';
                const recipientPhone = toId
                    .replace('@c.us', '')
                    .replace('@g.us', '');
                if (
                    recipientPhone &&
                    recipientPhone !== 'status@broadcast' &&
                    !toId.includes('@g.us')
                ) {
                    const isAudio = msg.type === 'ptt' || msg.type === 'audio';
                    const text =
                        msg.body ||
                        (msg.hasMedia
                            ? isAudio
                                ? '🎤 [Nota de voz]'
                                : '📎 [Archivo adjunto]'
                            : '');
                    if (text) {
                        dataStore.saveMessageInDb(
                            companyId,
                            recipientPhone,
                            true,
                            text,
                            null,
                            null,
                            msg.type || 'chat',
                            msg.id?._serialized,
                        );
                        broadcastChatMessage(companyId, recipientPhone, {
                            id: msg.id?._serialized || `out_${Date.now()}`,
                            fromMe: true,
                            body: text,
                            timestamp: msg.timestamp
                                ? msg.timestamp > 1e11
                                    ? msg.timestamp
                                    : msg.timestamp * 1000
                                : Date.now(),
                            type: msg.type || 'chat',
                            hasMedia: Boolean(msg.hasMedia),
                        });

                        // Actualizar prospecto en tiempo real
                        if (!company.leads) company.leads = [];
                        let lead = company.leads.find(
                            (l) => l.phone === recipientPhone,
                        );
                        if (lead) {
                            lead.lastMessage = `Tú: ${text}`;
                            lead.lastInteraction = new Date().toISOString();
                            persistLead(companyId, lead);
                        }
                    }
                }
            }
        } catch (e) {}
    });

    clientInstance.initialize().catch((err) => {
        console.error(
            `[Empresa: ${company.name}] Error en client.initialize():`,
            err,
        );
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
                console.error(
                    `Error deteniendo cliente de empresa ${companyId}:`,
                    e.message,
                );
            }
        }
        companyClients.delete(companyId);
    }
}

// Desvincular completamente WhatsApp de una empresa
async function unlinkCompanyWhatsApp(companyId) {
    if (companyClients.has(companyId)) {
        const holder = companyClients.get(companyId);
        if (holder && holder.client) {
            try {
                await holder.client.destroy();
            } catch (e) {
                console.warn(
                    `Aviso cerrando cliente de ${companyId}:`,
                    e.message,
                );
            }
        }
        companyClients.delete(companyId);
    }

    // Pausa preventiva para que Chromium y Windows/OneDrive liberen descriptores de archivos
    await new Promise((r) => setTimeout(r, 600));

    const authClientId = companyId === 'default' ? null : companyId;
    const sessionDir = path.join(
        __dirname,
        '.wwebjs_auth',
        authClientId ? `session-${authClientId}` : 'session',
    );
    if (fs.existsSync(sessionDir)) {
        for (let attempt = 1; attempt <= 4; attempt++) {
            try {
                fs.rmSync(sessionDir, {
                    recursive: true,
                    force: true,
                    maxRetries: 3,
                    retryDelay: 200,
                });
                break;
            } catch (e) {
                if (attempt === 4) {
                    console.warn(
                        `Aviso borrando sesión de WhatsApp para ${companyId} (${e.code}):`,
                        e.message,
                    );
                } else {
                    await new Promise((r) => setTimeout(r, 400));
                }
            }
        }
    }

    // Limpiar teléfono de la empresa desvinculada
    const comp = appData.companies.find((c) => c.id === companyId);
    if (comp) {
        comp.phone = null;
        saveData(appData);
    }
}

function hasSavedSession(companyId) {
    const authClientId = companyId === 'default' ? null : companyId;
    const sessionDir = path.join(
        __dirname,
        '.wwebjs_auth',
        authClientId ? `session-${authClientId}` : 'session',
    );
    if (!fs.existsSync(sessionDir)) return false;
    const defaultDir = path.join(sessionDir, 'Default');
    return fs.existsSync(defaultDir);
}

function initAllCompanyClients() {
    for (const comp of appData.companies) {
        if (hasSavedSession(comp.id)) {
            console.log(
                `[Empresa: ${comp.name}] Sesión vinculada encontrada. Iniciando cliente WhatsApp...`,
            );
            initCompanyWhatsAppClient(comp.id);
        } else {
            console.log(
                `[Empresa: ${comp.name}] Sin sesión activa. En espera de solicitud de vinculación.`,
            );
        }
    }
}

// Limpieza de leyenda de mensaje
function getCleanCaption(body) {
    if (!body || typeof body !== 'string') return '';
    const trimmed = body.trim();
    if (
        trimmed.startsWith('/9j/') ||
        trimmed.startsWith('data:image') ||
        (!trimmed.includes(' ') && trimmed.length > 80)
    ) {
        return '';
    }
    return trimmed;
}

// Persistir lead en PostgreSQL de manera asíncrona y emitir evento en tiempo real
function persistLead(companyId, lead) {
    saveData(appData);
    const company = appData.companies?.find((c) => c.id === companyId);
    if (company) {
        company._lastLeadUpdate = Date.now();
    }
    if (companyId && lead) {
        dataStore
            .upsertLeadInDb(companyId, lead)
            .catch((e) =>
                console.error(
                    `[DB] Error guardando lead ${lead.phone}:`,
                    e.message,
                ),
            );
        broadcastCompanyEvent(companyId, 'lead_updated', lead);
    }
}

// =========================================================================
// LÓGICA DE ATENCIÓN AUTOMÁTICA POR EMPRESA
// =========================================================================

async function handleIncomingMessage(companyId, msg) {
    const company = appData.companies.find((c) => c.id === companyId);
    if (!company) return;
    if (!company.settings || !company.settings.botEnabled) return;
    if (msg.fromMe) return;

    // Ignorar estados de WhatsApp (Stories), difusiones y canales (newsletters)
    const fromId = msg.from || '';
    if (
        msg.isStatus ||
        msg.broadcast ||
        msg.type === 'status' ||
        fromId === 'status@broadcast' ||
        fromId.includes('@broadcast') ||
        fromId.includes('@newsletter') ||
        (msg.id && msg.id.remote === 'status@broadcast')
    ) {
        return;
    }

    if (company.settings.ignoreGroups && fromId.includes('@g.us')) return;

    const senderPhone = fromId.replace('@c.us', '').replace('@g.us', '');
    if (!senderPhone || senderPhone === 'status@broadcast') return;
    const cleanText = getCleanCaption(msg.body);
    const text = cleanText.toLowerCase();

    // 1. Detectar si es nota de voz o archivo adjunto
    const isAudioType = msg.type === 'ptt' || msg.type === 'audio';
    const hasMedia = Boolean(msg.hasMedia || isAudioType);

    let receivedMedia = null;
    let rawAudioMedia = null;

    if (hasMedia) {
        try {
            console.log(
                `[${company.name}] 📥 Descargando archivo recibido de ${senderPhone}... (tipo: ${msg.type})`,
            );

            let downloaded = null;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    downloaded = await msg.downloadMedia();
                    if (downloaded && downloaded.data) break;
                } catch (e) {
                    console.warn(
                        `[${company.name}] Intento ${attempt + 1} de descarga:`,
                        e.message,
                    );
                }
                await new Promise((r) => setTimeout(r, 600));
            }

            if (downloaded && downloaded.data) {
                const ext =
                    mime.getExtension(downloaded.mimetype) ||
                    (isAudioType ? 'oga' : 'bin');
                const originalName =
                    downloaded.filename || `recibido_${Date.now()}.${ext}`;
                const cleanOriginal = originalName.replace(
                    /[^a-zA-Z0-9._-]/g,
                    '_',
                );
                const uniqueFilename = `${Date.now()}_${cleanOriginal}`;
                const savePath = path.join(
                    UPLOADS_DIR,
                    'received',
                    uniqueFilename,
                );

                fs.writeFileSync(
                    savePath,
                    Buffer.from(downloaded.data, 'base64'),
                );

                receivedMedia = {
                    id: 'med-' + Date.now(),
                    filename: originalName,
                    mimetype: downloaded.mimetype,
                    size:
                        downloaded.filesize ||
                        (downloaded.data
                            ? Math.round(downloaded.data.length * 0.75)
                            : 0),
                    url: `/uploads/received/${uniqueFilename}`,
                    receivedAt: new Date().toISOString(),
                    caption: cleanText,
                };
                console.log(
                    `[${company.name}] ✅ Archivo recibido guardado: ${receivedMedia.url}`,
                );

                const isAudio =
                    isAudioType ||
                    (downloaded.mimetype || '').startsWith('audio/') ||
                    (downloaded.mimetype || '').includes('ogg');
                if (isAudio) {
                    rawAudioMedia = {
                        data: downloaded.data,
                        mimetype:
                            downloaded.mimetype || 'audio/ogg; codecs=opus',
                    };
                }
            } else {
                console.warn(
                    `[${company.name}] ⚠️ No se pudo descargar el archivo adjunto de ${senderPhone}`,
                );
            }
        } catch (err) {
            console.error(
                `[${company.name}] Error descargando archivo adjunto:`,
                err,
            );
        }
    }

    if (isAudioType && !rawAudioMedia) {
        console.warn(
            `[${company.name}] ⚠️ La nota de voz de ${senderPhone} no se pudo procesar.`,
        );
        if (company.settings.fallbackMessage) {
            await msg.reply(
                'Disculpa, no pude escuchar tu nota de voz en este momento. ¿Podrías enviarla nuevamente o escribir tu consulta en texto?',
            );
        }
        return;
    }

    if (!text && !receivedMedia && !rawAudioMedia) return;

    // 2. Buscar o registrar lead para esta empresa específica
    if (!company.leads) company.leads = [];
    let lead = company.leads.find((l) => l.phone === senderPhone);
    const isAudioMsg = Boolean(
        rawAudioMedia ||
        isAudioType ||
        (receivedMedia && (receivedMedia.mimetype || '').startsWith('audio/')),
    );
    const displayMsg = isAudioMsg
        ? cleanText
            ? `🎤 [Nota de voz] ${cleanText}`
            : `🎤 [Nota de voz / Audio]`
        : receivedMedia
          ? cleanText
              ? `📎 [${receivedMedia.filename}] ${cleanText}`
              : `📎 [${receivedMedia.filename}]`
          : cleanText;

    if (!lead) {
        const cleanSender = senderPhone.replace(/\D/g, '');
        const savedContact = (company.contacts || []).find(
            (c) =>
                c.phone === senderPhone ||
                (cleanSender &&
                    c.phone &&
                    c.phone.replace(/\D/g, '') === cleanSender),
        );
        const initialName =
            savedContact?.name || msg._data?.notifyName || senderPhone;
        lead = {
            phone: senderPhone,
            name: initialName,
            tag: isAudioMsg
                ? 'Audio / Nota de voz'
                : receivedMedia
                  ? 'Comprobante/Archivo Enviado'
                  : 'Nuevo',
            lastMessage: displayMsg,
            lastInteraction: new Date().toISOString(),
            lastSentRuleId: null,
            humanPaused: false,
            receivedFiles: [],
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

    // Registrar mensaje entrante en historial de base de datos
    dataStore.saveMessageInDb(
        companyId,
        senderPhone,
        false,
        cleanText || displayMsg,
        receivedMedia?.url,
        receivedMedia?.mimetype,
        msg.type,
        msg.id?._serialized,
    );

    // Transmitir en tiempo real a la vista del chat abierta
    broadcastChatMessage(companyId, senderPhone, {
        id: msg.id?._serialized || `in_${Date.now()}`,
        fromMe: false,
        author: msg.author || null,
        body: cleanText || displayMsg,
        timestamp: Date.now(),
        type: msg.type || 'chat',
        hasMedia: Boolean(receivedMedia),
        mediaUrl: receivedMedia?.url || null,
        mediaMimetype: receivedMedia?.mimetype || null,
        filename: receivedMedia?.filename || null,
    });

    // Persistir y emitir actualización inmediata del prospecto en la lista de CRM
    persistLead(companyId, lead);

    if (lead.humanPaused) {
        console.log(
            `[${company.name}] Mensaje recibido de ${senderPhone}, pero el bot está pausado para este contacto (atención humana).`,
        );
        return;
    }

    // 3. Buscar regla coincidente en las rutas de esta empresa
    const hasMediaFlag = Boolean(receivedMedia);
    const mediaMimetype = receivedMedia
        ? receivedMedia.mimetype
        : isAudioType
          ? 'audio/ogg'
          : '';
    const context = { lastSentRuleId: lead ? lead.lastSentRuleId : null };
    const matchedRule = matchRule(
        text,
        company.rules || [],
        hasMediaFlag,
        mediaMimetype,
        context,
    );

    if (matchedRule) {
        console.log(
            `[${company.name}] Regla activada: "${matchedRule.name}" para ${senderPhone}`,
        );

        if (matchedRule.leadTag) {
            lead.tag = matchedRule.leadTag;
        }

        if (matchedRule.pauseBot) {
            lead.humanPaused = true;
            console.log(
                `[${company.name}] Bot pausado para ${senderPhone} debido a la regla "${matchedRule.name}".`,
            );
        }

        lead.lastSentRuleId = matchedRule.id;
        persistLead(companyId, lead);

        // Simular escritura natural
        if (company.settings.simulateTyping) {
            try {
                const chat = await msg.getChat();
                await chat.sendStateTyping();
                const delayMs =
                    (company.settings.typingDelaySeconds || 2) * 1000;
                await new Promise((r) => setTimeout(r, delayMs));
                await chat.clearStateTyping();
            } catch (e) {}
        }

        // 4. Enviar respuesta con el cliente de WhatsApp de esta empresa
        await sendRuleResponse(companyId, msg, matchedRule);
    } else if (
        company.settings.geminiEnabled !== false &&
        geminiService.isConfigured(company.settings.geminiApiKey) &&
        libraryService.hasActiveKnowledge(company.library) &&
        (text.length > 0 || rawAudioMedia)
    ) {
        persistLead(companyId, lead);
        if (rawAudioMedia) {
            console.log(
                `[${company.name}] 🎙️ Escuchando nota de voz de ${senderPhone} con Gemini (Base de conocimiento activa)...`,
            );
        } else {
            console.log(
                `[${company.name}] 🤖 Usando Gemini para responder a ${senderPhone} (Base de conocimiento activa)...`,
            );
        }

        let chat = null;
        try {
            if (company.settings.simulateTyping) {
                try {
                    chat = await msg.getChat();
                    await chat.sendStateTyping();
                } catch (e) {}
            }

            const businessName =
                company.settings.businessName || company.name || 'Mi Negocio';
            const geminiInput = rawAudioMedia
                ? {
                      text: cleanText,
                      audio: rawAudioMedia,
                  }
                : cleanText;

            // Sesión de Gemini aislada por empresa y remitente
            const sessionKey = `${companyId}_${senderPhone}`;
            const aiReply = await geminiService.sendMessage(
                sessionKey,
                geminiInput,
                businessName,
                company.library || [],
                company.settings.geminiApiKey,
                company.settings.geminiModel,
            );

            if (chat) {
                try {
                    await chat.clearStateTyping();
                } catch (e) {}
            }

            if (aiReply) {
                await msg.reply(aiReply);
                console.log(
                    `[${company.name}] ✅ Respuesta de Gemini enviada a ${senderPhone}`,
                );
                dataStore.saveMessageInDb(
                    companyId,
                    senderPhone,
                    true,
                    aiReply,
                    null,
                    null,
                    'chat',
                );
                broadcastChatMessage(companyId, senderPhone, {
                    id: `gemini_${Date.now()}`,
                    fromMe: true,
                    body: aiReply,
                    timestamp: Date.now(),
                    type: 'chat',
                    hasMedia: false,
                });

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
            console.error(
                `[${company.name}] Error al responder con Gemini:`,
                geminiErr.message || geminiErr,
            );
            if (chat) {
                try {
                    await chat.clearStateTyping();
                } catch (e) {}
            }
            if (company.settings.fallbackMessage) {
                await msg.reply(company.settings.fallbackMessage);
                if (lead) {
                    lead.lastSentRuleId = 'fallback';
                    persistLead(companyId, lead);
                }
            }
        }
    } else if (
        company.settings.fallbackMessage &&
        (text.length > 0 || hasMediaFlag || isAudioMsg)
    ) {
        if (lead) {
            lead.lastSentRuleId = 'fallback';
        }
        persistLead(companyId, lead);
        if (company.settings.simulateTyping) {
            try {
                const chat = await msg.getChat();
                await chat.sendStateTyping();
                const delayMs =
                    (company.settings.typingDelaySeconds || 2) * 1000;
                await new Promise((r) => setTimeout(r, delayMs));
                await chat.clearStateTyping();
            } catch (e) {}
        }
        await msg.reply(company.settings.fallbackMessage);
        dataStore.saveMessageInDb(
            companyId,
            senderPhone,
            true,
            company.settings.fallbackMessage,
            null,
            null,
            'chat',
        );
        broadcastChatMessage(companyId, senderPhone, {
            id: `fallback_${Date.now()}`,
            fromMe: true,
            body: company.settings.fallbackMessage,
            timestamp: Date.now(),
            type: 'chat',
            hasMedia: false,
        });
        console.log(
            `[${company.name}] 💬 Respuesta por defecto enviada a ${senderPhone} (sin coincidencia de regla y biblioteca sin datos activos para Gemini)`,
        );
    } else {
        persistLead(companyId, lead);
    }
}

// Envío de respuesta con soporte de medios
async function sendRuleResponse(companyId, msg, rule) {
    let mediaToSend = null;

    if (rule.media && rule.media.url) {
        try {
            const relPath = rule.media.url.startsWith('/')
                ? rule.media.url.slice(1)
                : rule.media.url;
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

    const targetPhone = (msg.from || '')
        .replace('@c.us', '')
        .replace('@g.us', '');
    if (mediaToSend && clientInstance) {
        console.log(
            `📤 Enviando archivo adjunto "${rule.media.filename || 'archivo'}" a ${msg.from}...`,
        );
        await clientInstance.sendMessage(msg.from, mediaToSend, {
            caption: rule.response || undefined,
        });
        dataStore.saveMessageInDb(
            companyId,
            targetPhone,
            true,
            rule.response,
            rule.media?.url,
            rule.media?.mimetype,
            'chat',
        );
        broadcastChatMessage(companyId, targetPhone, {
            id: `rule_${Date.now()}`,
            fromMe: true,
            body: rule.response,
            timestamp: Date.now(),
            type: 'chat',
            hasMedia: Boolean(mediaToSend),
            mediaUrl: rule.media?.url || null,
        });
    } else {
        await msg.reply(rule.response);
        dataStore.saveMessageInDb(
            companyId,
            targetPhone,
            true,
            rule.response,
            null,
            null,
            'chat',
        );
        broadcastChatMessage(companyId, targetPhone, {
            id: `rule_${Date.now()}`,
            fromMe: true,
            body: rule.response,
            timestamp: Date.now(),
            type: 'chat',
            hasMedia: false,
        });
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
function checkTriggerMatch(
    text,
    trigger,
    matchType = 'contains_any',
    context = {},
    rule = {},
) {
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
        const cleanNoPunct = cleanNoEmojis.replace(
            /^[#\s([<]+|[.\s!?:)\]>]+$/g,
            '',
        );
        if (cleanNoPunct === lowerTrigger) return true;

        const escaped = escapeRegExp(lowerTrigger);
        const menuOptionRegex = new RegExp(
            '^(?:(?:hola|buenas|por\\s+favor)?\\s*(?:opci[oó]n|n[uú]mero|num|n°|no\\.?|item|el|la)?\\s*#?\\s*)' +
                escaped +
                '[.\\s!?:)]*$',
            'iu',
        );
        if (menuOptionRegex.test(cleanNoEmojis)) return true;

        return false;
    }

    // Caso 2: Palabras clave de texto
    const normText = normalizeAccents(lowerText);
    const normTrigger = normalizeAccents(lowerTrigger);

    if (matchType === 'exact') {
        const cleanNoPunct = normText.replace(
            /^[¿¡!?,.:;\s]+|[¿¡!?,.:;\s]+$/g,
            '',
        );
        return cleanNoPunct === normTrigger;
    }

    if (matchType === 'starts_with') {
        const escaped = escapeRegExp(normTrigger);
        const startsRegex = new RegExp(
            '^(?:[¿¡!?,.:;\\s]*)(?:' + escaped + ')(?:(?![\\p{L}\\p{N}])|$)',
            'iu',
        );
        return startsRegex.test(normText);
    }

    const escaped = escapeRegExp(normTrigger);
    const wordBoundaryRegex = new RegExp(
        '(?<![\\p{L}\\p{N}])' + escaped + '(?![\\p{L}\\p{N}])',
        'iu',
    );
    return wordBoundaryRegex.test(normText);
}

// Algoritmo de coincidencia de reglas
function matchRule(
    text,
    rules,
    hasMedia = false,
    mediaMimetype = '',
    context = {},
) {
    const activeRules = rules.filter((r) => r.enabled !== false);
    const isAudioMedia =
        mediaMimetype.startsWith('audio/') || mediaMimetype.includes('ogg');
    const lastSentRuleId = context.lastSentRuleId || null;

    // Prioridad 1: Submenús contextuales cuyo parentRuleId coincide con el último menú enviado
    // Prioridad 2: Reglas globales
    const sortedRules = [...activeRules].sort((a, b) => {
        const aMatchesContext = Boolean(
            a.parentRuleId && a.parentRuleId === lastSentRuleId,
        );
        const bMatchesContext = Boolean(
            b.parentRuleId && b.parentRuleId === lastSentRuleId,
        );
        if (aMatchesContext && !bMatchesContext) return -1;
        if (!aMatchesContext && bMatchesContext) return 1;
        return 0;
    });

    for (const rule of sortedRules) {
        const triggerType = rule.triggerType || 'text';

        // A. Coincidencia por archivo recibido
        if (
            hasMedia &&
            (triggerType === 'media' ||
                triggerType === 'both' ||
                rule.matchType === 'on_media')
        ) {
            const filter = rule.mediaTypeFilter || 'any';
            let mediaMatches = false;

            if (filter === 'any') {
                if (!isAudioMedia) mediaMatches = true;
            } else if (
                filter === 'image' &&
                mediaMimetype.startsWith('image/')
            ) {
                mediaMatches = true;
            } else if (
                filter === 'document' &&
                (mediaMimetype.includes('pdf') ||
                    mediaMimetype.includes('document') ||
                    mediaMimetype.includes('sheet') ||
                    mediaMimetype.includes('msword') ||
                    mediaMimetype.includes('text') ||
                    mediaMimetype.includes('octet-stream'))
            ) {
                mediaMatches = true;
            } else if (filter === 'audio' && isAudioMedia) {
                mediaMatches = true;
            }

            if (mediaMatches) {
                const triggers = (rule.triggers || [])
                    .map((t) => t.trim().toLowerCase())
                    .filter(Boolean);
                if (!triggers.length || !text) return rule;
                const matchType = rule.matchType || 'contains_any';
                if (
                    triggers.some((t) =>
                        checkTriggerMatch(text, t, matchType, context, rule),
                    )
                ) {
                    return rule;
                }
                if (triggerType === 'media' || rule.matchType === 'on_media') {
                    return rule;
                }
            }
        }

        // B. Coincidencia por texto / palabras clave
        if (
            text &&
            (triggerType === 'text' ||
                triggerType === 'both' ||
                !rule.triggerType)
        ) {
            const triggers = (rule.triggers || [])
                .map((t) => t.trim().toLowerCase())
                .filter(Boolean);
            if (!triggers.length) continue;

            const matchType = rule.matchType || 'contains_any';
            if (
                triggers.some((t) =>
                    checkTriggerMatch(text, t, matchType, context, rule),
                )
            ) {
                return rule;
            }
        }
    }
    return null;
}

// =========================================================================
// MOTOR DE PROGRAMACIÓN DE ENVÍOS & DIFUSIONES MULTI-EMPRESA
// =========================================================================

async function executeScheduleCampaign(companyId, item) {
    const company = (appData.companies || []).find((c) => c.id === companyId);
    if (!company) return;
    const holder = companyClients.get(companyId);
    if (!holder || holder.status !== 'ready' || !holder.client) {
        console.warn(
            `[${company.name}] ⚠️ No se puede ejecutar campaña ${item.id}: WhatsApp no está conectado.`,
        );
        return;
    }

    if (
        item.status === 'sending' ||
        item.status === 'sent' ||
        item.status === 'cancelled'
    ) {
        return;
    }

    item.status = 'sending';
    item.sentRecipients = 0;
    item.failedRecipients = 0;
    item.executionLogs = [];
    saveData(appData);
    await dataStore.saveScheduleInDb(companyId, item).catch(() => {});

    // 1. Resolver lista de destinatarios según targetType
    let targetRecipients = [];
    const targetType = item.targetType || 'single';
    const targetValue = item.targetValue || item.recipient || '';

    if (targetType === 'single') {
        const cleanDigits = targetValue.replace(/\D/g, '');
        if (cleanDigits) {
            const existing = (company.leads || []).find(
                (l) =>
                    l.phone === cleanDigits ||
                    (l.phone && l.phone.replace(/\D/g, '') === cleanDigits),
            );
            targetRecipients.push({
                phone: targetValue,
                name: existing?.name || 'Cliente',
            });
        }
    } else if (targetType === 'tag') {
        const matchingLeads = (company.leads || []).filter(
            (l) =>
                l.tag &&
                l.tag.toLowerCase().trim() ===
                    targetValue.toLowerCase().trim() &&
                l.phone &&
                l.phone !== 'status@broadcast' &&
                !l.phone.includes('@broadcast'),
        );
        targetRecipients = matchingLeads.map((l) => ({
            phone: l.phone,
            name: l.name || 'Cliente',
        }));
    } else if (targetType === 'group') {
        const memberPhones = await dataStore
            .getGroupMemberPhonesFromDb(companyId, targetValue)
            .catch(() => []);
        targetRecipients = memberPhones.map((ph) => {
            const contact = (company.contacts || []).find(
                (c) =>
                    c.phone === ph ||
                    (c.phone &&
                        c.phone.replace(/\D/g, '') === ph.replace(/\D/g, '')),
            );
            const lead = (company.leads || []).find(
                (l) =>
                    l.phone === ph ||
                    (l.phone &&
                        l.phone.replace(/\D/g, '') === ph.replace(/\D/g, '')),
            );
            return {
                phone: ph,
                name: contact?.name || lead?.name || 'Cliente',
            };
        });
    }

    item.totalRecipients = targetRecipients.length;
    item.sentRecipients = 0;
    item.failedRecipients = 0;

    if (targetRecipients.length === 0) {
        item.status = 'failed';
        item.error =
            'No se encontraron destinatarios válidos para esta campaña.';
        saveData(appData);
        await dataStore.saveScheduleInDb(companyId, item).catch(() => {});
        return;
    }

    console.log(
        `[${company.name}] 📢 Iniciando campaña de difusión "${item.name}" para ${targetRecipients.length} contactos (${targetType}: ${targetValue})...`,
    );

    // Preparar archivo adjunto si tiene
    let mediaInstance = null;
    if (item.media && item.media.url) {
        const relPath = item.media.url.startsWith('/')
            ? item.media.url.slice(1)
            : item.media.url;
        const fullPath = path.join(__dirname, 'public', relPath);
        if (fs.existsSync(fullPath)) {
            mediaInstance = MessageMedia.fromFilePath(fullPath);
        } else if (item.media.url.startsWith('http')) {
            mediaInstance = await MessageMedia.fromUrl(item.media.url).catch(
                () => null,
            );
        }
    }

    const baseDelaySec = Math.max(3, parseInt(item.delaySeconds, 10) || 10);

    // Iterar secuencialmente con pausas seguras para proteger la cuenta contra baneos
    for (let i = 0; i < targetRecipients.length; i++) {
        // Verificar si fue cancelada por el usuario
        if (item.status === 'cancelled') {
            console.log(
                `[${company.name}] 🛑 Campaña "${item.name}" cancelada por el usuario.`,
            );
            break;
        }

        const recipient = targetRecipients[i];
        try {
            const { chatId, cleanDigits, storagePhone } = findLeadAndChatId(
                company,
                recipient.phone,
            );
            if (!chatId) {
                throw new Error('Identificador de WhatsApp inválido');
            }

            // Interpolación de variables en mensaje
            const personalizedMsg = (item.message || '')
                .replace(/{nombre}/gi, recipient.name || 'Cliente')
                .replace(/{name}/gi, recipient.name || 'Cliente')
                .replace(/{telefono}/gi, recipient.phone || '')
                .replace(/{phone}/gi, recipient.phone || '');

            let result;
            if (mediaInstance) {
                result = await holder.client.sendMessage(
                    chatId,
                    mediaInstance,
                    { caption: personalizedMsg || undefined },
                );
            } else {
                result = await holder.client.sendMessage(
                    chatId,
                    personalizedMsg,
                );
            }

            const msgId = result?.id?._serialized || `camp_${Date.now()}_${i}`;

            // Registrar en historial de mensajes de la base de datos
            await dataStore.saveMessageInDb(
                companyId,
                cleanDigits || storagePhone,
                true,
                personalizedMsg || (item.media ? '📎 Archivo de campaña' : ''),
                item.media?.url,
                item.media?.mimetype,
                'chat',
                msgId,
            );

            broadcastChatMessage(companyId, cleanDigits || storagePhone, {
                id: msgId,
                fromMe: true,
                body:
                    personalizedMsg ||
                    (item.media ? '📎 Archivo de campaña' : ''),
                timestamp: Date.now(),
                type: 'chat',
                hasMedia: Boolean(item.media),
                mediaUrl: item.media?.url || null,
            });

            // Actualizar lead
            const lead = (company.leads || []).find(
                (l) =>
                    l.phone === storagePhone ||
                    (cleanDigits && l.phone === cleanDigits),
            );
            if (lead) {
                lead.lastMessage =
                    personalizedMsg ||
                    (item.media ? '📎 Archivo de campaña' : '');
                lead.lastInteraction = new Date().toISOString();
                dataStore.upsertLeadInDb(companyId, lead).catch(() => {});
            }

            item.sentRecipients++;
            item.executionLogs.push({
                phone: recipient.phone,
                name: recipient.name,
                status: 'sent',
                at: new Date().toISOString(),
            });
        } catch (sendErr) {
            console.error(
                `[${company.name}] Error enviando a ${recipient.phone} en campaña:`,
                sendErr.message,
            );
            item.failedRecipients++;
            item.executionLogs.push({
                phone: recipient.phone,
                name: recipient.name,
                status: 'failed',
                error: sendErr.message,
                at: new Date().toISOString(),
            });
        }

        // Actualizar progreso persistente
        saveData(appData);
        await dataStore.saveScheduleInDb(companyId, item).catch(() => {});

        // Pausa segura entre mensajes para evitar detección de spam (con jitter humano)
        if (i < targetRecipients.length - 1 && item.status !== 'cancelled') {
            const jitter = Math.random() * 4 - 2; // +/- 2 segundos de variación humana
            const sleepMs = Math.max(
                3000,
                Math.round((baseDelaySec + jitter) * 1000),
            );
            await new Promise((r) => setTimeout(r, sleepMs));
        }
    }

    if (item.status !== 'cancelled') {
        const isRecurring = item.recurrence && item.recurrence !== 'none';
        if (isRecurring) {
            // Calcular fecha del próximo ciclo respetando la hora establecida
            const advanceDate = (d, rec) => {
                if (rec === 'daily') d.setDate(d.getDate() + 1);
                else if (rec === 'weekly') d.setDate(d.getDate() + 7);
                else if (rec === 'monthly') d.setMonth(d.getMonth() + 1);
                else if (rec === 'yearly') d.setFullYear(d.getFullYear() + 1);
            };

            let nextDate = new Date(item.scheduledTime);
            const now = new Date();

            advanceDate(nextDate, item.recurrence);
            while (nextDate <= now) {
                advanceDate(nextDate, item.recurrence);
            }

            item.lastSentAt = new Date().toISOString();
            item.sentAt = new Date().toISOString();
            item.scheduledTime = nextDate.toISOString();
            item.status = 'pending';
            console.log(
                `[${company.name}] 🔁 Campaña periódica "${item.name}" (${item.recurrence}) completada (${item.sentRecipients} entregados, ${item.failedRecipients} fallidos). Próximo ciclo programado para: ${nextDate.toLocaleString()}`,
            );
        } else {
            item.status = item.sentRecipients > 0 ? 'sent' : 'failed';
            item.sentAt = new Date().toISOString();
            item.lastSentAt = new Date().toISOString();
            console.log(
                `[${company.name}] 🏁 Campaña "${item.name}" completada: ${item.sentRecipients} entregados, ${item.failedRecipients} fallidos.`,
            );
        }
    }

    saveData(appData);
    await dataStore.saveScheduleInDb(companyId, item).catch(() => {});
}

// Bucle en segundo plano para verificar envíos pendientes
setInterval(async () => {
    const now = new Date();

    for (const company of appData.companies || []) {
        const holder = companyClients.get(company.id);
        if (!holder || holder.status !== 'ready' || !holder.client) continue;

        for (const item of company.schedules || []) {
            if (item.status === 'pending') {
                const scheduledDate = new Date(item.scheduledTime);
                if (scheduledDate <= now) {
                    // Ejecutar de manera asíncrona sin bloquear el loop
                    executeScheduleCampaign(company.id, item).catch((err) => {
                        console.error(
                            `[${company.name}] Error inesperado en campaña ${item.id}:`,
                            err,
                        );
                    });
                }
            }
        }
    }
}, 10000);

// =========================================================================
// MIDDLEWARE DE RESOLUCIÓN DE EMPRESA
// =========================================================================

async function resolveCompany(req, res, next) {
    const rawQueryId = req.query.companyId;
    const rawHeaderId = req.headers['x-company-id'];
    const rawBodyId = req.body?.companyId;

    let requestedId = null;
    if (
        rawQueryId &&
        rawQueryId !== 'undefined' &&
        rawQueryId !== 'null' &&
        typeof rawQueryId === 'string' &&
        rawQueryId.trim()
    ) {
        requestedId = rawQueryId.trim();
    } else if (
        rawHeaderId &&
        rawHeaderId !== 'undefined' &&
        rawHeaderId !== 'null' &&
        typeof rawHeaderId === 'string' &&
        rawHeaderId.trim()
    ) {
        requestedId = rawHeaderId.trim();
    } else if (
        rawBodyId &&
        rawBodyId !== 'undefined' &&
        rawBodyId !== 'null' &&
        typeof rawBodyId === 'string' &&
        rawBodyId.trim()
    ) {
        requestedId = rawBodyId.trim();
    } else {
        requestedId = appData.activeCompanyId || 'default';
    }

    let company = appData.companies.find((c) => c.id === requestedId);
    if (!company) {
        company =
            appData.companies.find((c) => c.id === appData.activeCompanyId) ||
            appData.companies[0];
    }
    if (!company) {
        return res.status(404).json({
            error: 'No se encontró la empresa solicitada en el sistema.',
        });
    }

    // Validación estricta de pertenencia (aplica a todos los usuarios, incluidos superadministradores)
    if (req.user && req.user.id) {
        try {
            const memberCheck = await pool.query(
                'SELECT cu.role_id, cu.is_owner, r.permissions FROM company_users cu JOIN roles r ON r.id = cu.role_id WHERE cu.user_id = $1 AND cu.company_id = $2 AND cu.status = $3',
                [req.user.id, company.id, 'active'],
            );
            if (memberCheck.rows.length === 0) {
                return res.status(403).json({
                    error: `Acceso restringido: no estás vinculado a la empresa "${company.name}".`,
                });
            }
            req.companyMembership = memberCheck.rows[0];
        } catch (dbErr) {
            console.error(
                'Error validando membresía en resolveCompany:',
                dbErr,
            );
            return res
                .status(500)
                .json({ error: 'Error validando membresía de empresa' });
        }
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
        const identifier =
            req.body.identifier || req.body.email || req.body.username;
        const password = req.body.password;
        const targetCompId =
            req.query.companyId ||
            req.headers['x-company-id'] ||
            req.body.companyId ||
            appData.activeCompanyId;
        const result = await authService.login(
            identifier,
            password,
            targetCompId,
        );
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, password, companyName } = req.body;
        const result = await authService.register(
            fullName,
            email,
            password,
            companyName,
        );
        // Recargar datos multi-empresa
        appData = await dataStore.loadAllAppData();
        const newCompId = result.company?.id || result.activeCompanyId;
        if (newCompId) {
            initCompanyWhatsAppClient(newCompId);
        }
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
        const targetCompId =
            req.query.companyId ||
            req.headers['x-company-id'] ||
            appData.activeCompanyId;
        const context = await authService.getUserContext(
            req.user.id,
            targetCompId,
        );
        res.json({ success: true, ...context });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const result = await authService.changePassword(
            req.user.id,
            currentPassword,
            newPassword,
        );
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/auth/profile', requireAuth, async (req, res) => {
    try {
        const { fullName, phone } = req.body;
        const result = await authService.updateProfile(req.user.id, {
            fullName,
            phone,
        });
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
        const result = await authService.addTeamMember(
            req.params.id,
            req.user.id,
            req.body,
        );
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put(
    '/api/companies/:id/team/members/:userId',
    requireAuth,
    async (req, res) => {
        try {
            const result = await authService.updateTeamMemberRole(
                req.params.id,
                req.user.id,
                req.params.userId,
                req.body.roleId,
            );
            res.json({ success: true, member: result });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    },
);

app.delete(
    '/api/companies/:id/team/members/:userId',
    requireAuth,
    async (req, res) => {
        try {
            const result = await authService.removeTeamMember(
                req.params.id,
                req.user.id,
                req.params.userId,
            );
            res.json({ success: true, ...result });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    },
);

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
        const role = await authService.createCustomRole(
            req.params.id,
            req.body,
        );
        res.json({ success: true, role });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete(
    '/api/companies/:id/roles/:roleId',
    requireAuth,
    async (req, res) => {
        try {
            await authService.deleteCustomRole(
                req.params.id,
                req.params.roleId,
            );
            res.json({ success: true, message: 'Rol eliminado exitosamente' });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    },
);

// =========================================================================
// RUTAS DE GESTIÓN DE EMPRESAS (MULTI-TENANT CON PERSISTENCIA EN DB)
// =========================================================================

// Listar empresas disponibles para el usuario (solo aquellas a las que pertenece)
app.get('/api/companies', async (req, res) => {
    if (!req.user || !req.user.id) {
        return res.json({
            activeCompanyId: null,
            companies: [],
        });
    }

    try {
        const userComps = await authService.getUserCompanies(req.user.id);
        const allowedCompanyIds = new Set(userComps.map((c) => c.id));

        const filtered = appData.companies.filter((c) =>
            allowedCompanyIds.has(c.id),
        );

        const list = filtered.map((c) => {
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
                pendingSchedulesCount: (c.schedules || []).filter(
                    (s) => s.status === 'pending',
                ).length,
            };
        });

        let activeCompanyId = appData.activeCompanyId;
        if (!allowedCompanyIds.has(activeCompanyId)) {
            activeCompanyId = list.length > 0 ? list[0].id : null;
        }

        res.json({
            activeCompanyId,
            companies: list,
        });
    } catch (err) {
        console.error('Error listando empresas del usuario:', err);
        res.status(500).json({ error: 'Error al listar empresas' });
    }
});

// Crear una nueva empresa con su propio bot y entorno aislado
app.post('/api/companies', requireAuth, async (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        if (!name) {
            return res
                .status(400)
                .json({ error: 'El nombre de la empresa es obligatorio' });
        }

        const id = 'comp_' + Date.now();
        const newCompany = createDefaultCompany(name, id);
        newCompany.createdBy = req.user ? req.user.id : null;

        appData.companies.push(newCompany);
        appData.activeCompanyId = id;
        saveData(appData);

        // Persistir en PostgreSQL vinculando al creador como propietario
        await dataStore.createCompanyInDb(
            id,
            name,
            req.user ? req.user.id : null,
            true,
        );

        // Inicializar bot exclusivo para esta empresa
        initCompanyWhatsAppClient(id);

        res.json({ success: true, company: newCompany, activeCompanyId: id });
    } catch (e) {
        console.error('Error creando empresa:', e);
        res.status(500).json({
            error: e.message || 'Error al crear la empresa',
        });
    }
});

// Actualizar nombre de empresa
app.put('/api/companies/:id', requireAuth, async (req, res) => {
    const comp = appData.companies.find((c) => c.id === req.params.id);
    if (!comp) return res.status(404).json({ error: 'Empresa no encontrada' });

    // Validar que el usuario sea superadmin o propietario/admin de la empresa
    try {
        const member = await pool.query(
            "SELECT cu.is_owner, cu.role_id FROM company_users cu WHERE cu.user_id = $1 AND cu.company_id = $2 AND cu.status = 'active'",
            [req.user.id, req.params.id],
        );
        if (
            !req.user.isSuperadmin &&
            (member.rows.length === 0 ||
                (!member.rows[0].is_owner &&
                    member.rows[0].role_id !== 'role_admin'))
        ) {
            return res.status(403).json({
                error: 'No tienes permisos de administrador para modificar esta empresa.',
            });
        }
    } catch (err) {
        return res.status(500).json({ error: 'Error verificando permisos' });
    }

    if (req.body.name) {
        const cleanName = req.body.name.trim();
        if (cleanName) {
            const oldName = comp.name;
            comp.name = cleanName;
            if (comp.settings) {
                comp.settings.businessName = cleanName;
                if (
                    comp.settings.fallbackMessage &&
                    oldName &&
                    comp.settings.fallbackMessage.includes(oldName)
                ) {
                    comp.settings.fallbackMessage =
                        comp.settings.fallbackMessage
                            .split(oldName)
                            .join(cleanName);
                }
            }
            // Persistir en PostgreSQL
            await dataStore
                .updateCompanyNameInDb(req.params.id, cleanName)
                .catch((e) =>
                    console.error('Error actualizando empresa en DB:', e),
                );
        }
    }

    saveData(appData);
    res.json({ success: true, company: comp });
});

// Seleccionar empresa activa (solo permitida si el usuario está activamente vinculado a ella)
app.post('/api/companies/:id/select', requireAuth, async (req, res) => {
    try {
        const comp = appData.companies.find((c) => c.id === req.params.id);
        if (!comp)
            return res.status(404).json({ error: 'Empresa no encontrada' });

        const userComps = await authService.getUserCompanies(req.user.id);
        const isMember = userComps.some((c) => c.id === comp.id);
        if (!isMember) {
            return res.status(403).json({
                error: 'Acceso denegado: no estás vinculado a esta empresa.',
            });
        }

        appData.activeCompanyId = comp.id;
        saveData(appData);
        res.json({ success: true, activeCompanyId: comp.id, name: comp.name });
    } catch (err) {
        console.error('Error seleccionando empresa:', err);
        res.status(500).json({ error: 'Error al cambiar de empresa' });
    }
});

// Eliminar una empresa (no se permite si es la única, y requiere ser propietario o superadmin)
app.delete('/api/companies/:id', requireAuth, async (req, res) => {
    if (appData.companies.length <= 1) {
        return res.status(400).json({
            error: 'No es posible eliminar la única empresa registrada.',
        });
    }

    // Validar que sea propietario o superadmin
    try {
        const member = await pool.query(
            "SELECT cu.is_owner FROM company_users cu WHERE cu.user_id = $1 AND cu.company_id = $2 AND cu.status = 'active'",
            [req.user.id, req.params.id],
        );
        if (
            !req.user.isSuperadmin &&
            (member.rows.length === 0 || !member.rows[0].is_owner)
        ) {
            return res.status(403).json({
                error: 'Solo el propietario de la empresa o un superadministrador pueden eliminarla.',
            });
        }
    } catch (err) {
        return res.status(500).json({ error: 'Error verificando permisos' });
    }

    const index = appData.companies.findIndex((c) => c.id === req.params.id);
    if (index === -1)
        return res.status(404).json({ error: 'Empresa no encontrada' });

    const toDeleteId = req.params.id;

    await stopCompanyWhatsAppClient(toDeleteId);

    appData.companies.splice(index, 1);
    if (appData.activeCompanyId === toDeleteId) {
        appData.activeCompanyId = appData.companies[0].id;
    }

    saveData(appData);
    await dataStore
        .deleteCompanyFromDb(toDeleteId)
        .catch((e) => console.error('Error eliminando empresa en DB:', e));

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
        lastLeadUpdate: req.company._lastLeadUpdate || 0,
        pendingSchedulesCount: (req.company.schedules || []).filter(
            (s) => s.status === 'pending',
        ).length,
    });
});

// 2. Subida de Archivos
app.post('/api/upload', (req, res) => {
    try {
        const body = req.body || {};
        const filename = body.filename || body.name;
        const mimetype = body.mimetype || body.type;
        const data = body.data || body.base64;
        const folder = body.folder || body.category;

        if (!filename || !data) {
            return res.status(400).json({
                error: 'Faltan parámetros: filename y data (base64) son requeridos',
            });
        }

        const targetFolder = ['rules', 'quick', 'received', 'library'].includes(
            folder,
        )
            ? folder
            : 'rules';
        const dirPath = path.join(UPLOADS_DIR, targetFolder);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        const cleanName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const uniqueFilename = `${Date.now()}_${cleanName}`;
        const savePath = path.join(dirPath, uniqueFilename);

        const cleanBase64 = data.includes(';base64,')
            ? data.split(';base64,').pop()
            : data;
        const buffer = Buffer.from(cleanBase64, 'base64');
        fs.writeFileSync(savePath, buffer);

        const detectedMime =
            mimetype ||
            (mime && typeof mime.getType === 'function'
                ? mime.getType(savePath)
                : null) ||
            'application/octet-stream';
        const fileUrl = `/uploads/${targetFolder}/${uniqueFilename}`;

        const fileObj = {
            url: fileUrl,
            filename: cleanName,
            mimetype: detectedMime,
            size: buffer.length,
        };

        res.json({
            success: true,
            file: fileObj,
            ...fileObj,
        });
    } catch (e) {
        console.error('Error en /api/upload:', e);
        res.status(500).json({
            error: e.message || 'Error al procesar el archivo subido',
        });
    }
});

// 3. Reiniciar cliente WhatsApp de la empresa seleccionada
app.post('/api/bot/restart', resolveCompany, async (req, res) => {
    try {
        const shouldClean =
            req.query.clean === 'true' || req.body?.clean === true;
        if (shouldClean) {
            await unlinkCompanyWhatsApp(req.companyId);
        } else {
            await stopCompanyWhatsAppClient(req.companyId);
        }
        initCompanyWhatsAppClient(req.companyId);
        res.json({
            success: true,
            message: `Iniciando cliente de WhatsApp para ${req.company.name}...`,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Desvincular / Cerrar sesión de WhatsApp de la empresa para permitir vincular un número nuevo
app.post('/api/bot/disconnect', resolveCompany, async (req, res) => {
    try {
        await unlinkCompanyWhatsApp(req.companyId);
        res.json({
            success: true,
            message: `Sesión de WhatsApp desvinculada para ${req.company.name}.`,
        });
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

// Helper universal para resolver el chatId de WhatsApp y el teléfono de almacenamiento
function findLeadAndChatId(company, rawPhone) {
    if (!company)
        return {
            lead: null,
            chatId: null,
            cleanDigits: '',
            storagePhone: rawPhone,
        };
    const leads = company.leads || [];
    const raw = String(rawPhone || '').trim();
    const cleanDigits = raw.replace(/\D/g, '');

    // 1. Buscar en leads por coincidencia exacta, por dígitos o con sufijos
    let lead = leads.find(
        (l) =>
            l.phone === raw ||
            (cleanDigits && l.phone === cleanDigits) ||
            (cleanDigits && l.phone.replace(/\D/g, '') === cleanDigits) ||
            (cleanDigits && l.phone === `${cleanDigits}@lid`) ||
            (cleanDigits && l.phone === `${cleanDigits}@c.us`),
    );

    // 2. Determinar el chatId exacto para WhatsApp
    let chatId = null;
    if (
        raw.endsWith('@lid') ||
        raw.endsWith('@c.us') ||
        raw.endsWith('@g.us')
    ) {
        chatId = raw;
    } else if (
        lead &&
        lead.phone &&
        (lead.phone.endsWith('@lid') ||
            lead.phone.endsWith('@g.us') ||
            lead.phone.endsWith('@c.us'))
    ) {
        chatId = lead.phone;
    } else if (cleanDigits) {
        chatId = `${cleanDigits}@c.us`;
    }

    const storagePhone =
        lead?.phone ||
        (chatId && chatId.endsWith('@lid') ? chatId : cleanDigits || raw);

    return { lead, chatId, cleanDigits, storagePhone };
}

// 5. Enviar mensaje directo / prueba inmediata con el WhatsApp de la empresa seleccionada
app.post('/api/send', resolveCompany, async (req, res) => {
    const { phone, message, media } = req.body;
    if (!phone || (!message && !media)) {
        return res
            .status(400)
            .json({ error: 'Faltan parámetros phone y (message o media)' });
    }

    const holder = companyClients.get(req.companyId);
    if (!holder || holder.status !== 'ready' || !holder.client) {
        return res.status(503).json({
            error: `El WhatsApp de ${req.company.name} no está conectado todavía. Escanea el código QR primero.`,
        });
    }

    try {
        const {
            lead: existingLead,
            chatId,
            cleanDigits,
            storagePhone,
        } = findLeadAndChatId(req.company, phone);
        if (!chatId) {
            return res
                .status(400)
                .json({ error: 'Número de WhatsApp inválido' });
        }
        let result;

        if (media && media.url) {
            const relPath = media.url.startsWith('/')
                ? media.url.slice(1)
                : media.url;
            const fullPath = path.join(__dirname, 'public', relPath);
            let mediaInstance = null;

            if (fs.existsSync(fullPath)) {
                mediaInstance = MessageMedia.fromFilePath(fullPath);
            } else if (media.url.startsWith('http')) {
                mediaInstance = await MessageMedia.fromUrl(media.url);
            }

            if (mediaInstance) {
                result = await holder.client.sendMessage(
                    chatId,
                    mediaInstance,
                    { caption: message || undefined },
                );
            } else {
                result = await holder.client.sendMessage(chatId, message || '');
            }
        } else {
            result = await holder.client.sendMessage(chatId, message);
        }

        const msgSerializedId = result?.id?._serialized || null;
        await dataStore.saveMessageInDb(
            req.companyId,
            cleanDigits || storagePhone,
            true,
            message || '',
            media?.url,
            media?.mimetype,
            'chat',
            msgSerializedId,
        );
        broadcastChatMessage(req.companyId, cleanDigits || storagePhone, {
            id: msgSerializedId || `send_${Date.now()}`,
            fromMe: true,
            body: message || (media ? '📎 Archivo enviado' : ''),
            timestamp: Date.now(),
            type: 'chat',
            hasMedia: Boolean(media),
            mediaUrl: media?.url || null,
        });

        if (!req.company.leads) req.company.leads = [];
        let lead =
            existingLead ||
            req.company.leads.find(
                (l) =>
                    l.phone === storagePhone ||
                    (cleanDigits && l.phone === cleanDigits),
            );
        if (lead) {
            lead.lastMessage = message || (media ? '📎 Archivo enviado' : '');
            lead.lastInteraction = new Date().toISOString();
            saveData(appData);
            await dataStore.upsertLeadInDb(req.companyId, lead).catch(() => {});
        }

        res.json({
            success: true,
            message: `Mensaje entregado a ${storagePhone || cleanDigits}`,
            id: msgSerializedId,
        });
    } catch (err) {
        console.error('Error enviando mensaje directo:', err);
        res.status(500).json({
            error: err.message || 'Error al enviar el mensaje',
        });
    }
});

// 6. CRUD de Reglas / Rutas de Respuesta de la empresa seleccionada
app.get('/api/rules', resolveCompany, (req, res) => {
    res.json(req.company.rules || []);
});

app.post('/api/rules', resolveCompany, async (req, res) => {
    const {
        name,
        triggers,
        response,
        matchType,
        leadTag,
        pauseBot,
        triggerType,
        mediaTypeFilter,
        media,
        parentRuleId,
    } = req.body;
    if (!name || (!response && !media)) {
        return res.status(400).json({
            error: 'Campos requeridos: name y (response o archivo adjunto)',
        });
    }

    const newRule = {
        id: 'rule-' + Date.now(),
        name,
        enabled: true,
        parentRuleId: parentRuleId || null,
        triggerType: triggerType || 'text',
        mediaTypeFilter: mediaTypeFilter || 'any',
        matchType: matchType || 'contains_any',
        triggers: Array.isArray(triggers)
            ? triggers
            : triggers
              ? triggers.split(',').map((s) => s.trim())
              : [],
        response: response || '',
        media: media || null,
        leadTag: leadTag || 'Interesado',
        pauseBot: Boolean(pauseBot),
    };

    if (!req.company.rules) req.company.rules = [];
    req.company.rules.push(newRule);
    saveData(appData);
    await dataStore
        .saveRuleInDb(req.companyId, newRule)
        .catch((e) => console.error('Error guardando regla en DB:', e));

    res.json(newRule);
});

app.put('/api/rules/:id', resolveCompany, async (req, res) => {
    if (!req.company.rules) req.company.rules = [];
    const index = req.company.rules.findIndex((r) => r.id === req.params.id);
    if (index === -1)
        return res.status(404).json({ error: 'Regla no encontrada' });

    const updatedParentRuleId =
        req.body.parentRuleId !== undefined
            ? req.body.parentRuleId || null
            : req.company.rules[index].parentRuleId;

    req.company.rules[index] = {
        ...req.company.rules[index],
        ...req.body,
        parentRuleId: updatedParentRuleId,
        id: req.params.id,
    };
    saveData(appData);
    await dataStore
        .saveRuleInDb(req.companyId, req.company.rules[index])
        .catch((e) => console.error('Error actualizando regla en DB:', e));

    res.json(req.company.rules[index]);
});

app.delete('/api/rules/:id', resolveCompany, async (req, res) => {
    if (!req.company.rules) req.company.rules = [];
    req.company.rules = req.company.rules.filter((r) => r.id !== req.params.id);
    saveData(appData);
    await dataStore
        .deleteRuleFromDb(req.companyId, req.params.id)
        .catch((e) => console.error('Error eliminando regla en DB:', e));

    res.json({ success: true });
});

// 7. CRUD de Programación de Envíos & Campañas de Difusión
app.get('/api/schedules', resolveCompany, (req, res) => {
    res.json(req.company.schedules || []);
});

app.post('/api/schedules', resolveCompany, async (req, res) => {
    const {
        name,
        recipient,
        message,
        scheduledTime,
        media,
        targetType = 'single',
        targetValue,
        delaySeconds = 10,
        recurrence = 'none',
    } = req.body;
    const effectiveTargetType = targetType || 'single';
    const effectiveTargetVal = targetValue || recipient || '';

    if (!effectiveTargetVal || (!message && !media) || !scheduledTime) {
        return res.status(400).json({
            error: 'Destinatario/Grupo/Etiqueta, fecha y (mensaje o archivo) son obligatorios.',
        });
    }

    // Calcular cantidad estimada de destinatarios
    let estimatedCount = 1;
    if (effectiveTargetType === 'tag') {
        const matches = (req.company.leads || []).filter(
            (l) =>
                l.tag &&
                l.tag.toLowerCase().trim() ===
                    effectiveTargetVal.toLowerCase().trim() &&
                l.phone &&
                l.phone !== 'status@broadcast' &&
                !l.phone.includes('@broadcast'),
        );
        estimatedCount = matches.length;
    } else if (effectiveTargetType === 'group') {
        const memberPhones = await dataStore
            .getGroupMemberPhonesFromDb(req.companyId, effectiveTargetVal)
            .catch(() => []);
        estimatedCount = memberPhones.length;
    }

    const validRecurrence = [
        'none',
        'daily',
        'weekly',
        'monthly',
        'yearly',
    ].includes(recurrence)
        ? recurrence
        : 'none';

    const newSchedule = {
        id: 'sched-' + Date.now(),
        name:
            name ||
            (effectiveTargetType === 'single'
                ? 'Envío Individual'
                : `Campaña ${effectiveTargetType}: ${effectiveTargetVal}`),
        recipient:
            effectiveTargetType === 'single'
                ? effectiveTargetVal.replace(/\D/g, '')
                : effectiveTargetVal,
        targetType: effectiveTargetType,
        targetValue: effectiveTargetVal,
        totalRecipients: estimatedCount,
        sentRecipients: 0,
        failedRecipients: 0,
        delaySeconds: parseInt(delaySeconds, 10) || 10,
        recurrence: validRecurrence,
        lastSentAt: null,
        executionLogs: [],
        message: message || '',
        media: media || null,
        scheduledTime,
        status: 'pending',
        createdAt: new Date().toISOString(),
    };

    if (!req.company.schedules) req.company.schedules = [];
    req.company.schedules.unshift(newSchedule);
    saveData(appData);
    await dataStore
        .saveScheduleInDb(req.companyId, newSchedule)
        .catch((e) => console.error('Error guardando envío en DB:', e));

    res.json(newSchedule);
});

app.put('/api/schedules/:id', resolveCompany, async (req, res) => {
    if (!req.company.schedules) req.company.schedules = [];
    const item = req.company.schedules.find((s) => s.id === req.params.id);
    if (!item)
        return res
            .status(404)
            .json({ error: 'Envío programado no encontrado' });

    const {
        name,
        recipient,
        message,
        scheduledTime,
        media,
        targetType = 'single',
        targetValue,
        delaySeconds = 10,
        recurrence,
        relaunch = false,
    } = req.body;

    const effectiveTargetType = targetType || item.targetType || 'single';
    const effectiveTargetVal =
        targetValue || recipient || item.targetValue || item.recipient || '';

    if (!effectiveTargetVal || (!message && !media) || !scheduledTime) {
        return res.status(400).json({
            error: 'Destinatario/Grupo/Etiqueta, fecha y (mensaje o archivo) son obligatorios.',
        });
    }

    // Calcular cantidad estimada de destinatarios
    let estimatedCount = 1;
    if (effectiveTargetType === 'tag') {
        const matches = (req.company.leads || []).filter(
            (l) =>
                l.tag &&
                l.tag.toLowerCase().trim() ===
                    effectiveTargetVal.toLowerCase().trim() &&
                l.phone &&
                l.phone !== 'status@broadcast' &&
                !l.phone.includes('@broadcast'),
        );
        estimatedCount = matches.length;
    } else if (effectiveTargetType === 'group') {
        const memberPhones = await dataStore
            .getGroupMemberPhonesFromDb(req.companyId, effectiveTargetVal)
            .catch(() => []);
        estimatedCount = memberPhones.length;
    }

    item.name = name ? name.trim() : item.name;
    item.targetType = effectiveTargetType;
    item.targetValue = effectiveTargetVal;
    item.recipient =
        effectiveTargetType === 'single'
            ? effectiveTargetVal.replace(/\D/g, '')
            : effectiveTargetVal;
    item.totalRecipients = estimatedCount;
    item.delaySeconds = parseInt(delaySeconds, 10) || 10;
    if (recurrence !== undefined) {
        item.recurrence = [
            'none',
            'daily',
            'weekly',
            'monthly',
            'yearly',
        ].includes(recurrence)
            ? recurrence
            : 'none';
    }
    item.message = message !== undefined ? message : item.message;
    if (media !== undefined) {
        item.media = media;
    }
    item.scheduledTime = scheduledTime;

    // Reactivar como 'pending' si ya fue ejecutada/cancelada o tiene fecha futura
    const isPastState =
        item.status === 'sent' ||
        item.status === 'failed' ||
        item.status === 'cancelled';
    const isFutureSchedule = new Date(scheduledTime) > new Date();

    if (relaunch || isPastState || isFutureSchedule) {
        item.status = 'pending';
        item.sentRecipients = 0;
        item.failedRecipients = 0;
        item.executionLogs = [];
        item.sentAt = null;
    }

    saveData(appData);
    await dataStore
        .saveScheduleInDb(req.companyId, item)
        .catch((e) => console.error('Error actualizando envío en DB:', e));

    res.json({ success: true, schedule: item });
});

app.delete('/api/schedules/:id', resolveCompany, async (req, res) => {
    if (!req.company.schedules) req.company.schedules = [];
    req.company.schedules = req.company.schedules.filter(
        (s) => s.id !== req.params.id,
    );
    saveData(appData);
    await dataStore
        .deleteScheduleFromDb(req.companyId, req.params.id)
        .catch((e) => console.error('Error eliminando envío en DB:', e));

    res.json({ success: true });
});

app.post('/api/schedules/:id/send-now', resolveCompany, async (req, res) => {
    if (!req.company.schedules) req.company.schedules = [];
    const item = req.company.schedules.find((s) => s.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Envío no encontrado' });

    const holder = companyClients.get(req.companyId);
    if (!holder || holder.status !== 'ready' || !holder.client) {
        return res.status(503).json({
            error: `El WhatsApp de ${req.company.name} no está conectado todavía.`,
        });
    }

    // Reiniciar estado y contadores si se relanza manualmente
    item.status = 'pending';
    item.sentRecipients = 0;
    item.failedRecipients = 0;
    item.executionLogs = [];
    item.sentAt = null;
    saveData(appData);
    await dataStore.saveScheduleInDb(req.companyId, item).catch(() => {});

    // Iniciar ejecución asíncrona de la campaña
    executeScheduleCampaign(req.companyId, item).catch((err) => {
        console.error('Error ejecutando campaña manual:', err);
    });

    res.json({ success: true, message: 'Campaña iniciada', schedule: item });
});

app.post('/api/schedules/:id/cancel', resolveCompany, async (req, res) => {
    if (!req.company.schedules) req.company.schedules = [];
    const item = req.company.schedules.find((s) => s.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Envío no encontrado' });

    item.status = 'cancelled';
    saveData(appData);
    await dataStore.saveScheduleInDb(req.companyId, item).catch(() => {});

    res.json({ success: true, message: 'Campaña cancelada' });
});

// =========================================================================
// 7.B. GRUPOS PERSONALIZADOS DE DIFUSIÓN & CONTACTOS
// =========================================================================

app.get('/api/groups', resolveCompany, (req, res) => {
    res.json(req.company.groups || []);
});

app.post('/api/groups', resolveCompany, async (req, res) => {
    const { name, description, color } = req.body;
    if (!name || !name.trim()) {
        return res
            .status(400)
            .json({ error: 'El nombre del grupo es obligatorio.' });
    }

    const newGroup = {
        id: 'grp_' + Date.now(),
        name: name.trim(),
        description: description ? description.trim() : '',
        color: color || '#38bdf8',
        memberCount: 0,
        createdAt: new Date().toISOString(),
    };

    if (!req.company.groups) req.company.groups = [];
    req.company.groups.push(newGroup);
    saveData(appData);
    await dataStore
        .saveContactGroupInDb(req.companyId, newGroup)
        .catch((e) => console.error('Error guardando grupo en DB:', e));

    res.json(newGroup);
});

app.delete('/api/groups/:id', resolveCompany, async (req, res) => {
    if (!req.company.groups) req.company.groups = [];
    req.company.groups = req.company.groups.filter(
        (g) => g.id !== req.params.id,
    );
    saveData(appData);
    await dataStore
        .deleteContactGroupFromDb(req.companyId, req.params.id)
        .catch((e) => console.error('Error eliminando grupo en DB:', e));

    res.json({ success: true });
});

app.get('/api/groups/:id/members', resolveCompany, async (req, res) => {
    try {
        const phones = await dataStore.getGroupMemberPhonesFromDb(
            req.companyId,
            req.params.id,
        );
        const contacts = req.company.contacts || [];
        const leads = req.company.leads || [];
        const members = phones.map((ph) => {
            const cleanDigits = String(ph).replace(/\D/g, '');
            const ct = contacts.find(
                (c) =>
                    c.phone === ph ||
                    (cleanDigits &&
                        c.phone &&
                        c.phone.replace(/\D/g, '') === cleanDigits),
            );
            const ld = leads.find(
                (l) =>
                    l.phone === ph ||
                    (cleanDigits &&
                        l.phone &&
                        l.phone.replace(/\D/g, '') === cleanDigits),
            );
            return {
                phone: ph,
                name: ct?.name || ld?.name || ph,
                tag: ct?.tags || ld?.tag || 'Sin etiqueta',
                source: ct
                    ? ct.source === 'whatsapp'
                        ? 'WhatsApp'
                        : 'Google CSV'
                    : ld
                      ? 'CRM Lead'
                      : 'Directo',
            };
        });
        res.json({ members, phones });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/groups/:id/members', resolveCompany, async (req, res) => {
    const { phones } = req.body;
    if (!phones || !Array.isArray(phones) || phones.length === 0) {
        return res.status(400).json({ error: 'Lista de teléfonos requerida' });
    }

    try {
        await dataStore.addLeadsToGroupInDb(
            req.companyId,
            req.params.id,
            phones,
        );
        const group = (req.company.groups || []).find(
            (g) => g.id === req.params.id,
        );
        if (group) {
            const allPhones = await dataStore.getGroupMemberPhonesFromDb(
                req.companyId,
                req.params.id,
            );
            group.memberCount = allPhones.length;
            saveData(appData);
        }
        res.json({ success: true, count: phones.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete(
    '/api/groups/:id/members/:phone',
    resolveCompany,
    async (req, res) => {
        try {
            await dataStore.removeLeadFromGroupInDb(
                req.companyId,
                req.params.id,
                req.params.phone,
            );
            const group = (req.company.groups || []).find(
                (g) => g.id === req.params.id,
            );
            if (group) {
                const allPhones = await dataStore.getGroupMemberPhonesFromDb(
                    req.companyId,
                    req.params.id,
                );
                group.memberCount = allPhones.length;
                saveData(appData);
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    },
);

// =========================================================================
// 7.C. AGENDA DE CONTACTOS & IMPORTACIÓN (GOOGLE CSV & WHATSAPP)
// =========================================================================

app.get('/api/contacts', resolveCompany, (req, res) => {
    res.json(req.company.contacts || []);
});

app.post('/api/contacts', resolveCompany, async (req, res) => {
    const { phone, name, source = 'manual', tags = '', notes = '' } = req.body;
    if (!phone || !phone.trim()) {
        return res.status(400).json({ error: 'El teléfono es obligatorio' });
    }
    const cleanPhone = phone.trim().replace(/\D/g, '');
    const newContact = {
        id: 'cnt_' + Date.now(),
        phone: cleanPhone || phone.trim(),
        name: (name && name.trim()) || cleanPhone || phone.trim(),
        source,
        tags,
        notes,
        createdAt: new Date().toISOString(),
    };
    if (!req.company.contacts) req.company.contacts = [];
    const idx = req.company.contacts.findIndex(
        (c) => c.phone === newContact.phone,
    );
    if (idx !== -1) {
        req.company.contacts[idx] = {
            ...req.company.contacts[idx],
            ...newContact,
        };
    } else {
        req.company.contacts.push(newContact);
    }
    saveData(appData);
    await dataStore
        .saveContactInDb(req.companyId, newContact)
        .catch((e) => console.error('Error guardando contacto en DB:', e));
    res.json({ success: true, contact: newContact });
});

app.delete('/api/contacts/:phone', resolveCompany, async (req, res) => {
    const phone = req.params.phone;
    if (!req.company.contacts) req.company.contacts = [];
    req.company.contacts = req.company.contacts.filter(
        (c) => c.phone !== phone,
    );
    saveData(appData);
    await dataStore
        .deleteContactFromDb(req.companyId, phone)
        .catch((e) => console.error('Error eliminando contacto de DB:', e));
    res.json({ success: true });
});

app.post('/api/contacts/import-csv', resolveCompany, async (req, res) => {
    const {
        csv,
        defaultTag = 'Importado Google',
        defaultPrefix = '57',
        groupId,
    } = req.body;
    if (!csv || !csv.trim()) {
        return res
            .status(400)
            .json({ error: 'El contenido del archivo CSV es requerido.' });
    }

    try {
        const parsed = contactsService.parseGoogleContactsCsv(csv, {
            defaultPrefix,
            defaultTag,
        });
        if (parsed.contacts.length === 0) {
            return res.status(400).json({
                error: 'No se encontraron contactos válidos con teléfono en el archivo.',
            });
        }

        const contactsToInsert = parsed.contacts.map((c) => ({
            id:
                'cnt_' +
                Date.now() +
                '_' +
                Math.random().toString(36).substr(2, 6),
            phone: c.phone,
            name: c.name || c.phone,
            source: 'google_csv',
            tags: defaultTag || c.tag || 'Importado Google',
            notes: '',
            createdAt: new Date().toISOString(),
        }));

        await dataStore.bulkUpsertContactsInDb(req.companyId, contactsToInsert);

        if (groupId) {
            const phones = contactsToInsert.map((l) => l.phone);
            await dataStore.addLeadsToGroupInDb(req.companyId, groupId, phones);
            const grp = (req.company.groups || []).find(
                (g) => g.id === groupId,
            );
            if (grp) {
                const allPhones = await dataStore.getGroupMemberPhonesFromDb(
                    req.companyId,
                    groupId,
                );
                grp.memberCount = allPhones.length;
            }
        }

        if (!req.company.contacts) req.company.contacts = [];
        for (const newCt of contactsToInsert) {
            const existingIdx = req.company.contacts.findIndex(
                (c) => c.phone === newCt.phone,
            );
            if (existingIdx !== -1) {
                req.company.contacts[existingIdx] = {
                    ...req.company.contacts[existingIdx],
                    ...newCt,
                };
            } else {
                req.company.contacts.push(newCt);
            }
        }
        saveData(appData);

        res.json({
            success: true,
            importedCount: parsed.contacts.length,
            invalidCount: parsed.invalidCount,
        });
    } catch (err) {
        console.error('Error importando CSV de Google Contacts:', err);
        res.status(400).json({
            error: err.message || 'Error procesando el archivo CSV',
        });
    }
});

app.post('/api/contacts/sync-whatsapp', resolveCompany, async (req, res) => {
    const holder = companyClients.get(req.companyId);
    if (!holder || holder.status !== 'ready' || !holder.client) {
        return res.status(503).json({
            error: `El WhatsApp de ${req.company.name} no está conectado todavía. Escanea el código QR primero.`,
        });
    }

    const { defaultTag = 'Agenda WhatsApp', groupId } = req.body;

    try {
        const rawContacts = await holder.client.getContacts();
        const validContacts = (rawContacts || []).filter(
            (c) =>
                c &&
                c.isMyContact &&
                c.isUser &&
                !c.isGroup &&
                c.number &&
                c.number !== 'status' &&
                !String(c.number).includes('@'),
        );

        if (validContacts.length === 0) {
            return res.json({
                success: true,
                syncedCount: 0,
                message:
                    'No se encontraron contactos guardados en la agenda del teléfono.',
            });
        }

        const contactsToInsert = validContacts.map((c) => ({
            id:
                'cnt_' +
                Date.now() +
                '_' +
                Math.random().toString(36).substr(2, 6),
            phone: c.number,
            name: c.name || c.pushname || c.number,
            source: 'whatsapp',
            tags: defaultTag || 'Agenda WhatsApp',
            notes: '',
            createdAt: new Date().toISOString(),
        }));

        await dataStore.bulkUpsertContactsInDb(req.companyId, contactsToInsert);

        if (groupId) {
            const phones = contactsToInsert.map((l) => l.phone);
            await dataStore.addLeadsToGroupInDb(req.companyId, groupId, phones);
            const grp = (req.company.groups || []).find(
                (g) => g.id === groupId,
            );
            if (grp) {
                const allPhones = await dataStore.getGroupMemberPhonesFromDb(
                    req.companyId,
                    groupId,
                );
                grp.memberCount = allPhones.length;
            }
        }

        if (!req.company.contacts) req.company.contacts = [];
        for (const newCt of contactsToInsert) {
            const existingIdx = req.company.contacts.findIndex(
                (c) => c.phone === newCt.phone,
            );
            if (existingIdx !== -1) {
                req.company.contacts[existingIdx] = {
                    ...req.company.contacts[existingIdx],
                    ...newCt,
                };
            } else {
                req.company.contacts.push(newCt);
            }
        }
        saveData(appData);

        res.json({
            success: true,
            syncedCount: contactsToInsert.length,
        });
    } catch (err) {
        console.error('Error sincronizando contactos de WhatsApp:', err);
        res.status(500).json({
            error: err.message || 'Error al obtener contactos de WhatsApp',
        });
    }
});

// 8. Leads / Contactos y Archivos de la empresa seleccionada
app.get('/api/leads', resolveCompany, (req, res) => {
    res.json(req.company.leads || []);
});

app.post('/api/leads/:phone/toggle-pause', resolveCompany, async (req, res) => {
    if (!req.company.leads) req.company.leads = [];
    const { lead } = findLeadAndChatId(req.company, req.params.phone);
    if (!lead) return res.status(404).json({ error: 'Contacto no encontrado' });

    lead.humanPaused = !lead.humanPaused;
    saveData(appData);
    await dataStore
        .upsertLeadInDb(req.companyId, lead)
        .catch((e) =>
            console.error('Error actualizando pausa de lead en DB:', e),
        );

    res.json({ success: true, humanPaused: lead.humanPaused });
});

// 8.1. Obtener historial de chat con un prospecto (en vivo de WhatsApp o de base de datos)
app.get('/api/leads/:phone/messages', resolveCompany, async (req, res) => {
    const rawPhone = req.params.phone || '';
    const { lead, chatId, cleanDigits, storagePhone } = findLeadAndChatId(
        req.company,
        rawPhone,
    );
    if (!cleanDigits && !chatId) {
        return res.status(400).json({ error: 'Número de teléfono inválido' });
    }

    let messages = [];
    let liveFetched = false;

    // 1. Intentar obtener mensajes directamente del cliente WhatsApp activo
    const holder = companyClients.get(req.companyId);
    if (holder && holder.status === 'ready' && holder.client && chatId) {
        try {
            const chat = await holder.client.getChatById(chatId);
            if (chat) {
                const rawMsgs = await chat.fetchMessages({ limit: 100 });
                if (Array.isArray(rawMsgs) && rawMsgs.length > 0) {
                    messages = rawMsgs.map((m) => {
                        const isAudio = m.type === 'ptt' || m.type === 'audio';
                        const bodyText =
                            m.body ||
                            (m.hasMedia
                                ? m._data?.caption ||
                                  (isAudio
                                      ? '🎤 [Nota de voz]'
                                      : '📎 [Archivo adjunto]')
                                : '');
                        return {
                            id:
                                m.id?._serialized ||
                                m.id?.id ||
                                `w_${m.timestamp}_${Math.random()}`,
                            fromMe: Boolean(m.fromMe),
                            author: m.author || null,
                            body: bodyText,
                            timestamp: m.timestamp
                                ? m.timestamp > 1e11
                                    ? m.timestamp
                                    : m.timestamp * 1000
                                : Date.now(),
                            type: m.type || 'chat',
                            hasMedia: Boolean(m.hasMedia),
                            mediaUrl: null,
                        };
                    });
                    liveFetched = true;
                }
            }
        } catch (fetchErr) {
            console.warn(
                `[${req.company.name}] Aviso al leer chat de WhatsApp (${chatId}):`,
                fetchErr.message,
            );
        }
    }

    // 2. Si no se obtuvieron en vivo, consultar base de datos
    const dbMessages = await dataStore.getMessagesFromDb(
        req.companyId,
        cleanDigits || storagePhone,
        100,
    );

    // 3. Vincular archivos descargados si están en lead.receivedFiles
    const receivedFiles = lead?.receivedFiles || [];

    if (liveFetched) {
        messages = messages.map((m) => {
            if (m.hasMedia && !m.fromMe && receivedFiles.length > 0) {
                const match = receivedFiles.find((f) => {
                    if (f.caption && m.body && f.caption === m.body)
                        return true;
                    if (f.receivedAt) {
                        const fileTime = new Date(f.receivedAt).getTime();
                        return Math.abs(fileTime - m.timestamp) < 90000;
                    }
                    return false;
                });
                if (match) {
                    return {
                        ...m,
                        mediaUrl: match.url,
                        mediaMimetype: match.mimetype,
                        filename: match.filename,
                    };
                }
            }
            return m;
        });

        // Respaldar mensajes en DB silenciosamente
        for (const m of messages) {
            dataStore
                .saveMessageInDb(
                    req.companyId,
                    cleanDigits || storagePhone,
                    m.fromMe,
                    m.body,
                    m.mediaUrl,
                    m.mediaMimetype,
                    m.type,
                    m.id,
                )
                .catch(() => {});
        }
    } else {
        messages = dbMessages;
    }

    // 4. Fallback si no hay mensajes pero el lead tiene lastMessage registrado
    if (messages.length === 0 && lead && lead.lastMessage) {
        messages = [
            {
                id: 'last_msg_' + Date.now(),
                fromMe: false,
                body: lead.lastMessage,
                timestamp: lead.lastInteraction
                    ? new Date(lead.lastInteraction).getTime()
                    : Date.now(),
                type: 'chat',
                hasMedia: false,
            },
        ];
    }

    res.json({
        success: true,
        phone: storagePhone || cleanDigits,
        leadName: lead?.name || cleanDigits || storagePhone,
        leadTag: lead?.tag || 'Nuevo',
        humanPaused: Boolean(lead?.humanPaused),
        liveFetched,
        messages,
    });
});

// 8.2. Enviar mensaje directo dentro de la vista del chat
app.post('/api/leads/:phone/messages', resolveCompany, async (req, res) => {
    const rawPhone = req.params.phone || '';
    const { message } = req.body;

    if (!rawPhone || !message || !message.trim()) {
        return res.status(400).json({
            error: 'Número de destinatario y mensaje son requeridos.',
        });
    }

    const { lead, chatId, cleanDigits, storagePhone } = findLeadAndChatId(
        req.company,
        rawPhone,
    );
    if (!chatId) {
        return res.status(400).json({
            error: 'No se pudo determinar el identificador del chat para WhatsApp.',
        });
    }

    const holder = companyClients.get(req.companyId);
    if (!holder || holder.status !== 'ready' || !holder.client) {
        return res.status(503).json({
            error: `El WhatsApp de ${req.company.name} no está conectado todavía. Escanea el código QR primero.`,
        });
    }

    try {
        const result = await holder.client.sendMessage(chatId, message.trim());
        const msgId = result?.id?._serialized || `msg_${Date.now()}`;

        // Guardar mensaje en DB PostgreSQL
        await dataStore.saveMessageInDb(
            req.companyId,
            cleanDigits || storagePhone,
            true,
            message.trim(),
            null,
            null,
            'chat',
            msgId,
        );

        const outMessage = {
            id: msgId,
            fromMe: true,
            body: message.trim(),
            timestamp: Date.now(),
            type: 'chat',
            hasMedia: false,
        };

        // Transmitir en tiempo real al SSE
        broadcastChatMessage(
            req.companyId,
            cleanDigits || storagePhone,
            outMessage,
        );

        // Actualizar lead
        if (!req.company.leads) req.company.leads = [];
        let targetLead = lead;
        if (!targetLead) {
            targetLead = {
                phone: storagePhone,
                name: storagePhone,
                tag: 'Nuevo',
                lastMessage: message.trim(),
                lastInteraction: new Date().toISOString(),
                lastSentRuleId: null,
                humanPaused: true,
                receivedFiles: [],
            };
            req.company.leads.unshift(targetLead);
        } else {
            targetLead.lastMessage = message.trim();
            targetLead.lastInteraction = new Date().toISOString();
        }

        saveData(appData);
        await dataStore
            .upsertLeadInDb(req.companyId, targetLead)
            .catch((e) =>
                console.error('Error actualizando lead en DB:', e.message),
            );

        res.json({
            success: true,
            message: outMessage,
        });
    } catch (err) {
        console.error('Error enviando mensaje en chat:', err);
        res.status(500).json({
            error: err.message || 'Error al enviar el mensaje',
        });
    }
});

// 8.3. Transmisión SSE en tiempo real de cambios en el chat
app.get('/api/leads/:phone/stream', resolveCompany, (req, res) => {
    const rawPhone = req.params.phone || '';
    const { cleanDigits, storagePhone } = findLeadAndChatId(
        req.company,
        rawPhone,
    );
    const streamTarget = cleanDigits || storagePhone;
    if (!streamTarget) {
        return res.status(400).end();
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });

    const key = `${req.companyId}_${streamTarget}`;
    if (!chatSSEClients.has(key)) {
        chatSSEClients.set(key, new Set());
    }
    const clientSet = chatSSEClients.get(key);
    clientSet.add(res);

    // Saludo de conexión
    res.write(
        `data: ${JSON.stringify({ type: 'connected', phone: streamTarget })}\n\n`,
    );

    // Heartbeat cada 20 segundos
    const heartbeat = setInterval(() => {
        try {
            res.write(': heartbeat\n\n');
        } catch (e) {
            clearInterval(heartbeat);
        }
    }, 20000);

    req.on('close', () => {
        clearInterval(heartbeat);
        clientSet.delete(res);
        if (clientSet.size === 0) {
            chatSSEClients.delete(key);
        }
    });
});

// 8.4. Transmisión SSE en tiempo real de eventos de la empresa (prospectos, CRM en vivo)
app.get('/api/events', resolveCompany, (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });

    if (!companyEventsClients.has(req.companyId)) {
        companyEventsClients.set(req.companyId, new Set());
    }
    const clientSet = companyEventsClients.get(req.companyId);
    clientSet.add(res);

    // Saludo de conexión inicial con conteo actual de prospectos
    res.write(
        `data: ${JSON.stringify({ event: 'connected', companyId: req.companyId, leadsCount: (req.company.leads || []).length })}\n\n`,
    );

    const heartbeat = setInterval(() => {
        try {
            res.write(': heartbeat\n\n');
        } catch (e) {
            clearInterval(heartbeat);
        }
    }, 20000);

    req.on('close', () => {
        clearInterval(heartbeat);
        clientSet.delete(res);
        if (clientSet.size === 0) {
            companyEventsClients.delete(req.companyId);
        }
    });
});

// 9. Simulador en Vivo de la empresa seleccionada
const simulatorLastSentRuleId = new Map(); // Map<companyId, lastSentRuleId>

app.post('/api/simulate', resolveCompany, async (req, res) => {
    const rawText = (req.body.text || '').trim();
    const text = rawText.toLowerCase();
    const hasMedia = Boolean(req.body.hasMedia);
    const mediaMimetype =
        req.body.mediaMimetype || (hasMedia ? 'image/jpeg' : '');
    const audio = req.body.audio;

    const isAudioSim = Boolean(
        audio ||
        (mediaMimetype &&
            (mediaMimetype.startsWith('audio/') ||
                mediaMimetype.includes('ogg'))),
    );

    const currentLastSent = simulatorLastSentRuleId.get(req.companyId) || null;
    const context = { lastSentRuleId: currentLastSent };
    const matched = matchRule(
        text,
        req.company.rules || [],
        hasMedia || isAudioSim,
        mediaMimetype || (isAudioSim ? 'audio/ogg' : ''),
        context,
    );

    if (matched) {
        simulatorLastSentRuleId.set(req.companyId, matched.id);
        res.json({
            matched: true,
            ruleName: matched.name,
            response: matched.response,
            media: matched.media || null,
            leadTag: matched.leadTag,
            pauseBot: matched.pauseBot,
        });
    } else if (
        req.company.settings.geminiEnabled !== false &&
        geminiService.isConfigured(req.company.settings.geminiApiKey) &&
        libraryService.hasActiveKnowledge(req.company.library) &&
        (rawText || audio)
    ) {
        simulatorLastSentRuleId.set(req.companyId, 'gemini');
        try {
            const businessName =
                req.company.settings.businessName ||
                req.company.name ||
                'Mi Negocio';
            const geminiInput = audio
                ? {
                      text: rawText,
                      audio: audio,
                  }
                : rawText;

            const sessionKey = `sim_${req.companyId}`;
            const aiReply = await geminiService.sendMessage(
                sessionKey,
                geminiInput,
                businessName,
                req.company.library || [],
                req.company.settings.geminiApiKey,
                req.company.settings.geminiModel,
            );
            res.json({
                matched: false,
                isGemini: true,
                response: aiReply,
            });
        } catch (err) {
            console.error('Error en simulador con Gemini:', err.message);
            res.json({
                matched: false,
                response:
                    req.company.settings.fallbackMessage ||
                    'El bot no tiene una respuesta configurada para este mensaje.',
            });
        }
    } else {
        simulatorLastSentRuleId.set(req.companyId, 'fallback');
        res.json({
            matched: false,
            response:
                req.company.settings.fallbackMessage ||
                'El bot no tiene una respuesta configurada para este mensaje.',
        });
    }
});

// Reinicio de sesión de Gemini
app.post('/api/gemini/reset', resolveCompany, (req, res) => {
    const sessionId = req.body.sessionId || `sim_${req.companyId}`;
    geminiService.resetSession(sessionId);
    if (
        sessionId === `sim_${req.companyId}` ||
        sessionId === 'simulator-session'
    ) {
        simulatorLastSentRuleId.delete(req.companyId);
    }
    res.json({ success: true, message: `Sesión de ${sessionId} reiniciada.` });
});

app.get('/api/gemini/status', resolveCompany, (req, res) => {
    const isSuper = Boolean(req.user?.isSuperadmin);
    const customKey = req.company?.settings?.geminiApiKey || null;
    const model = req.company?.settings?.geminiModel || 'gemini-3.5-flash-lite';
    const hasGlobalKey = geminiService.hasGlobalKey();
    const configured = geminiService.isConfigured(customKey);
    // Solo mostrar maskedKey al superadmin, a usuarios normales no revelar la clave
    const maskedKey =
        isSuper && customKey
            ? customKey.length > 8
                ? `${customKey.slice(0, 6)}...${customKey.slice(-4)}`
                : '******'
            : null;

    res.json({
        configured,
        isCustom: Boolean(customKey),
        maskedKey,
        model,
        hasGlobalKey,
        canConfigure: isSuper,
        supportsAudio: true,
    });
});

// Probar conexión de API Key de Gemini (Solo Superusuario)
app.post(
    '/api/gemini/test-key',
    requireSuperadmin,
    resolveCompany,
    async (req, res) => {
        try {
            const { apiKey, model } = req.body;
            const candidateKey =
                apiKey && !apiKey.includes('...')
                    ? apiKey.trim()
                    : req.company?.settings?.geminiApiKey || null;
            const candidateModel =
                model ||
                req.company?.settings?.geminiModel ||
                'gemini-3.5-flash-lite';

            const result = await geminiService.testApiKey(
                candidateKey,
                candidateModel,
            );
            res.json({
                success: true,
                message: `¡Conexión exitosa con Gemini usando el modelo ${result.model}!`,
                details: result,
            });
        } catch (err) {
            console.error('Error probando Gemini API Key:', err);
            res.status(400).json({
                success: false,
                error:
                    err.message || 'No se pudo conectar con la API de Gemini.',
            });
        }
    },
);

// Guardar configuración exclusiva de Gemini para esta empresa (Solo Superusuario)
app.post(
    '/api/gemini/config',
    requireSuperadmin,
    resolveCompany,
    async (req, res) => {
        try {
            const { apiKey, model } = req.body;
            req.company.settings = req.company.settings || {};

            if (apiKey === null || apiKey === '') {
                req.company.settings.geminiApiKey = null;
            } else if (apiKey && !apiKey.includes('...')) {
                req.company.settings.geminiApiKey = apiKey.trim();
            }

            if (model) {
                req.company.settings.geminiModel = model.trim();
            }

            saveData(appData);
            await dataStore
                .saveCompanySettingsInDb(req.companyId, req.company.settings)
                .catch((e) =>
                    console.error('Error guardando configuración en DB:', e),
                );

            const customKey = req.company.settings.geminiApiKey || null;
            const maskedKey = customKey
                ? customKey.length > 8
                    ? `${customKey.slice(0, 6)}...${customKey.slice(-4)}`
                    : '******'
                : null;

            res.json({
                success: true,
                configured: geminiService.isConfigured(customKey),
                isCustom: Boolean(customKey),
                maskedKey,
                model:
                    req.company.settings.geminiModel || 'gemini-3.5-flash-lite',
                hasGlobalKey: geminiService.hasGlobalKey(),
            });
        } catch (err) {
            console.error('Error guardando configuración de Gemini:', err);
            res.status(500).json({
                error: 'Error al guardar la configuración de Gemini',
            });
        }
    },
);

// 10. Configuración General de la empresa seleccionada
app.get('/api/settings', resolveCompany, (req, res) => {
    const s = req.company.settings || {};
    const isSuper = Boolean(req.user?.isSuperadmin);
    const maskedKey =
        isSuper && s.geminiApiKey
            ? s.geminiApiKey.length > 8
                ? `${s.geminiApiKey.slice(0, 6)}...${s.geminiApiKey.slice(-4)}`
                : '******'
            : null;
    res.json({
        ...s,
        geminiApiKeyMasked: maskedKey,
        isCustomGeminiKey: Boolean(s.geminiApiKey),
        canConfigureGemini: isSuper,
    });
});

app.post('/api/settings', resolveCompany, async (req, res) => {
    const prevApiKey = req.company.settings?.geminiApiKey;
    const prevModel = req.company.settings?.geminiModel;
    req.company.settings = { ...req.company.settings, ...req.body };

    // Solo superusuarios pueden alterar geminiApiKey y geminiModel
    if (
        !req.user?.isSuperadmin ||
        (req.body.geminiApiKey && req.body.geminiApiKey.includes('...'))
    ) {
        req.company.settings.geminiApiKey = prevApiKey;
        req.company.settings.geminiModel = prevModel || 'gemini-3.5-flash-lite';
    }

    if (req.body.businessName) {
        req.company.name = req.body.businessName;
    }
    saveData(appData);
    await dataStore
        .saveCompanySettingsInDb(req.companyId, req.company.settings)
        .catch((e) => console.error('Error guardando configuración en DB:', e));

    const s = req.company.settings;
    const isSuper = Boolean(req.user?.isSuperadmin);
    const maskedKey =
        isSuper && s.geminiApiKey
            ? s.geminiApiKey.length > 8
                ? `${s.geminiApiKey.slice(0, 6)}...${s.geminiApiKey.slice(-4)}`
                : '******'
            : null;
    res.json({
        ...s,
        geminiApiKeyMasked: maskedKey,
        isCustomGeminiKey: Boolean(s.geminiApiKey),
        canConfigureGemini: isSuper,
    });
});

// 11. Biblioteca de Contexto de la empresa seleccionada
app.get('/api/library', resolveCompany, (req, res) => {
    req.company.library = req.company.library || [];
    const stats = libraryService.getActiveLibraryContext(req.company.library);
    res.json({
        documents: req.company.library,
        hasActiveKnowledge: libraryService.hasActiveKnowledge(
            req.company.library,
        ),
        stats: {
            totalDocuments: req.company.library.length,
            activeDocuments: stats.activeCount,
            totalWords: stats.totalWords,
        },
    });
});

app.post('/api/library/upload', resolveCompany, async (req, res) => {
    const { filename, data } = req.body;
    if (!filename || !data) {
        return res
            .status(400)
            .json({ error: 'Faltan parámetros filename o data (base64)' });
    }

    try {
        const rawBase64 = data.includes('base64,')
            ? data.split('base64,')[1]
            : data;
        const buffer = Buffer.from(rawBase64, 'base64');
        const customTitle = (req.body.name || '').trim();
        console.log(
            `[${req.company.name}] 📚 Procesando documento para biblioteca: "${filename}" (${buffer.length} bytes)...`,
        );

        const markdown = await libraryService.convertToMarkdown(
            buffer,
            filename,
        );
        const stats = libraryService.calculateStats(markdown);

        const docId = 'doc_' + Date.now();
        libraryService.saveMarkdownFile(docId, markdown);

        const newDoc = {
            id: docId,
            name: customTitle || filename.replace(/\.[^/.]+$/, ''),
            originalFilename: filename,
            wordCount: stats.wordCount,
            charCount: stats.charCount,
            size: buffer.length,
            createdAt: new Date().toISOString(),
            active: true,
        };

        if (!req.company.library) req.company.library = [];
        req.company.library.unshift(newDoc);
        saveData(appData);
        await dataStore
            .saveLibraryDocInDb(req.companyId, newDoc)
            .catch((e) => console.error('Error guardando doc en DB:', e));

        geminiService.clearAllSessions();

        console.log(
            `[${req.company.name}] ✅ Documento "${filename}" convertido a Markdown limpio (${stats.wordCount} palabras).`,
        );
        res.json({
            success: true,
            document: newDoc,
            preview: markdown.slice(0, 500),
        });
    } catch (err) {
        console.error('Error procesando archivo para biblioteca:', err);
        res.status(500).json({
            error: err.message || 'Error procesando el archivo',
        });
    }
});

app.get('/api/library/:id', resolveCompany, (req, res) => {
    req.company.library = req.company.library || [];
    const doc = req.company.library.find((d) => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

    const content = libraryService.getMarkdownContent(doc.id);
    res.json({ document: doc, content });
});

app.put('/api/library/:id', resolveCompany, async (req, res) => {
    req.company.library = req.company.library || [];
    const doc = req.company.library.find((d) => d.id === req.params.id);
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
    await dataStore
        .saveLibraryDocInDb(req.companyId, doc)
        .catch((e) => console.error('Error actualizando doc en DB:', e));
    geminiService.clearAllSessions();

    res.json({ success: true, document: doc });
});

app.delete('/api/library/:id', resolveCompany, async (req, res) => {
    req.company.library = req.company.library || [];
    const index = req.company.library.findIndex((d) => d.id === req.params.id);
    if (index === -1)
        return res.status(404).json({ error: 'Documento no encontrado' });

    libraryService.deleteMarkdownFile(req.params.id);
    req.company.library.splice(index, 1);
    saveData(appData);
    await dataStore
        .deleteLibraryDocFromDb(req.companyId, req.params.id)
        .catch((e) => console.error('Error eliminando doc en DB:', e));
    geminiService.clearAllSessions();

    res.json({ success: true });
});

app.post('/api/library/:id/toggle', resolveCompany, async (req, res) => {
    req.company.library = req.company.library || [];
    const doc = req.company.library.find((d) => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

    doc.active = !doc.active;
    saveData(appData);
    await dataStore
        .saveLibraryDocInDb(req.companyId, doc)
        .catch((e) => console.error('Error actualizando toggle doc en DB:', e));
    geminiService.clearAllSessions();

    res.json({ success: true, active: doc.active });
});

// =========================================================================
// RUTAS EXCLUSIVAS DE SUPERUSUARIO DEL SISTEMA (PANEL SUPERADMIN)
// =========================================================================

// 1. Métricas Globales del Sistema
app.get('/api/superadmin/stats', requireSuperadmin, async (req, res) => {
    try {
        const compCount = await pool.query(
            'SELECT count(*) as count FROM companies',
        );
        const userCount = await pool.query(
            'SELECT count(*) as count FROM users',
        );
        const superCount = await pool.query(
            'SELECT count(*) as count FROM users WHERE is_superadmin = TRUE',
        );
        const leadsCount = await pool.query(
            'SELECT count(*) as count FROM leads',
        );
        const messagesCount = await pool.query(
            'SELECT count(*) as count FROM messages',
        );

        let activeBotsCount = 0;
        for (const [_, state] of companyClients.entries()) {
            if (state && state.status === 'ready') activeBotsCount++;
        }

        res.json({
            success: true,
            stats: {
                companiesCount: parseInt(compCount.rows[0].count, 10),
                usersCount: parseInt(userCount.rows[0].count, 10),
                superadminsCount: parseInt(superCount.rows[0].count, 10),
                leadsCount: parseInt(leadsCount.rows[0].count, 10),
                messagesCount: parseInt(messagesCount.rows[0].count, 10),
                activeBotsCount,
            },
        });
    } catch (err) {
        console.error('Error obteniendo stats de superadmin:', err);
        res.status(500).json({
            error: 'Error cargando estadísticas del sistema',
        });
    }
});

// 2. Listado de todas las empresas para el superadmin (respetando privacidad: sin chats ni lectura de mensajes)
app.get('/api/superadmin/companies', requireSuperadmin, async (req, res) => {
    try {
        const query = `
            SELECT c.id, c.name, c.created_at, c.created_by,
                   u.full_name as creator_name,
                   cs.gemini_api_key, cs.gemini_model, cs.bot_enabled,
                   (SELECT count(*) FROM company_users cu WHERE cu.company_id = c.id) as members_count,
                   (SELECT count(*) FROM rules r WHERE r.company_id = c.id) as rules_count,
                   (SELECT count(*) FROM leads l WHERE l.company_id = c.id) as leads_count,
                   (SELECT count(*) FROM messages m WHERE m.company_id = c.id) as messages_count
            FROM companies c
            LEFT JOIN users u ON u.id = c.created_by
            LEFT JOIN company_settings cs ON cs.company_id = c.id
            ORDER BY c.created_at ASC;
        `;
        const result = await pool.query(query);

        const companiesList = result.rows.map((row) => {
            const clientState = companyClients.get(row.id);
            const customKey = row.gemini_api_key;
            const maskedKey = customKey
                ? customKey.length > 8
                    ? `${customKey.slice(0, 6)}...${customKey.slice(-4)}`
                    : '******'
                : null;

            return {
                id: row.id,
                name: row.name,
                createdAt: row.created_at,
                createdBy: row.created_by,
                creatorName: row.creator_name || 'Sistema',
                botStatus: clientState ? clientState.status : 'disconnected',
                botPhone: clientState?.clientInfo?.wid || null,
                botEnabled: row.bot_enabled !== false,
                membersCount: parseInt(row.members_count || 0, 10),
                rulesCount: parseInt(row.rules_count || 0, 10),
                leadsCount: parseInt(row.leads_count || 0, 10),
                messagesCount: parseInt(row.messages_count || 0, 10),
                geminiModel: row.gemini_model || 'gemini-3.5-flash-lite',
                hasCustomGeminiKey: Boolean(customKey),
                geminiKeyMasked: maskedKey,
                geminiConfigured: geminiService.isConfigured(customKey),
            };
        });

        res.json({ success: true, companies: companiesList });
    } catch (err) {
        console.error('Error listando empresas para superadmin:', err);
        res.status(500).json({ error: 'Error cargando empresas' });
    }
});

// 3. Crear empresa desde Superadmin
app.post('/api/superadmin/companies', requireSuperadmin, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res
                .status(400)
                .json({ error: 'El nombre de la empresa es obligatorio' });
        }
        const companyId = 'comp_' + Date.now();
        await dataStore.createCompanyInDb(
            companyId,
            name.trim(),
            req.user.id,
            false,
        );
        appData = await dataStore.loadAllAppData();
        initCompanyWhatsAppClient(companyId);

        res.json({
            success: true,
            companyId,
            message: `Empresa "${name.trim()}" creada exitosamente`,
        });
    } catch (err) {
        console.error('Error creando empresa desde superadmin:', err);
        res.status(500).json({ error: err.message || 'Error creando empresa' });
    }
});

// 4. Modificar datos de empresa desde Superadmin
app.put(
    '/api/superadmin/companies/:id',
    requireSuperadmin,
    async (req, res) => {
        try {
            const { id } = req.params;
            const { name, botEnabled, geminiEnabled } = req.body;

            if (name && name.trim()) {
                await dataStore.updateCompanyNameInDb(id, name.trim());
            }

            const comp = appData.companies.find((c) => c.id === id);
            if (comp) {
                if (name) comp.name = name.trim();
                if (botEnabled !== undefined)
                    comp.settings.botEnabled = Boolean(botEnabled);
                if (geminiEnabled !== undefined)
                    comp.settings.geminiEnabled = Boolean(geminiEnabled);
                await dataStore.saveCompanySettingsInDb(id, comp.settings);
            }

            res.json({
                success: true,
                message: 'Empresa actualizada correctamente',
            });
        } catch (err) {
            console.error('Error actualizando empresa:', err);
            res.status(500).json({
                error: err.message || 'Error actualizando empresa',
            });
        }
    },
);

// 5. Eliminar empresa desde Superadmin
app.delete(
    '/api/superadmin/companies/:id',
    requireSuperadmin,
    async (req, res) => {
        try {
            const { id } = req.params;
            if (appData.companies.length <= 1) {
                return res.status(400).json({
                    error: 'No puedes eliminar la única empresa existente en el sistema',
                });
            }

            await stopCompanyWhatsAppClient(id);
            await dataStore.deleteCompanyFromDb(id);
            appData = await dataStore.loadAllAppData();

            res.json({
                success: true,
                message: 'Empresa eliminada exitosamente',
            });
        } catch (err) {
            console.error('Error eliminando empresa:', err);
            res.status(500).json({
                error: err.message || 'Error eliminando empresa',
            });
        }
    },
);

// 6. Eliminar vinculación de WhatsApp de una empresa (desconectar y limpiar sesión)
app.post(
    '/api/superadmin/companies/:id/disconnect-whatsapp',
    requireSuperadmin,
    async (req, res) => {
        try {
            const { id } = req.params;
            await unlinkCompanyWhatsApp(id);
            res.json({
                success: true,
                message:
                    'Sesión de WhatsApp desvinculada exitosamente. La empresa puede escanear un nuevo código QR.',
            });
        } catch (err) {
            console.error('Error desvinculando WhatsApp:', err);
            res.status(500).json({
                error: err.message || 'Error desvinculando WhatsApp',
            });
        }
    },
);

// 7. Limpiar la data de una empresa (mensajes, prospectos y archivos temporales, sin tocar configuración ni reglas)
app.post(
    '/api/superadmin/companies/:id/clean-data',
    requireSuperadmin,
    async (req, res) => {
        try {
            const { id } = req.params;
            const comp = appData.companies.find((c) => c.id === id);
            if (!comp) {
                return res.status(404).json({ error: 'Empresa no encontrada' });
            }

            // Purgar mensajes y prospectos de la base de datos
            await pool.query('DELETE FROM messages WHERE company_id = $1', [
                id,
            ]);
            await pool.query('DELETE FROM leads WHERE company_id = $1', [id]);

            // Limpiar en memoria
            comp.leads = [];
            comp._lastLeadUpdate = Date.now();
            simulatorLastSentRuleId.delete(id);
            geminiService.resetSession(id);

            broadcastCompanyEvent(id, 'leads_reloaded', {});

            res.json({
                success: true,
                message: `Data de la empresa "${comp.name}" limpiada exitosamente. Se eliminaron mensajes y prospectos.`,
            });
        } catch (err) {
            console.error('Error limpiando data de empresa:', err);
            res.status(500).json({
                error: err.message || 'Error limpiando data',
            });
        }
    },
);

// 8. Configurar API Key de Gemini para una empresa específica (Superadmin)
app.post(
    '/api/superadmin/companies/:id/gemini-config',
    requireSuperadmin,
    async (req, res) => {
        try {
            const { id } = req.params;
            const { apiKey, model } = req.body;
            const comp = appData.companies.find((c) => c.id === id);
            if (!comp) {
                return res.status(404).json({ error: 'Empresa no encontrada' });
            }

            comp.settings = comp.settings || {};
            if (apiKey === null || apiKey === '') {
                comp.settings.geminiApiKey = null;
            } else if (apiKey && !apiKey.includes('...')) {
                comp.settings.geminiApiKey = apiKey.trim();
            }

            if (model) {
                comp.settings.geminiModel = model.trim();
            }

            await dataStore.saveCompanySettingsInDb(id, comp.settings);

            const customKey = comp.settings.geminiApiKey || null;
            const maskedKey = customKey
                ? customKey.length > 8
                    ? `${customKey.slice(0, 6)}...${customKey.slice(-4)}`
                    : '******'
                : null;

            res.json({
                success: true,
                configured: geminiService.isConfigured(customKey),
                isCustom: Boolean(customKey),
                maskedKey,
                model: comp.settings.geminiModel || 'gemini-3.5-flash-lite',
                hasGlobalKey: geminiService.hasGlobalKey(),
            });
        } catch (err) {
            console.error('Error configurando Gemini para empresa:', err);
            res.status(500).json({
                error: err.message || 'Error guardando clave de Gemini',
            });
        }
    },
);

// 9. Listado de todos los usuarios del sistema (Superadmin)
app.get('/api/superadmin/users', requireSuperadmin, async (req, res) => {
    try {
        const query = `
            SELECT u.id, u.email, u.full_name, u.phone, u.is_active, u.is_superadmin, u.created_at,
                   COALESCE(
                     json_agg(
                       json_build_object(
                         'companyId', c.id,
                         'companyName', c.name,
                         'roleId', r.id,
                         'roleName', r.name,
                         'isOwner', cu.is_owner,
                         'status', cu.status
                       )
                     ) FILTER (WHERE c.id IS NOT NULL),
                     '[]'::json
                   ) as memberships
            FROM users u
            LEFT JOIN company_users cu ON cu.user_id = u.id
            LEFT JOIN companies c ON c.id = cu.company_id
            LEFT JOIN roles r ON r.id = cu.role_id
            GROUP BY u.id, u.email, u.full_name, u.phone, u.is_active, u.is_superadmin, u.created_at
            ORDER BY u.created_at ASC;
        `;
        const result = await pool.query(query);
        res.json({ success: true, users: result.rows });
    } catch (err) {
        console.error('Error listando usuarios para superadmin:', err);
        res.status(500).json({ error: 'Error cargando usuarios' });
    }
});

// 10. Crear nuevo usuario (Superadmin)
app.post('/api/superadmin/users', requireSuperadmin, async (req, res) => {
    try {
        const {
            fullName,
            email,
            password,
            phone,
            isSuperadmin,
            companyId,
            roleId,
        } = req.body;
        const cleanEmail = (email || '').trim().toLowerCase();
        const cleanName = (fullName || '').trim();

        if (!cleanEmail || !password || !cleanName) {
            return res.status(400).json({
                error: 'Nombre completo, correo y contraseña son obligatorios',
            });
        }
        if (password.length < 6) {
            return res.status(400).json({
                error: 'La contraseña debe tener al menos 6 caracteres',
            });
        }

        const existing = await pool.query(
            'SELECT id FROM users WHERE LOWER(email) = $1',
            [cleanEmail],
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({
                error: 'El correo electrónico ya se encuentra registrado',
            });
        }

        const userId = 'usr_' + Date.now();
        const passwordHash = await authService.hashPassword(password);

        await pool.query(
            `
            INSERT INTO users (id, email, password_hash, full_name, phone, is_active, must_change_password, is_superadmin)
            VALUES ($1, $2, $3, $4, $5, TRUE, FALSE, $6)
        `,
            [
                userId,
                cleanEmail,
                passwordHash,
                cleanName,
                phone || null,
                Boolean(isSuperadmin),
            ],
        );

        // Si se asignó empresa
        if (companyId && roleId) {
            await pool.query(
                `
                INSERT INTO company_users (id, user_id, company_id, role_id, is_owner, status)
                VALUES ($1, $2, $3, $4, FALSE, 'active')
                ON CONFLICT (user_id, company_id) DO NOTHING
            `,
                [`cu_${companyId}_${userId}`, userId, companyId, roleId],
            );
        }

        res.json({
            success: true,
            userId,
            message: 'Usuario creado exitosamente',
        });
    } catch (err) {
        console.error('Error creando usuario desde superadmin:', err);
        res.status(500).json({ error: err.message || 'Error creando usuario' });
    }
});

// 11. Modificar usuario (Superadmin)
app.put('/api/superadmin/users/:id', requireSuperadmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { fullName, email, phone, isActive } = req.body;

        const cleanEmail = (email || '').trim().toLowerCase();
        const cleanName = (fullName || '').trim();

        if (cleanEmail) {
            const checkEmail = await pool.query(
                'SELECT id FROM users WHERE LOWER(email) = $1 AND id != $2',
                [cleanEmail, id],
            );
            if (checkEmail.rows.length > 0) {
                return res.status(400).json({
                    error: 'El correo electrónico ya está en uso por otro usuario',
                });
            }
        }

        await pool.query(
            `
            UPDATE users SET
                full_name = COALESCE($1, full_name),
                email = COALESCE($2, email),
                phone = COALESCE($3, phone),
                is_active = COALESCE($4, is_active),
                updated_at = NOW()
            WHERE id = $5
        `,
            [
                cleanName || null,
                cleanEmail || null,
                phone || null,
                isActive !== undefined ? Boolean(isActive) : null,
                id,
            ],
        );

        res.json({
            success: true,
            message: 'Usuario actualizado exitosamente',
        });
    } catch (err) {
        console.error('Error modificando usuario:', err);
        res.status(500).json({
            error: err.message || 'Error actualizando usuario',
        });
    }
});

// 12. Eliminar usuario (Superadmin)
app.delete('/api/superadmin/users/:id', requireSuperadmin, async (req, res) => {
    try {
        const { id } = req.params;
        if (req.user.id === id) {
            return res.status(400).json({
                error: 'No puedes eliminar tu propia cuenta de superusuario en uso',
            });
        }

        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        res.json({ success: true, message: 'Usuario eliminado exitosamente' });
    } catch (err) {
        console.error('Error eliminando usuario:', err);
        res.status(500).json({
            error: err.message || 'Error eliminando usuario',
        });
    }
});

// 13. Restablecer contraseña de usuario (Superadmin)
app.post(
    '/api/superadmin/users/:id/reset-password',
    requireSuperadmin,
    async (req, res) => {
        try {
            const { id } = req.params;
            const { newPassword, requireChangeOnLogin } = req.body;

            if (!newPassword || newPassword.trim().length < 6) {
                return res.status(400).json({
                    error: 'La nueva contraseña debe tener al menos 6 caracteres',
                });
            }

            const passwordHash = await authService.hashPassword(
                newPassword.trim(),
            );
            await pool.query(
                `
            UPDATE users SET
                password_hash = $1,
                must_change_password = $2,
                updated_at = NOW()
            WHERE id = $3
        `,
                [passwordHash, Boolean(requireChangeOnLogin), id],
            );

            res.json({
                success: true,
                message: 'Contraseña restablecida exitosamente.',
                temporaryPassword: newPassword.trim(),
            });
        } catch (err) {
            console.error('Error restableciendo contraseña:', err);
            res.status(500).json({
                error: err.message || 'Error al restablecer contraseña',
            });
        }
    },
);

// 14. Promover / Degradar Superusuario
app.post(
    '/api/superadmin/users/:id/toggle-superadmin',
    requireSuperadmin,
    async (req, res) => {
        try {
            const { id } = req.params;
            const { isSuperadmin } = req.body;

            if (!isSuperadmin && req.user.id === id) {
                const countRes = await pool.query(
                    'SELECT count(*) as count FROM users WHERE is_superadmin = TRUE AND id != $1',
                    [id],
                );
                if (parseInt(countRes.rows[0].count, 10) === 0) {
                    return res.status(400).json({
                        error: 'No puedes revocar tu propio superusuario siendo el único superusuario del sistema.',
                    });
                }
            }

            await pool.query(
                'UPDATE users SET is_superadmin = $1, updated_at = NOW() WHERE id = $2',
                [Boolean(isSuperadmin), id],
            );

            res.json({
                success: true,
                isSuperadmin: Boolean(isSuperadmin),
                message: isSuperadmin
                    ? 'El usuario ahora es Superusuario del sistema.'
                    : 'Se revocaron los privilegios de Superusuario.',
            });
        } catch (err) {
            console.error('Error cambiando rol de superusuario:', err);
            res.status(500).json({
                error: err.message || 'Error actualizando permisos',
            });
        }
    },
);

// 15. Vincular usuario a empresa (Superadmin)
app.post(
    '/api/superadmin/users/:id/companies',
    requireSuperadmin,
    async (req, res) => {
        try {
            const { id: userId } = req.params;
            const { companyId, roleId, isOwner } = req.body;

            if (!companyId || !roleId) {
                return res
                    .status(400)
                    .json({ error: 'Empresa y Rol son obligatorios' });
            }

            await pool.query(
                `
            INSERT INTO company_users (id, user_id, company_id, role_id, is_owner, status)
            VALUES ($1, $2, $3, $4, $5, 'active')
            ON CONFLICT (user_id, company_id) DO UPDATE SET
                role_id = EXCLUDED.role_id,
                is_owner = EXCLUDED.is_owner,
                status = 'active';
        `,
                [
                    `cu_${companyId}_${userId}`,
                    userId,
                    companyId,
                    roleId,
                    Boolean(isOwner),
                ],
            );

            res.json({
                success: true,
                message: 'Usuario vinculado a la empresa exitosamente',
            });
        } catch (err) {
            console.error('Error vinculando usuario a empresa:', err);
            res.status(500).json({
                error: err.message || 'Error vinculando usuario a empresa',
            });
        }
    },
);

// 16. Desvincular usuario de empresa (Superadmin)
app.delete(
    '/api/superadmin/users/:id/companies/:companyId',
    requireSuperadmin,
    async (req, res) => {
        try {
            const { id: userId, companyId } = req.params;
            const activeCount = await pool.query(
                "SELECT COUNT(*)::int as count FROM company_users WHERE company_id = $1 AND status = 'active'",
                [companyId],
            );
            if (activeCount.rows[0].count <= 1) {
                return res.status(400).json({
                    error: 'No es posible desvincular al único usuario activo de la empresa. La empresa no puede quedar sin miembros.',
                });
            }
            await pool.query(
                'DELETE FROM company_users WHERE user_id = $1 AND company_id = $2',
                [userId, companyId],
            );
            res.json({
                success: true,
                message: 'Usuario desvinculado de la empresa exitosamente',
            });
        } catch (err) {
            console.error('Error desvinculando usuario de empresa:', err);
            res.status(500).json({
                error: err.message || 'Error desvinculando usuario',
            });
        }
    },
);

// =========================================================================
// INICIAR SERVIDOR WEB Y CLIENTES MULTI-EMPRESA CON POSTGRESQL
// =========================================================================

app.listen(PORT, async () => {
    try {
        await initDb();
        const dbData = await dataStore.loadAllAppData();
        if (dbData && dbData.companies && dbData.companies.length > 0) {
            appData = dbData;
            console.log(
                `🗄️ Datos cargados exitosamente desde PostgreSQL (${appData.companies.length} empresas registradas)`,
            );
        } else {
            console.log(
                '🏢 Inicializando empresa por defecto en PostgreSQL...',
            );
            await dataStore.createCompanyInDb('default', 'Digital Pass');
            appData = await dataStore.loadAllAppData();
        }
        for (const comp of appData.companies) {
            if (comp.leads) {
                comp.leads = comp.leads.filter(
                    (l) =>
                        l &&
                        l.phone !== 'status@broadcast' &&
                        !String(l.phone).includes('@broadcast'),
                );
            }
        }
    } catch (err) {
        console.error(
            '⚠️ Aviso cargando datos iniciales de PostgreSQL:',
            err.message,
        );
    }

    console.log(`======================================================`);
    console.log(
        `🚀 Panel Visual del Bot de Ventas Multi-Empresa corriendo en:`,
    );
    console.log(`👉 http://localhost:${PORT}`);
    console.log(
        `🏢 Empresas registradas: ${appData.companies.length} (Activa: ${appData.companies.find((c) => c.id === appData.activeCompanyId)?.name || 'Default'})`,
    );
    console.log(`======================================================`);
    initAllCompanyClients();
});

// Manejo de apagado seguro (Graceful Shutdown)
let isShuttingDown = false;
async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(
        `\n🛑 Señal ${signal} detectada. Cerrando instancias de WhatsApp de forma segura...`,
    );
    const closePromises = [];
    for (const [compKey, holder] of companyClients.entries()) {
        if (holder && holder.client) {
            console.log(`Cerrando cliente de WhatsApp [${compKey}]...`);
            closePromises.push(
                holder.client
                    .destroy()
                    .catch((e) =>
                        console.warn(
                            `Error cerrando cliente ${compKey}:`,
                            e.message,
                        ),
                    ),
            );
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
