'use strict';

require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const libraryService = require('./libraryService');

const globalApiKey = process.env.GEMINI_API_KEY || process.env.KEY || null;
const clientsCache = new Map();

if (globalApiKey) {
    try {
        clientsCache.set(globalApiKey, new GoogleGenAI({ apiKey: globalApiKey }));
        console.log('✅ Gemini AI inicializado correctamente con clave global.');
    } catch (e) {
        console.error('❌ Error inicializando GoogleGenAI global:', e.message);
    }
} else {
    console.warn('⚠️ No se encontró GEMINI_API_KEY o KEY en el archivo .env (modo multi-tenant puro)');
}

/**
 * Obtiene o crea un cliente GoogleGenAI para una API Key específica
 */
function getClient(customApiKey = null) {
    const effectiveKey = (customApiKey && typeof customApiKey === 'string' && customApiKey.trim()) ? customApiKey.trim() : globalApiKey;
    if (!effectiveKey) return null;
    if (!clientsCache.has(effectiveKey)) {
        try {
            const client = new GoogleGenAI({ apiKey: effectiveKey });
            clientsCache.set(effectiveKey, client);
        } catch (e) {
            console.error('❌ Error inicializando GoogleGenAI para clave personalizada:', e.message);
            return null;
        }
    }
    return clientsCache.get(effectiveKey);
}

// Almacén de sesiones de conversación en memoria (por clave y remitente)
// Estructura: Map<compositeSessionId, { chat, lastActivity }>
const sessions = new Map();
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos de inactividad

// Limpieza periódica de sesiones inactivas (unref para no bloquear el proceso)
const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, data] of sessions.entries()) {
        if (now - data.lastActivity > SESSION_TIMEOUT_MS) {
            sessions.delete(id);
        }
    }
}, 5 * 60 * 1000);
if (cleanupInterval.unref) cleanupInterval.unref();

function hasGlobalKey() {
    return Boolean(globalApiKey && globalApiKey.trim());
}

function isConfigured(customApiKey = null) {
    const effectiveKey = (customApiKey && typeof customApiKey === 'string' && customApiKey.trim()) ? customApiKey.trim() : globalApiKey;
    return Boolean(effectiveKey && effectiveKey.trim());
}

function getSystemInstruction(businessName = 'nuestro negocio', libraryContext = '') {
    let instruction = `Eres un asistente virtual de atención y ventas por WhatsApp para "${businessName}".
Tus objetivos y reglas de estilo:
1. Responde de forma amable, natural, profesional y concisa (ideal para leer en WhatsApp).
2. FORMATO DE TEXTO PARA WHATSAPP (MUY IMPORTANTE):
   - Para resaltar texto en negrita, usa ÚNICAMENTE un solo asterisco: *texto*. NUNCA USES DOBLE ASTERISCO (**texto**). En WhatsApp el doble asterisco se muestra como texto roto y no se convierte en negrita.
   - Para cursiva usa un solo guion bajo: _texto_.
   - Para tachado usa virgulilla: ~texto~.
   - NO uses encabezados con numerales (como # o ##); en su lugar usa texto corto en negrita (*Título*).
3. Usa saltos de línea y emojis con moderación para que la lectura sea amena.
4. Si el usuario te saluda, salúdalo con calidez y pregúntale en qué le puedes colaborar hoy.
5. Recuerda el contexto de la conversación previa para responder de forma coherente.
6. Si te piden reiniciar la conversación o hablar con un asesor humano, indícalo claramente.
7. Cualquier petición que no esté relacionada con nuestros productos o servicios omítela e indica al usuario (de manera respetuosa) que solamente puedes ayudarlo con información relacionada a nuestros productos y servicios.
8. INTERPRETACIÓN DE NOTAS DE VOZ Y AUDIOS: Los clientes te enviarán audios o notas de voz con preguntas o pedidos. Escucha con atención cada audio (independientemente del acento o velocidad) y responde directamente por texto en WhatsApp resolviendo la consulta de forma cordial, clara y precisa con base en nuestra información de productos y servicios.`;

    if (libraryContext && libraryContext.trim()) {
        instruction += `

======================================================================
📚 BASE DE CONOCIMIENTO AUTORIZADA DEL NEGOCIO (BIBLIOTECA):
======================================================================
La siguiente información es tu ÚNICA fuente de verdad para responder a los clientes sobre nuestros productos, servicios, precios, promociones, horarios, formas de pago, garantías y políticas:

${libraryContext}

REGLAS ESTRICTAS DE RESPUESTA:
- Responde ÚNICAMENTE con los datos proporcionados en los documentos anteriores.
- Si el cliente pregunta por información, precios o condiciones que NO estén presentes en estos documentos, responde de manera cortés y amable diciendo que no cuentas con ese dato exacto en el momento y que con gusto un asesor humano del equipo se comunicará para brindarle el detalle.
- NUNCA inventes características, precios ni datos que no figuren en la base de conocimiento.
======================================================================`;
    }

    return instruction;
}

/**
 * Convierte cualquier formato Markdown residual a formato nativo de WhatsApp
 */
function formatForWhatsApp(text) {
    if (!text) return '';
    return text
        // Encabezados (# Titulo) a negrita WhatsApp (*Titulo*)
        .replace(/^[ \t]*#{1,6}\s*(.+?)\r?$/gm, '*$1*')
        // Negrita + cursiva (***texto***) a WhatsApp (*_texto_*)
        .replace(/\*\*\*([^\*\n\r]+)\*\*\*/g, '*_$1_*')
        // Negrita markdown (**texto**) a negrita WhatsApp (*texto*)
        .replace(/\*\*([^\*\n\r]+)\*\*/g, '*$1*')
        // Negrita markdown con guiones bajos (__texto__) a cursiva WhatsApp (_texto_)
        .replace(/__([^_\n\r]+)__/g, '_$1_')
        // Tachado markdown (~~texto~~) a tachado WhatsApp (~texto~)
        .replace(/~~([^~\n\r]+)~~/g, '~$1~')
        .trim();
}

const PRIMARY_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];

/**
 * Obtiene o crea una sesión de chat para un usuario
 */
function getOrCreateChat(sessionId, businessName, libraryList = [], modelName = PRIMARY_MODEL, customApiKey = null) {
    const effectiveKey = (customApiKey && typeof customApiKey === 'string' && customApiKey.trim()) ? customApiKey.trim() : globalApiKey;
    const client = getClient(effectiveKey);
    if (!client) {
        throw new Error('Gemini no está configurado. No se encontró ninguna API Key válida.');
    }

    const keyPrefix = effectiveKey ? effectiveKey.slice(-8) : 'global';
    const cacheKey = `${keyPrefix}_${sessionId}`;
    const now = Date.now();

    if (sessions.has(cacheKey)) {
        const session = sessions.get(cacheKey);
        session.lastActivity = now;
        return session.chat;
    }

    const { contextText } = libraryService.getActiveLibraryContext(libraryList);
    const systemPrompt = getSystemInstruction(businessName, contextText);

    const chat = client.chats.create({
        model: modelName,
        config: {
            systemInstruction: systemPrompt
        }
    });

    sessions.set(cacheKey, {
        chat,
        lastActivity: now
    });

    return chat;
}

/**
 * Prueba la validez de una API Key enviando una petición mínima de verificación
 */
async function testApiKey(candidateKey = null, modelName = 'gemini-3.5-flash-lite') {
    const effectiveKey = (candidateKey && typeof candidateKey === 'string' && candidateKey.trim()) ? candidateKey.trim() : globalApiKey;
    if (!effectiveKey) {
        throw new Error('No se ha proporcionado ninguna API Key y no hay una clave global configurada en el sistema.');
    }

    const client = new GoogleGenAI({ apiKey: effectiveKey });
    const testModel = modelName || 'gemini-2.5-flash';

    try {
        const response = await client.models.generateContent({
            model: testModel,
            contents: 'Responde únicamente con la palabra "OK".'
        });
        const reply = response.text ? response.text.trim() : 'OK';
        return {
            success: true,
            model: testModel,
            reply
        };
    } catch (err) {
        console.error(`❌ [Gemini testApiKey] Error probando clave con modelo ${testModel}:`, err.message || err);
        let userMessage = err.message || 'Error al conectar con la API de Gemini';
        if (userMessage.includes('API_KEY_INVALID') || userMessage.includes('403') || userMessage.includes('key not valid')) {
            userMessage = 'La API Key proporcionada no es válida o ha sido revocada por Google.';
        } else if (userMessage.includes('QUOTA_EXCEEDED') || userMessage.includes('429')) {
            userMessage = 'La API Key es válida pero ha excedido la cuota de peticiones permitida de Google Gemini.';
        } else if (userMessage.includes('not found') || userMessage.includes('unsupported')) {
            userMessage = `El modelo ${testModel} no está disponible con esta API Key.`;
        }
        throw new Error(userMessage);
    }
}

/**
 * Envía un mensaje (texto y/o nota de voz) a Gemini y obtiene la respuesta
 * @param {string} sessionId - Número de teléfono o ID de simulador
 * @param {string|object} input - Texto del mensaje o { text, audio: { data, mimetype } }
 * @param {string} businessName - Nombre del negocio configurado
 * @param {Array} libraryList - Lista de documentos en appData.library
 * @param {string|null} customApiKey - API Key personalizada de la empresa (opcional)
 * @param {string|null} preferredModel - Modelo preferido de la empresa (opcional)
 * @returns {Promise<string>}
 */
async function sendMessage(sessionId, input, businessName, libraryList = [], customApiKey = null, preferredModel = null) {
    if (!isConfigured(customApiKey)) {
        throw new Error('Gemini no está configurado para esta empresa. Ingresa una API Key en Configuración o configura la clave global en .env.');
    }

    // Regla estricta: Si la biblioteca está vacía o sin documentos activos, Gemini no debe operar para evitar alucinaciones
    if (!libraryService.hasActiveKnowledge(libraryList)) {
        throw new Error('La biblioteca no contiene documentos activos con información. Gemini no puede operar sin base de conocimiento autorizada.');
    }

    const effectiveKey = (customApiKey && typeof customApiKey === 'string' && customApiKey.trim()) ? customApiKey.trim() : globalApiKey;
    const keyPrefix = effectiveKey ? effectiveKey.slice(-8) : 'global';
    const cacheKey = `${keyPrefix}_${sessionId}`;

    let messagePayload;
    let logDescription = '';

    if (typeof input === 'string') {
        const cleanMsg = input.trim();
        if (!cleanMsg) return '';

        // Si el usuario quiere reiniciar la conversación
        const lower = cleanMsg.toLowerCase();
        if (lower === 'reiniciar' || lower === 'reset' || lower === 'olvida la conversacion') {
            sessions.delete(cacheKey);
            return '🔄 Conversación reiniciada. ¿En qué te puedo ayudar ahora?';
        }

        messagePayload = cleanMsg;
        logDescription = `"${cleanMsg}"`;
    } else if (input && typeof input === 'object') {
        const parts = [];
        const { text, audio } = input;

        if (audio && audio.data) {
            let mimeType = (audio.mimetype || 'audio/ogg').split(';')[0].trim().toLowerCase();
            if (mimeType.includes('opus') || mimeType.includes('ogg')) mimeType = 'audio/ogg';
            else if (mimeType.includes('mp4') || mimeType.includes('m4a') || mimeType.includes('aac')) mimeType = 'audio/mp4';
            else if (mimeType.includes('mp3') || mimeType.includes('mpeg')) mimeType = 'audio/mp3';
            else if (mimeType.includes('wav')) mimeType = 'audio/wav';

            parts.push({
                inlineData: {
                    mimeType,
                    data: audio.data
                }
            });
            logDescription = `[Nota de voz / Audio ${mimeType}]`;
        }

        if (text && text.trim()) {
            parts.push(text.trim());
            logDescription += ` "${text.trim()}"`;
        } else if (audio) {
            parts.push('Escucha atentamente esta nota de voz enviada por el cliente por WhatsApp. Identifica con precisión su consulta, duda o solicitud y responde directamente en texto de forma cordial y concisa con base en nuestra información de productos y servicios.');
        }

        if (!parts.length) return '';
        messagePayload = parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts;
    } else {
        return '';
    }

    const chosenModel = preferredModel || PRIMARY_MODEL;
    const candidateModels = [chosenModel, PRIMARY_MODEL, ...FALLBACK_MODELS].filter((m, idx, arr) => arr.indexOf(m) === idx);
    const primaryTarget = candidateModels[0];
    const fallbackList = candidateModels.slice(1);

    // Intento con modelo principal o preferido
    try {
        const chat = getOrCreateChat(sessionId, businessName, libraryList, primaryTarget, customApiKey);
        console.log(`🤖 [Gemini (${primaryTarget})] Consultando para ${sessionId}: ${logDescription}`);

        const response = await chat.sendMessage({ message: messagePayload });
        const replyText = response.text ? response.text.trim() : 'No pude generar una respuesta.';
        const formattedReply = formatForWhatsApp(replyText);

        console.log(`🤖 [Gemini] Respuesta recibida (${formattedReply.length} caracteres, formateada para WhatsApp)`);
        return formattedReply;
    } catch (err) {
        console.warn(`⚠️ [Gemini] Error con ${primaryTarget} (${err.message}). Probando modelos de respaldo...`);
        sessions.delete(cacheKey);

        for (const fallbackModel of fallbackList) {
            try {
                const fallbackChat = getOrCreateChat(sessionId, businessName, libraryList, fallbackModel, customApiKey);
                console.log(`🔄 [Gemini] Intentando con modelo de respaldo ${fallbackModel}...`);
                const response = await fallbackChat.sendMessage({ message: messagePayload });
                const replyText = response.text ? response.text.trim() : 'No pude generar una respuesta.';
                const formattedReply = formatForWhatsApp(replyText);
                console.log(`✅ [Gemini] Respuesta exitosa con modelo de respaldo ${fallbackModel}`);
                return formattedReply;
            } catch (fallbackErr) {
                console.warn(`⚠️ [Gemini] Falló ${fallbackModel}:`, fallbackErr.message);
                sessions.delete(cacheKey);
            }
        }

        console.error(`❌ [Gemini] Todos los modelos fallaron para ${sessionId}:`, err.message || err);
        throw err;
    }
}

/**
 * Reinicia la sesión de un usuario
 */
function resetSession(sessionId) {
    for (const k of sessions.keys()) {
        if (k === sessionId || k.endsWith(`_${sessionId}`)) {
            sessions.delete(k);
        }
    }
}

/**
 * Limpia todas las sesiones activas (útil cuando se actualizan documentos de la biblioteca)
 */
function clearAllSessions() {
    sessions.clear();
    console.log('🔄 Todas las sesiones de chat de Gemini han sido reiniciadas.');
}

module.exports = {
    isConfigured,
    hasGlobalKey,
    sendMessage,
    testApiKey,
    resetSession,
    clearAllSessions,
    formatForWhatsApp
};
