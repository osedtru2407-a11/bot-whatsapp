'use strict';

require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const apiKey = process.env.GEMINI_API_KEY || process.env.KEY;
let ai = null;

if (apiKey) {
    try {
        ai = new GoogleGenAI({ apiKey });
        console.log('✅ Gemini AI inicializado correctamente.');
    } catch (e) {
        console.error('❌ Error inicializando GoogleGenAI:', e.message);
    }
} else {
    console.warn('⚠️ No se encontró GEMINI_API_KEY o KEY en el archivo .env');
}

// Almacén de sesiones de conversación en memoria (por número de teléfono o ID de sesión)
// Estructura: Map<sessionId, { chat, lastActivity }>
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

function isConfigured() {
    return Boolean(ai && apiKey);
}

const libraryService = require('./libraryService');

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
const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

/**
 * Obtiene o crea una sesión de chat para un usuario
 */
function getOrCreateChat(sessionId, businessName, libraryList = [], modelName = PRIMARY_MODEL) {
    const now = Date.now();
    if (sessions.has(sessionId)) {
        const session = sessions.get(sessionId);
        session.lastActivity = now;
        return session.chat;
    }

    const { contextText } = libraryService.getActiveLibraryContext(libraryList);
    const systemPrompt = getSystemInstruction(businessName, contextText);

    const chat = ai.chats.create({
        model: modelName,
        config: {
            systemInstruction: systemPrompt
        }
    });

    sessions.set(sessionId, {
        chat,
        lastActivity: now
    });

    return chat;
}

/**
 * Envía un mensaje (texto y/o nota de voz) a Gemini y obtiene la respuesta
 * @param {string} sessionId - Número de teléfono o ID de simulador
 * @param {string|object} input - Texto del mensaje o { text, audio: { data, mimetype } }
 * @param {string} businessName - Nombre del negocio configurado
 * @param {Array} libraryList - Lista de documentos en appData.library
 * @returns {Promise<string>}
 */
async function sendMessage(sessionId, input, businessName, libraryList = []) {
    if (!isConfigured()) {
        throw new Error('Gemini no está configurado. Verifica la clave KEY o GEMINI_API_KEY en el archivo .env');
    }

    let messagePayload;
    let logDescription = '';

    if (typeof input === 'string') {
        const cleanMsg = input.trim();
        if (!cleanMsg) return '';

        // Si el usuario quiere reiniciar la conversación
        const lower = cleanMsg.toLowerCase();
        if (lower === 'reiniciar' || lower === 'reset' || lower === 'olvida la conversacion') {
            sessions.delete(sessionId);
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

    // Intento con modelo principal
    try {
        const chat = getOrCreateChat(sessionId, businessName, libraryList, PRIMARY_MODEL);
        console.log(`🤖 [Gemini] Consultando para ${sessionId}: ${logDescription}`);

        const response = await chat.sendMessage({ message: messagePayload });
        const replyText = response.text ? response.text.trim() : 'No pude generar una respuesta.';
        const formattedReply = formatForWhatsApp(replyText);

        console.log(`🤖 [Gemini] Respuesta recibida (${formattedReply.length} caracteres, formateada para WhatsApp)`);
        return formattedReply;
    } catch (err) {
        console.warn(`⚠️ [Gemini] Error con ${PRIMARY_MODEL} (${err.message}). Probando modelos de respaldo...`);
        sessions.delete(sessionId);

        for (const fallbackModel of FALLBACK_MODELS) {
            try {
                const fallbackChat = getOrCreateChat(sessionId, businessName, libraryList, fallbackModel);
                console.log(`🔄 [Gemini] Intentando con modelo de respaldo ${fallbackModel}...`);
                const response = await fallbackChat.sendMessage({ message: messagePayload });
                const replyText = response.text ? response.text.trim() : 'No pude generar una respuesta.';
                const formattedReply = formatForWhatsApp(replyText);
                console.log(`✅ [Gemini] Respuesta exitosa con modelo de respaldo ${fallbackModel}`);
                return formattedReply;
            } catch (fallbackErr) {
                console.warn(`⚠️ [Gemini] Falló ${fallbackModel}:`, fallbackErr.message);
                sessions.delete(sessionId);
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
    sessions.delete(sessionId);
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
    sendMessage,
    resetSession,
    clearAllSessions,
    formatForWhatsApp
};
