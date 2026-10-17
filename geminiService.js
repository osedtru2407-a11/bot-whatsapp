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

// Limpieza periódica de sesiones inactivas
setInterval(() => {
    const now = Date.now();
    for (const [id, data] of sessions.entries()) {
        if (now - data.lastActivity > SESSION_TIMEOUT_MS) {
            sessions.delete(id);
        }
    }
}, 5 * 60 * 1000);

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
7. Cualquier petición que no esté relacionada con nuestros productos o servicios omítela e indica al usuario (de manera respetuosa) que solamente puedes ayudarlo con información relacionada a nuestros productos y servicios`;

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
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

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
 * Envía un mensaje a Gemini y obtiene la respuesta
 * @param {string} sessionId - Número de teléfono o ID de simulador
 * @param {string} message - Mensaje del usuario
 * @param {string} businessName - Nombre del negocio configurado
 * @param {Array} libraryList - Lista de documentos en appData.library
 * @returns {Promise<string>}
 */
async function sendMessage(sessionId, message, businessName, libraryList = []) {
    if (!isConfigured()) {
        throw new Error('Gemini no está configurado. Verifica la clave KEY en el archivo .env');
    }

    const cleanMsg = (message || '').trim();
    if (!cleanMsg) return '';

    // Si el usuario quiere reiniciar la conversación
    const lower = cleanMsg.toLowerCase();
    if (lower === 'reiniciar' || lower === 'reset' || lower === 'olvida la conversacion') {
        sessions.delete(sessionId);
        return '🔄 Conversación reiniciada. ¿En qué te puedo ayudar ahora?';
    }

    try {
        const chat = getOrCreateChat(sessionId, businessName, libraryList, PRIMARY_MODEL);
        console.log(`🤖 [Gemini] Consultando para ${sessionId}: "${cleanMsg}"`);

        const response = await chat.sendMessage({ message: cleanMsg });
        const replyText = response.text ? response.text.trim() : 'No pude generar una respuesta.';
        const formattedReply = formatForWhatsApp(replyText);

        console.log(`🤖 [Gemini] Respuesta recibida (${formattedReply.length} caracteres, formateada para WhatsApp)`);
        return formattedReply;
    } catch (err) {
        console.warn(`⚠️ [Gemini] Error con ${PRIMARY_MODEL} (${err.message}). Intentando con modelo de respaldo ${FALLBACK_MODEL}...`);
        sessions.delete(sessionId);
        try {
            const fallbackChat = getOrCreateChat(sessionId, businessName, libraryList, FALLBACK_MODEL);
            const response = await fallbackChat.sendMessage({ message: cleanMsg });
            const replyText = response.text ? response.text.trim() : 'No pude generar una respuesta.';
            return formatForWhatsApp(replyText);
        } catch (fallbackErr) {
            console.error(`❌ [Gemini] Error definitivo procesando mensaje de ${sessionId}:`, fallbackErr.message || fallbackErr);
            sessions.delete(sessionId);
            throw fallbackErr;
        }
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
