import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import * as crypto from 'crypto';
import { LibraryService } from './library.service';

const PRIMARY_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];

@Injectable()
export class GeminiService {
  private readonly logger = new Logger('GeminiService');
  private readonly clientsCache = new Map<string, any>();
  private readonly sessions = new Map<
    string,
    {
      chat: any;
      lastActivity: number;
      contextHash: string;
      availableCodes: Set<string>;
      unavailableCodes: Set<string>;
    }
  >();
  private readonly globalApiKey: string | null;

  constructor(private readonly libraryService: LibraryService) {
    this.globalApiKey = process.env.GEMINI_API_KEY || process.env.KEY || process.env.GOOGLE_API_KEY || null;
    if (this.globalApiKey) {
      try {
        this.clientsCache.set(this.globalApiKey, new GoogleGenAI({ apiKey: this.globalApiKey }));
        this.logger.log('GoogleGenAI global inicializado.');
      } catch (err: any) {
        this.logger.error(`Error inicializando GoogleGenAI global: ${err?.message}`);
      }
    }
  }

  getGlobalApiKey(): string | null {
    return (
      process.env.GEMINI_API_KEY ||
      process.env.KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GEMINI_KEY ||
      this.globalApiKey ||
      null
    );
  }

  hasGlobalKey(): boolean {
    const key = this.getGlobalApiKey();
    return Boolean(key && key.trim());
  }

  getClient(customApiKey?: string | null): any {
    const globalKey = this.getGlobalApiKey();
    const effectiveKey = (customApiKey && customApiKey.trim()) ? customApiKey.trim() : globalKey;
    if (!effectiveKey) return null;

    if (!this.clientsCache.has(effectiveKey)) {
      try {
        const client = new GoogleGenAI({ apiKey: effectiveKey });
        this.clientsCache.set(effectiveKey, client);
      } catch (err: any) {
        this.logger.error(`Error inicializando GoogleGenAI: ${err?.message}`);
        return null;
      }
    }

    return this.clientsCache.get(effectiveKey);
  }

  isConfigured(customApiKey?: string | null): boolean {
    const globalKey = this.getGlobalApiKey();
    const effectiveKey = (customApiKey && customApiKey.trim()) ? customApiKey.trim() : globalKey;
    return Boolean(effectiveKey && effectiveKey.trim());
  }

  clearAllSessions() {
    this.sessions.clear();
  }

  private computeContextHash(content: string): string {
    return crypto.createHash('md5').update(content || '').digest('hex');
  }

  formatForWhatsApp(text: string): string {
    if (!text) return '';
    return text
      .replace(/^[ \t]*#{1,6}\s*(.+?)\r?$/gm, '*$1*')
      .replace(/\*\*\*([^\*\n\r]+)\*\*\*/g, '*_$1_*')
      .replace(/\*\*([^\*\n\r]+)\*\*/g, '*$1*')
      .replace(/__([^_\n\r]+)__/g, '_$1_')
      .replace(/~~([^~\n\r]+)~~/g, '~$1~')
      .trim();
  }

  getSystemInstruction(
    businessName: string = 'nuestro negocio',
    libraryContext: string = '',
    instructions?: {
      botTone?: string;
      businessInfo?: string;
      faqText?: string;
      neverDo?: string;
    },
    catalogProducts: any[] = [],
    justSoldOutProducts: any[] = [],
    justRestockedProducts: any[] = [],
    promotions: any[] = [],
  ): string {
    let instruction = `Eres un asistente virtual de atención y ventas por WhatsApp para "${businessName}".
Tus objetivos y reglas de estilo:
1. Responde de forma amable, natural, profesional y concisa (ideal para leer en WhatsApp).
2. FORMATO DE TEXTO PARA WHATSAPP (MUY IMPORTANTE):
   - Para resaltar texto en negrita, usa ÚNICAMENTE un solo asterisco: *texto*. NUNCA USES DOBLE ASTERISCO (**texto**).
   - Para cursiva usa un solo guion bajo: _texto_.
   - Para tachado usa virgulilla: ~texto~.
   - NO uses encabezados con numerales (como # o ##); en su lugar usa texto corto en negrita (*Título*).
3. Usa saltos de línea y emojis con moderación para que la lectura sea amena.
4. Si el usuario te saluda, salúdalo con calidez y pregúntale en qué le puedes colaborar hoy.
5. Recuerda el contexto de la conversación previa para responder de forma coherente.
6. Si te piden hablar con un asesor humano, indícalo cordialmente.
7. Cualquier petición no relacionada con nuestros productos o servicios indícala amablemente fuera de alcance.
8. INTERPRETACIÓN DE NOTAS DE VOZ: Escucha con atención cada audio y responde directamente por texto en WhatsApp resolviendo la consulta de forma cordial y concisa.`;

    if (instructions?.botTone && instructions.botTone.trim()) {
      instruction += `\n\n======================================================
🗣️ CÓMO DEBES HABLARLE A TUS CLIENTES (PERSONALIDAD Y TONO):
======================================================
${instructions.botTone.trim()}`;
    }

    if (instructions?.businessInfo && instructions.businessInfo.trim()) {
      instruction += `\n\n======================================================
🏢 DATOS CLAVE DEL NEGOCIO (HORARIOS, COBERTURA, ENVÍOS, MÉTODOS DE PAGO):
======================================================
${instructions.businessInfo.trim()}`;
    }

    if (instructions?.faqText && instructions.faqText.trim()) {
      instruction += `\n\n======================================================
❓ PREGUNTAS FRECUENTES Y RESPUESTAS AUTORIZADAS:
======================================================
${instructions.faqText.trim()}`;
    }

    if (instructions?.neverDo && instructions.neverDo.trim()) {
      instruction += `\n\n======================================================
⛔ LO QUE NUNCA DEBES HACER NI DECIR (PROHIBICIONES ESTRICTAS):
======================================================
${instructions.neverDo.trim()}
Respeta estas prohibiciones siempre y bajo cualquier circunstancia.`;
    }

    // Tarea 8: Catálogo de productos oficial y regla de despacho de fotos a demanda
    if (catalogProducts && catalogProducts.length > 0) {
      const availableList = catalogProducts.filter((p: any) => p.isAvailable !== false);
      const unavailableList = catalogProducts.filter((p: any) => p.isAvailable === false);

      let catalogBlock = `\n\n======================================================
📦 CATÁLOGO DE PRODUCTOS DISPONIBLES:
======================================================
Los siguientes productos están DISPONIBLES para venta inmediata:\n`;

      for (const prod of availableList) {
        const photoCount = Array.isArray(prod.images) ? prod.images.length : 0;
        const photoInfo = photoCount > 0 ? `Sí (${photoCount} foto${photoCount > 1 ? 's' : ''} disponible${photoCount > 1 ? 's' : ''})` : 'No (sin fotos)';
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
${justSoldOutProducts.map((p: any) => `* ${p.name} (Código: ${p.code})`).join('\n')}

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
${justRestockedProducts.map((p: any) => `* ${p.name} (Código: ${p.code})`).join('\n')}

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
   - Si el producto está disponible pero dice "Fotos disponibles: No", infórmale amablemente que por el momento no tienes fotos registradas de ese producto y NO incluyas la directiva.
5. CONSULTA GENERAL SIN PEDIR FOTOS:
   - Si el cliente solo pregunta el precio, características o saluda sin pedir fotos, responde solo con texto sin la directiva.
6. PRODUCTOS FUERA DE CATÁLOGO:
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
  - Vigencia: Desde ${promo.startDate} hasta ${promo.endDate}
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
      instruction += `\n\n======================================================
📚 INFORMACIÓN ADICIONAL DEL NEGOCIO:
======================================================
La siguiente información complementaria es tu fuente de verdad:

${libraryContext}

REGLAS ESTRICTAS DE RESPUESTA:
- Responde con base en los datos proporcionados.
- Si el cliente pregunta por información que NO esté presente en tus indicaciones ni en estos documentos, indica amablemente que no cuentas con ese dato exacto y que un asesor humano lo atenderá.
- NUNCA inventes características ni precios.
======================================================`;
    }

    return instruction;
  }

  getOrCreateChat(
    sessionId: string,
    businessName: string,
    documents: any[] = [],
    modelName: string = PRIMARY_MODEL,
    customApiKey?: string | null,
    instructions?: {
      botTone?: string;
      businessInfo?: string;
      faqText?: string;
      neverDo?: string;
    },
    catalogProducts: any[] = [],
    promotions: any[] = [],
  ): any {
    const effectiveKey = (customApiKey && customApiKey.trim()) ? customApiKey.trim() : this.globalApiKey;
    const client = this.getClient(effectiveKey);
    if (!client) {
      throw new Error('Gemini no está configurado. No se encontró ninguna API Key válida.');
    }

    const keyPrefix = effectiveKey ? effectiveKey.slice(-8) : 'global';
    const cacheKey = `${keyPrefix}_${sessionId}`;
    const now = Date.now();

    const availableCodesSet = new Set(
      catalogProducts
        .filter((p: any) => p.isAvailable !== false)
        .map((p: any) => (p.code || '').trim().toUpperCase()),
    );
    const unavailableCodesSet = new Set(
      catalogProducts
        .filter((p: any) => p.isAvailable === false)
        .map((p: any) => (p.code || '').trim().toUpperCase()),
    );

    let justSoldOutProducts: any[] = [];
    let justRestockedProducts: any[] = [];
    if (this.sessions.has(cacheKey)) {
      const prev = this.sessions.get(cacheKey)!;
      const prevAvailable = prev.availableCodes || new Set<string>();
      const prevUnavailable = prev.unavailableCodes || new Set<string>();

      justSoldOutProducts = catalogProducts.filter(
        (p: any) => p.isAvailable === false && prevAvailable.has((p.code || '').trim().toUpperCase()),
      );

      justRestockedProducts = catalogProducts.filter(
        (p: any) =>
          p.isAvailable !== false &&
          (prevUnavailable.has((p.code || '').trim().toUpperCase()) ||
            (!prevAvailable.has((p.code || '').trim().toUpperCase()) && (prevAvailable.size > 0 || prevUnavailable.size > 0))),
      );
    }

    const { contextText } = this.libraryService.getActiveLibraryContext(documents);
    const systemPrompt = this.getSystemInstruction(
      businessName,
      contextText,
      instructions,
      catalogProducts,
      justSoldOutProducts,
      justRestockedProducts,
      promotions,
    );
    const currentHash = this.computeContextHash(systemPrompt);

    if (this.sessions.has(cacheKey)) {
      const session = this.sessions.get(cacheKey)!;
      session.lastActivity = now;

      // Si el catálogo y las instrucciones no han cambiado, reutilizamos la sesión
      if (session.contextHash === currentHash) {
        return session.chat;
      }

      // Si el catálogo cambió en medio del chat:
      let existingHistory: any[] = [];
      try {
        if (typeof session.chat.getHistory === 'function') {
          existingHistory = session.chat.getHistory() || [];
        }
      } catch (e) {
        existingHistory = [];
      }

      this.logger.log(
        `🔄 [Sesión ${cacheKey}] Catálogo actualizado en caliente (Agotados en vivo: ${justSoldOutProducts.length}, Reabastecidos en vivo: ${justRestockedProducts.length}). Preservando ${existingHistory.length} mensajes previos.`,
      );

      const updatedChat = client.chats.create({
        model: modelName,
        config: {
          systemInstruction: systemPrompt,
        },
        history: existingHistory,
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
        systemInstruction: systemPrompt,
      },
    });

    this.sessions.set(cacheKey, {
      chat,
      lastActivity: now,
      contextHash: currentHash,
      availableCodes: availableCodesSet,
      unavailableCodes: unavailableCodesSet,
    });
    return chat;
  }

  async testApiKey(candidateKey?: string | null, modelName: string = 'gemini-3.5-flash-lite') {
    const effectiveKey = (candidateKey && candidateKey.trim()) ? candidateKey.trim() : this.globalApiKey;
    if (!effectiveKey) {
      throw new Error('No se ha proporcionado ninguna API Key.');
    }

    const client = new GoogleGenAI({ apiKey: effectiveKey });
    const response = await client.models.generateContent({
      model: modelName,
      contents: 'Responde únicamente con la palabra "OK".',
    });

    return {
      success: true,
      model: modelName,
      reply: response.text ? response.text.trim() : 'OK',
    };
  }

  async sendMessage(
    sessionId: string,
    input: any,
    businessName: string,
    documents: any[] = [],
    customApiKey?: string | null,
    preferredModel?: string | null,
    instructions?: {
      botTone?: string;
      businessInfo?: string;
      faqText?: string;
      neverDo?: string;
    },
    catalogProducts: any[] = [],
    promotions: any[] = [],
  ): Promise<string> {
    if (!this.isConfigured(customApiKey)) {
      throw new Error('Gemini no está configurado para esta empresa.');
    }

    let messagePayload: any;
    if (typeof input === 'string') {
      const clean = input.trim();
      if (!clean) return '';
      if (clean.toLowerCase() === 'reiniciar' || clean.toLowerCase() === 'reset') {
        const effectiveKey = (customApiKey && customApiKey.trim()) ? customApiKey.trim() : this.globalApiKey;
        const keyPrefix = effectiveKey ? effectiveKey.slice(-8) : 'global';
        this.sessions.delete(`${keyPrefix}_${sessionId}`);
        return '🔄 Conversación reiniciada. ¿En qué te puedo ayudar ahora?';
      }
      messagePayload = clean;
    } else if (input && typeof input === 'object') {
      const parts: any[] = [];
      const { text, audio } = input;

      if (audio && audio.data) {
        let mimeType = (audio.mimetype || 'audio/ogg').split(';')[0].trim().toLowerCase();
        parts.push({
          inlineData: {
            mimeType,
            data: audio.data,
          },
        });
      }

      if (text && text.trim()) {
        parts.push(text.trim());
      } else if (audio) {
        parts.push('Escucha atentamente esta nota de voz y responde directamente con base en nuestra información autorizada.');
      }

      messagePayload = parts;
    } else {
      return '';
    }

    const chosenModel = preferredModel || PRIMARY_MODEL;
    const candidateModels = [chosenModel, PRIMARY_MODEL, ...FALLBACK_MODELS].filter((m, i, arr) => arr.indexOf(m) === i);

    for (const model of candidateModels) {
      try {
        const chat = this.getOrCreateChat(
          sessionId,
          businessName,
          documents,
          model,
          customApiKey,
          instructions,
          catalogProducts,
          promotions,
        );
        const response = await chat.sendMessage({ message: messagePayload });
        const rawText = response.text || '';
        return this.formatForWhatsApp(rawText);
      } catch (err: any) {
        this.logger.warn(`Fallo con modelo ${model}: ${err?.message}. Probando fallback...`);
      }
    }

    throw new Error('No fue posible obtener respuesta de Gemini con ninguno de los modelos disponibles.');
  }
}

