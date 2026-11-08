'use strict';

require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const crypto = require('crypto');
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

function getSystemInstruction(businessName = 'nuestro negocio', libraryContext = '', catalogProducts = [], justSoldOutProducts = [], justRestockedProducts = [], promotions = []) {
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

    if (catalogProducts && catalogProducts.length > 0) {
        const availableList = catalogProducts.filter((p) => p.is_available !== false && p.isAvailable !== false);
        const unavailableList = catalogProducts.filter((p) => p.is_available === false || p.isAvailable === false);

        let catalogBlock = `\n\n======================================================
📦 CATÁLOGO DE PRODUCTOS DISPONIBLES:
======================================================
Los siguientes productos están DISPONIBLES para venta inmediata:\n`;

        for (const prod of availableList) {
            const images = Array.isArray(prod.images) ? prod.images : [];
            const photoInfo = images.length > 0 ? `Sí (${images.length} foto${images.length > 1 ? 's' : ''} disponible${images.length > 1 ? 's' : ''})` : 'No (sin fotos)';
            catalogBlock += `\n* ${prod.name}
  - Código: ${prod.code}
  - Precio: ${prod.price || 'Consultar'}
  - Descripción: ${prod.description || 'Sin descripción adicional'}
  - Observaciones: ${prod.observations || 'Ninguna'}
  - Fotos disponibles: ${photoInfo}`;
        }

        if (unavailableList.length > 0) {
            catalogBlock += `\n\n------------------------------------------------------
⚠️ PRODUCTOS AGOTADOS / NO DISPONIBLES (¡IMPORTANTE!):
------------------------------------------------------
Los siguientes productos están AGOTADOS Y NO SE DEBEN OFRECER:\n`;
            for (const prod of unavailableList) {
                catalogBlock += `* ${prod.name} (Código: ${prod.code}) -> ESTADO: AGOTADO / NO DISPONIBLE.\n`;
            }
        }

        // Alerta de cambio de disponibilidad en caliente (evita el efecto gaslighting)
        if (justSoldOutProducts && justSoldOutProducts.length > 0) {
            catalogBlock += `\n\n======================================================
🚨 AVISO CRÍTICO DE STOCK EN VIVO (SE ACABA DE AGOTAR DURANTE ESTE CHAT):
======================================================
Los siguientes productos figuraban como disponibles hace unos momentos al inicio de esta conversación, pero ACABAN DE AGOTARSE EN BODEGA HACE UNOS INSTANTES:
${justSoldOutProducts.map((p) => `* ${p.name} (Código: ${p.code})`).join('\n')}

REGLAS DE COMUNICACIÓN TRANSPARENTE (EVITAR CONTRADICCIONES / SIN GASLIGHTING):
- Si en mensajes anteriores de este mismo chat hablaste de este producto como disponible o el cliente estaba preguntando por él o pide ordenarlo:
  * NUNCA hables como si nunca hubiera existido o como si desde el principio hubiera estado agotado (eso haría sentir al cliente engañado).
  * Sé totalmente honesto, cálido y empático: explícale que qué pena con él/ella, pero que justo de bodega te acaban de avisar por sistema que se vendió la última unidad hace unos minutos mientras conversaban.
  * Ofrécele disculpas sinceras y sugiere una alternativa parecida o pregúntale si desea que le avisen cuando vuelva a llegar inventario.
======================================================\n`;
        }

        // Alerta de producto recién reabastecido en vivo (acaba de llegar durante este chat)
        if (justRestockedProducts && justRestockedProducts.length > 0) {
            catalogBlock += `\n\n======================================================
🎉 AVISO DE REABASTECIMIENTO EN VIVO (ACABAN DE LLEGAR UNIDADES):
======================================================
Los siguientes productos figuraban como NO DISPONIBLES / AGOTADOS anteriormente en esta conversación, pero ACABAN DE INGRESAR A BODEGA HACE UNOS INSTANTES Y YA ESTÁN DISPONIBLES:
${justRestockedProducts.map((p) => `* ${p.name} (Código: ${p.code})`).join('\n')}

REGLAS DE COMUNICACIÓN EMOCIONANTE (BUENAS NOTICIAS):
- Si el producto figura en "🎉 AVISO DE REABASTECIMIENTO EN VIVO":
  * Si en mensajes anteriores le habías dicho que estaba agotado, O si el cliente dice que no le interesa si no hay ese producto, o si expresa resignación, desánimo, se despide o no quiere comprar nada más sin ese producto, O si vuelve a preguntar por él:
    ¡DETÉN AL CLIENTE CON ENTUSIASMO Y DALE LA BUENA NOTICIA INMEDIATAMENTE!
    Dile algo como: "¡Espera un momento, estás con muchísima suerte! Justo en este instante me acaban de confirmar de bodega que acaban de llegar nuevas unidades de [Nombre del producto]. ¡Ya lo tenemos disponible para ti!"
  * NUNCA te disculpes ni le ofrezcas otros productos si el producto que buscaba acaba de llegar. Dale la noticia de que YA LLEGÓ el producto que él quería.
  * Ofrécele los detalles (precio, características) y pregúntale si desea apartarlo o realizar el pedido ahora mismo antes de que se vuelva a agotar.
  * Si el cliente solicita fotos o pregunta cómo luce físicamente y tiene fotos disponibles, incluye la directiva [ENVIAR_FOTOS: CODIGO].
- Si el cliente no había preguntado por este producto en particular, trátalo simplemente como un producto disponible normal del catálogo.
======================================================\n`;
        }

        catalogBlock += `\n======================================================
🚨 REGLAS ESTRICTAS DE STOCK Y FOTOGRAFÍAS (OBLIGATORIAS):
======================================================
1. PRODUCTO AGOTADO / NO DISPONIBLE:
   - Si el cliente pregunta por CUALQUIER producto de la lista de "PRODUCTOS AGOTADOS / NO DISPONIBLES":
     * Si en mensajes anteriores de esta misma conversación hablaste de él como disponible, indícale con total franqueza y cordialidad que se acaba de agotar la última unidad en bodega hace unos minutos mientras hablaban.
     * Si no se había hablado de él antes, responde amablemente que por el momento se encuentra agotado.
     * NUNCA digas que está disponible ni envíes fotos de él.
2. PRODUCTO REABASTECIDO EN VIVO (ACABA DE LLEGAR):
   - Si un producto que antes no estaba disponible acaba de llegar a bodega (figura en "AVISO DE REABASTECIMIENTO EN VIVO"):
     * Si el cliente ya había preguntado por él, o si dice que si no hay ese producto no le interesa nada más, o si se despide desanimado:
       DALE LA BUENA NOTICIA CON TOTAL ENTUSIASMO: dile que está con mucha suerte porque justo acaban de ingresar nuevas unidades a bodega en este instante y ya se lo puedes apartar o despachar.
       NO te disculpes ni le ofrezcas otros artículos sustitutos; infórmale con alegría que ese producto exacto ya está disponible.
3. PRODUCTO DISPONIBLE CON FOTOS:
   - Si el producto está en la lista de DISPONIBLES y el cliente pide fotos o pregunta cómo luce físicamente Y dice "Fotos disponibles: Sí":
     Responde cordialmente e incluye OBLIGATORIAMENTE al puro final de tu mensaje:
     [ENVIAR_FOTOS: CODIGO_PRODUCTO]
     (Ejemplo: [ENVIAR_FOTOS: ${availableList[0]?.code || 'PROD-01'}])
4. PRODUCTO DISPONIBLE SIN FOTOS:
   - Si el producto está disponible pero dice "Fotos disponibles: No", infórmale amablemente que por ahora no cuentas con fotos de ese artículo y NO incluyas la directiva.
5. CONSULTA GENERAL SIN PEDIR FOTOS:
   - Si el cliente solo consulta precio o disponibilidad sin pedir fotos, responde solo con texto sin la directiva.
6. PRODUCTO NO VENDIDO:
   - Si preguntan por algo que no vendemos, indícalo con naturalidad.
======================================================`;

        instruction += catalogBlock;
    }

    // Tarea 5: Campañas y Promociones Temporales con Vigencia
    if (promotions && promotions.length > 0) {
        let promoBlock = `\n\n======================================================
🏷️ PROMOCIONES Y CAMPAÑAS ESPECIALES VIGENTES HOY:
======================================================
Actualmente aplican las siguientes promociones vigentes (máximo 2 activas hoy):\n`;
        for (const promo of promotions) {
            promoBlock += `\n* 🎯 CAMPAÑA: ${promo.name}
  - Vigencia: Desde ${promo.startDate || promo.start_date} hasta ${promo.endDate || promo.end_date}
  - Descripción y Condiciones:
${(promo.content || '').trim()}
`;
            if (promo.description && promo.description.trim()) {
                promoBlock += `  - 📌 INSTRUCCIONES E INDICACIONES INTERNAS PARA EL ASISTENTE:
${promo.description.trim()}
`;
            }
        }
        promoBlock += `\nREGLAS DE ATENCIÓN DE PROMOCIONES:
- Si el cliente pregunta por promociones, descuentos, ofertas especiales o por los productos que están en promoción:
  * Infórmale con entusiasmo, cordialidad y claridad sobre estas promociones vigentes hoy.
  * Respeta estrictamente los precios, descuentos y condiciones detalladas en la campaña.
  * Cumple rigurosamente las "INSTRUCCIONES E INDICACIONES INTERNAS PARA EL ASISTENTE" definidas para cada promoción.
  * NUNCA inventes descuentos ni prometas promociones que no figuren en este bloque.
======================================================`;
        instruction += promoBlock;
    }

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
function getOrCreateChat(sessionId, businessName, libraryList = [], modelName = PRIMARY_MODEL, customApiKey = null, catalogProducts = [], promotions = []) {
    const effectiveKey = (customApiKey && typeof customApiKey === 'string' && customApiKey.trim()) ? customApiKey.trim() : globalApiKey;
    const client = getClient(effectiveKey);
    if (!client) {
        throw new Error('Gemini no está configurado. No se encontró ninguna API Key válida.');
    }

    const keyPrefix = effectiveKey ? effectiveKey.slice(-8) : 'global';
    const cacheKey = `${keyPrefix}_${sessionId}`;
    const now = Date.now();

    const availableCodesSet = new Set(
        catalogProducts
            .filter((p) => p.is_available !== false && p.isAvailable !== false)
            .map((p) => (p.code || '').trim().toUpperCase())
    );
    const unavailableCodesSet = new Set(
        catalogProducts
            .filter((p) => p.is_available === false || p.isAvailable === false)
            .map((p) => (p.code || '').trim().toUpperCase())
    );

    let justSoldOutProducts = [];
    let justRestockedProducts = [];
    if (sessions.has(cacheKey)) {
        const prevSession = sessions.get(cacheKey);
        const prevAvailable = prevSession.availableCodes || new Set();
        const prevUnavailable = prevSession.unavailableCodes || new Set();

        justSoldOutProducts = catalogProducts.filter(
            (p) =>
                (p.is_available === false || p.isAvailable === false) &&
                prevAvailable.has((p.code || '').trim().toUpperCase())
        );

        justRestockedProducts = catalogProducts.filter(
            (p) =>
                (p.is_available !== false && p.isAvailable !== false) &&
                (prevUnavailable.has((p.code || '').trim().toUpperCase()) ||
                    (!prevAvailable.has((p.code || '').trim().toUpperCase()) && (prevAvailable.size > 0 || prevUnavailable.size > 0)))
        );
    }

    const { contextText } = libraryService.getActiveLibraryContext(libraryList);
    const systemPrompt = getSystemInstruction(businessName, contextText, catalogProducts, justSoldOutProducts, justRestockedProducts, promotions);
    const currentHash = crypto.createHash('md5').update(systemPrompt || '').digest('hex');

    if (sessions.has(cacheKey)) {
        const session = sessions.get(cacheKey);
        session.lastActivity = now;

        // Si el catálogo y el contexto no han cambiado, reutilizamos la sesión
        if (session.contextHash === currentHash) {
            return session.chat;
        }

        // Si el catálogo cambió en medio del chat (ej: producto marcado No disponible o recién llegado):
        // Recreamos el chat con el nuevo systemPrompt preservando el historial
        let existingHistory = [];
        try {
            if (typeof session.chat.getHistory === 'function') {
                existingHistory = session.chat.getHistory() || [];
            }
        } catch (e) {
            existingHistory = [];
        }

        console.log(`🔄 [${cacheKey}] Catálogo/Instrucciones actualizados en caliente (Agotados en vivo: ${justSoldOutProducts.length}, Reabastecidos en vivo: ${justRestockedProducts.length}). Preservando ${existingHistory.length} mensajes previos.`);

        const updatedChat = client.chats.create({
            model: modelName,
            config: {
                systemInstruction: systemPrompt
            },
            history: existingHistory
        });

        session.chat = updatedChat;
        session.contextHash = currentHash;
        session.availableCodes = availableCodesSet;
        session.unavailableCodes = unavailableCodesSet;
        return updatedChat;
    }

    const chat = client.chats.create({
        model: modelName,
        config: {
            systemInstruction: systemPrompt
        }
    });

    sessions.set(cacheKey, {
        chat,
        lastActivity: now,
        contextHash: currentHash,
        availableCodes: availableCodesSet,
        unavailableCodes: unavailableCodesSet
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
async function sendMessage(sessionId, input, businessName, libraryList = [], customApiKey = null, preferredModel = null, catalogProducts = [], promotions = []) {
    if (!isConfigured(customApiKey)) {
        throw new Error('Gemini no está configurado para esta empresa. Ingresa una API Key en Configuración o configura la clave global en .env.');
    }

    // Regla estricta: Si la biblioteca y el catálogo están vacíos, no operar
    const hasLibrary = libraryService.hasActiveKnowledge(libraryList);
    const hasCatalog = Array.isArray(catalogProducts) && catalogProducts.length > 0;
    if (!hasLibrary && !hasCatalog) {
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
        const chat = getOrCreateChat(sessionId, businessName, libraryList, primaryTarget, customApiKey, catalogProducts, promotions);
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
                const fallbackChat = getOrCreateChat(sessionId, businessName, libraryList, fallbackModel, customApiKey, catalogProducts, promotions);
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
