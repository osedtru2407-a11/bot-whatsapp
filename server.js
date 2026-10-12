const path = require('path');
const fs = require('fs');
const express = require('express');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('./index');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'sales_bot_data.json');

app.use(express.json());
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
        console.log('Cliente WhatsApp LISTO para enviar y recibir mensajes');
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

// Lógica del Bot de Ventas al recibir un mensaje
async function handleIncomingMessage(msg) {
    if (!appData.settings.botEnabled) return;
    if (msg.fromMe) return;

    // Ignorar mensajes de grupos si está configurado
    if (appData.settings.ignoreGroups && msg.from.includes('@g.us')) return;

    const senderPhone = msg.from.replace('@c.us', '').replace('@g.us', '');
    const text = (msg.body || '').trim().toLowerCase();

    if (!text) return;

    // Buscar o registrar lead
    let lead = appData.leads.find(l => l.phone === senderPhone);
    if (!lead) {
        lead = {
            phone: senderPhone,
            name: msg._data?.notifyName || senderPhone,
            tag: 'Nuevo',
            lastMessage: msg.body,
            lastInteraction: new Date().toISOString(),
            humanPaused: false
        };
        appData.leads.unshift(lead);
    } else {
        lead.lastMessage = msg.body;
        lead.lastInteraction = new Date().toISOString();
        if (msg._data?.notifyName && lead.name === senderPhone) {
            lead.name = msg._data.notifyName;
        }
    }

    // Si el contacto está pausado por atención humana
    if (lead.humanPaused) {
        console.log(`Mensaje recibido de ${senderPhone}, pero el bot está pausado para este contacto (atención humana).`);
        saveData(appData);
        return;
    }

    // Buscar regla coincidente
    const matchedRule = matchRule(text, appData.rules);

    if (matchedRule) {
        console.log(`Regla activada: "${matchedRule.name}" para mensaje: "${text}"`);
        
        if (matchedRule.leadTag) {
            lead.tag = matchedRule.leadTag;
        }

        if (matchedRule.pauseBot) {
            lead.humanPaused = true;
            console.log(`Bot pausado para el contacto ${senderPhone} debido a la regla "${matchedRule.name}".`);
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
            } catch (e) {
                // Ignore chat state error
            }
        }

        await msg.reply(matchedRule.response);
    } else if (appData.settings.fallbackMessage && text.length > 1) {
        // Mensaje por defecto si no entendió
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

// Algoritmo de coincidencia de reglas
function matchRule(text, rules) {
    const activeRules = rules.filter(r => r.enabled !== false);
    for (const rule of activeRules) {
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
                console.log(`Ejecutando envío programado a ${item.recipient}: "${item.message.slice(0, 30)}..."`);
                try {
                    const cleanPhone = item.recipient.replace(/\D/g, '');
                    const chatId = `${cleanPhone}@c.us`;
                    await client.sendMessage(chatId, item.message);
                    item.status = 'sent';
                    item.sentAt = new Date().toISOString();
                    console.log(`Envío programado exitoso a ${cleanPhone}`);
                } catch (err) {
                    console.error(`Error en envío programado a ${item.recipient}:`, err);
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

// 2. Reiniciar o desconectar cliente
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

// 3. Activar/Desactivar bot general
app.post('/api/bot/toggle', (req, res) => {
    appData.settings.botEnabled = !appData.settings.botEnabled;
    saveData(appData);
    res.json({ botEnabled: appData.settings.botEnabled });
});

// 4. Enviar mensaje directo / prueba inmediata
app.post('/api/send', async (req, res) => {
    const { phone, message } = req.body;
    if (!phone || !message) {
        return res.status(400).json({ error: 'Faltan parámetros phone y message' });
    }

    if (clientStatus !== 'ready' || !client) {
        return res.status(503).json({ error: 'WhatsApp no está conectado todavía. Escanea el código QR primero.' });
    }

    try {
        const cleanPhone = phone.replace(/\D/g, '');
        const chatId = `${cleanPhone}@c.us`;
        const result = await client.sendMessage(chatId, message);
        res.json({ success: true, message: `Mensaje enviado a ${cleanPhone}`, id: result.id._serialized });
    } catch (err) {
        console.error('Error enviando mensaje directo:', err);
        res.status(500).json({ error: err.message || 'Error al enviar el mensaje' });
    }
});

// 5. CRUD de Reglas / Rutas de Respuesta
app.get('/api/rules', (req, res) => {
    res.json(appData.rules);
});

app.post('/api/rules', (req, res) => {
    const { name, triggers, response, matchType, leadTag, pauseBot } = req.body;
    if (!name || !triggers || !response) {
        return res.status(400).json({ error: 'Campos requeridos: name, triggers, response' });
    }

    const newRule = {
        id: 'rule-' + Date.now(),
        name,
        enabled: true,
        matchType: matchType || 'contains_any',
        triggers: Array.isArray(triggers) ? triggers : triggers.split(',').map(s => s.trim()),
        response,
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

    appData.rules[index] = { ...appData.rules[index], ...req.body, id: req.params.id };
    saveData(appData);
    res.json(appData.rules[index]);
});

app.delete('/api/rules/:id', (req, res) => {
    appData.rules = appData.rules.filter(r => r.id !== req.params.id);
    saveData(appData);
    res.json({ success: true });
});

// 6. CRUD de Programación de Envíos
app.get('/api/schedules', (req, res) => {
    res.json(appData.schedules);
});

app.post('/api/schedules', (req, res) => {
    const { name, recipient, message, scheduledTime } = req.body;
    if (!recipient || !message || !scheduledTime) {
        return res.status(400).json({ error: 'recipient, message y scheduledTime son obligatorios' });
    }

    const newSchedule = {
        id: 'sched-' + Date.now(),
        name: name || 'Campaña sin título',
        recipient: recipient.replace(/\D/g, ''),
        message,
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
        await client.sendMessage(`${cleanPhone}@c.us`, item.message);
        item.status = 'sent';
        item.sentAt = new Date().toISOString();
        saveData(appData);
        res.json({ success: true, message: 'Mensaje enviado de inmediato' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. Leads / Contactos
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

// 8. Simulador en Vivo (para probar reglas sin enviar por WhatsApp real)
app.post('/api/simulate', (req, res) => {
    const text = (req.body.text || '').trim().toLowerCase();
    const matched = matchRule(text, appData.rules);
    if (matched) {
        res.json({
            matched: true,
            ruleName: matched.name,
            response: matched.response,
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

// 9. Configuración General
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
