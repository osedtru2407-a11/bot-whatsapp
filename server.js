const path = require('path');
const fs = require('fs');
const express = require('express');
const QRCode = require('qrcode');
const mime = require('mime');
const { Client, LocalAuth, MessageMedia } = require('./index');

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
            return JSON.parse(raw);
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

// Lógica del Bot de Ventas al recibir un mensaje (Texto o Archivo)
async function handleIncomingMessage(msg) {
    if (!appData.settings.botEnabled) return;
    if (msg.fromMe) return;

    // Ignorar mensajes de grupos si está configurado
    if (appData.settings.ignoreGroups && msg.from.includes('@g.us')) return;

    const senderPhone = msg.from.replace('@c.us', '').replace('@g.us', '');
    const text = (msg.body || '').trim().toLowerCase();

    // 1. Descargar y registrar archivo si el mensaje contiene media
    let receivedMedia = null;
    if (msg.hasMedia) {
        try {
            console.log(`📥 Descargando archivo adjunto recibido de ${senderPhone}...`);
            const downloaded = await msg.downloadMedia();
            if (downloaded) {
                const ext = mime.getExtension(downloaded.mimetype) || 'bin';
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
                    caption: msg.body || ''
                };
                console.log(`✅ Archivo recibido guardado: ${receivedMedia.url} (${downloaded.mimetype})`);
            }
        } catch (err) {
            console.error('Error descargando archivo adjunto de WhatsApp:', err);
        }
    }

    // Si no hay texto ni archivo recibido, nada por hacer
    if (!text && !receivedMedia) return;

    // 2. Buscar o registrar lead / prospecto
    let lead = appData.leads.find(l => l.phone === senderPhone);
    const displayMsg = receivedMedia 
        ? (msg.body ? `📎 [${receivedMedia.filename}] ${msg.body}` : `📎 [${receivedMedia.filename}]`) 
        : msg.body;

    if (!lead) {
        lead = {
            phone: senderPhone,
            name: msg._data?.notifyName || senderPhone,
            tag: receivedMedia ? 'Comprobante/Archivo Enviado' : 'Nuevo',
            lastMessage: displayMsg,
            lastInteraction: new Date().toISOString(),
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

    // 3. Buscar regla coincidente (considerando texto y/o tipo de archivo)
    const hasMedia = Boolean(receivedMedia);
    const mediaMimetype = receivedMedia ? receivedMedia.mimetype : '';
    const matchedRule = matchRule(text, appData.rules, hasMedia, mediaMimetype);

    if (matchedRule) {
        console.log(`Regla activada: "${matchedRule.name}" para contacto ${senderPhone}`);

        if (matchedRule.leadTag) {
            lead.tag = matchedRule.leadTag;
        }

        if (matchedRule.pauseBot) {
            lead.humanPaused = true;
            console.log(`Bot pausado para ${senderPhone} debido a la regla "${matchedRule.name}".`);
        }

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

    } else if (appData.settings.fallbackMessage && (text.length > 1 || hasMedia)) {
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

// Algoritmo de coincidencia de reglas (Soporta Texto, Archivos o Ambos)
function matchRule(text, rules, hasMedia = false, mediaMimetype = '') {
    const activeRules = rules.filter(r => r.enabled !== false);

    for (const rule of activeRules) {
        const triggerType = rule.triggerType || 'text'; // 'text', 'media', 'both'

        // A. Coincidencia por archivo recibido
        if (hasMedia && (triggerType === 'media' || triggerType === 'both' || rule.matchType === 'on_media')) {
            const filter = rule.mediaTypeFilter || 'any'; // 'any', 'image', 'document', 'audio'
            let mediaMatches = false;

            if (filter === 'any') {
                mediaMatches = true;
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
            } else if (filter === 'audio' && (mediaMimetype.startsWith('audio/') || mediaMimetype.includes('ogg'))) {
                mediaMatches = true;
            }

            if (mediaMatches) {
                const triggers = (rule.triggers || []).map(t => t.trim().toLowerCase()).filter(Boolean);
                // Si la regla no exige palabras clave o si no hay texto, se dispara
                if (!triggers.length || !text) {
                    return rule;
                }
                // Si tiene palabras clave requeridas, comprobar si el caption coincide
                if (triggers.some(t => text.includes(t))) {
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

            if (rule.matchType === 'exact') {
                if (triggers.some(t => t === text)) return rule;
            } else if (rule.matchType === 'starts_with') {
                if (triggers.some(t => text.startsWith(t))) return rule;
            } else {
                // Default: 'contains_any'
                if (triggers.some(t => text.includes(t))) return rule;
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
    const { name, triggers, response, matchType, leadTag, pauseBot, triggerType, mediaTypeFilter, media } = req.body;
    if (!name || (!response && !media)) {
        return res.status(400).json({ error: 'Campos requeridos: name y (response o archivo adjunto)' });
    }

    const newRule = {
        id: 'rule-' + Date.now(),
        name,
        enabled: true,
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

    appData.rules[index] = { 
        ...appData.rules[index], 
        ...req.body, 
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

// 9. Simulador en Vivo (Soporta texto y simulación de archivo recibido o enviado)
app.post('/api/simulate', (req, res) => {
    const text = (req.body.text || '').trim().toLowerCase();
    const hasMedia = Boolean(req.body.hasMedia);
    const mediaMimetype = req.body.mediaMimetype || (hasMedia ? 'image/jpeg' : '');

    const matched = matchRule(text, appData.rules, hasMedia, mediaMimetype);
    if (matched) {
        res.json({
            matched: true,
            ruleName: matched.name,
            response: matched.response,
            media: matched.media || null,
            leadTag: matched.leadTag,
            pauseBot: matched.pauseBot
        });
    } else {
        res.json({
            matched: false,
            response: appData.settings.fallbackMessage || 'El bot no tiene una respuesta configurada para este mensaje.'
        });
    }
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

// Iniciar Servidor Web
app.listen(PORT, () => {
    console.log(`======================================================`);
    console.log(`🚀 Panel Visual del Bot de Ventas corriendo en:`);
    console.log(`👉 http://localhost:${PORT}`);
    console.log(`======================================================`);
    initWhatsAppClient();
});
