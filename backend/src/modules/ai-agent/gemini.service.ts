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

  clearCompanySessions(companyId: string) {
    for (const key of this.sessions.keys()) {
      if (key.startsWith(companyId) || key.includes(companyId)) {
        this.sessions.delete(key);
      }
    }
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

  /**
   * Tarea 7: Formatear buffer de historial de mensajes literales para Gemini (máximo 6 mensajes / 3 turnos)
   * Garantiza que el primer mensaje siempre sea de rol 'user' como exige la API de Gemini.
   */
  formatHistoryBuffer(messages: any[], maxMessages: number = 6): any[] {
    if (!messages || messages.length === 0) return [];

    const formatted: any[] = [];
    for (const m of messages) {
      if (!m) continue;
      if (m.role && Array.isArray(m.parts)) {
        formatted.push(m);
      } else if (typeof m.body === 'string' && m.body.trim()) {
        formatted.push({
          role: m.fromMe ? 'model' : 'user',
          parts: [{ text: m.body.trim() }],
        });
      }
    }

    let buffer = formatted.slice(-maxMessages);

    // Requisito estricto de Gemini API: el primer mensaje del historial debe ser del usuario ('user')
    while (buffer.length > 0 && buffer[0].role !== 'user') {
      buffer.shift();
    }

    return buffer;
  }

  /**
   * Tarea 7: Generar o actualizar resumen consolidado de conversación (máximo 5 líneas)
   */
  async generateConversationSummary(
    previousSummary: string | null,
    messages: Array<{ fromMe: boolean; body?: string }>,
    customApiKey?: string | null,
  ): Promise<string> {
    if (!messages || messages.length === 0) {
      return previousSummary || '';
    }

    const effectiveKey = (customApiKey && customApiKey.trim()) ? customApiKey.trim() : this.globalApiKey;
    const client = this.getClient(effectiveKey);
    if (!client) {
      return previousSummary || '';
    }

    const transcript = messages
      .filter((m) => m && typeof m.body === 'string' && m.body.trim())
      .map((m) => `${m.fromMe ? 'Asistente' : 'Cliente'}: ${m.body.trim()}`)
      .join('\n');

    if (!transcript) {
      return previousSummary || '';
    }

    const prompt = `Actúa como un asistente experto en ventas y CRM. Tu misión es generar o actualizar un breve resumen consolidado (MÁXIMO 5 LÍNEAS) de la siguiente conversación entre el cliente y el asistente virtual.

El resumen DEBE destacar de forma concisa y directa:
- Qué productos, códigos o prendas consultó o por cuáles mostró interés el cliente.
- Qué detalles específicos dio el cliente (tallas, colores, ciudad de entrega, presupuesto, dudas).
- Qué precios, promociones o información clave le fueron proporcionados.
- En qué estado o acuerdo quedó la conversación.

${previousSummary && previousSummary.trim() ? `RESUMEN PREVIO:\n${previousSummary.trim()}\n\nNUEVOS MENSAJES A CONSOLIDAR:\n` : 'CONVERSACIÓN:\n'}${transcript}

REGLAS ESTRICTAS:
- Máximo 5 líneas con viñetas (-).
- NO agregues introducciones, saludos ni conclusiones.
- Sé 100% fáctico con los productos y datos mencionados.`;

    try {
      const response = await client.models.generateContent({
        model: PRIMARY_MODEL,
        contents: prompt,
      });

      const summaryText = response.text ? response.text.trim() : '';
      if (!summaryText) return previousSummary || '';

      const lines = summaryText
        .split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 0);

      return lines.slice(0, 5).join('\n');
    } catch (err: any) {
      this.logger.warn(`Aviso generando resumen de conversación con Gemini: ${err?.message}`);
      return previousSummary || '';
    }
  }

  getSystemInstruction(
    businessName: string = 'nuestro negocio',
    libraryContext: string = '',
    instructions?: {
      botTone?: string;
      businessInfo?: string;
      faqText?: string;
      neverDo?: string;
      phoneUsageType?: string;
    },
    catalogProducts: any[] = [],
    justSoldOutProducts: any[] = [],
    justRestockedProducts: any[] = [],
    promotions: any[] = [],
    conversationSummary?: string | null,
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

    // Tarea 11: Discriminación Semántica de Chats Personales vs Comerciales (Solo si la línea está configurada en uso mixto)
    if (instructions?.phoneUsageType === 'personal_and_business') {
      instruction += `\n\n======================================================
🛡️ DISCRIMINACIÓN DE CHATS PERSONALES VS COMERCIALES:
======================================================
Esta línea de WhatsApp puede ser de uso compartido entre el negocio y la vida personal/familiar del comerciante. Debes clasificar y actuar según las siguientes pautas:

1. MENSAJES FAMILIARES / PERSONALES / ÍNTIMOS (AUTO-SILENCIADO):
   - Si el mensaje contiene lenguaje inequívocamente familiar, doméstico, afectivo, de parentesco o íntimo ajeno por completo al negocio (por ejemplo: "Hijo, la bendición", "Amor, ¿ya vienes?", "Tío, llámeme", "Mamá, te dejé las llaves", "Mi vida cómo te fue hoy", "Pásame el teléfono del médico"):
     * NO generes ningún texto de respuesta para el chat de WhatsApp.
     * Emite ÚNICAMENTE la directiva de silenciado:
       [MARCAR_PERSONAL: MOTIVO]
       (Ejemplos: [MARCAR_PERSONAL: Mensaje familiar/parentesco], [MARCAR_PERSONAL: Mensaje de pareja/afectivo], [MARCAR_PERSONAL: Mensaje doméstico])

2. SALUDOS NORMALES, NEUTROS O AMBIGUOS (ATENCIÓN COMERCIAL):
   - Si el mensaje es un saludo formal, neutro o ambiguo (por ejemplo: "Hola", "Buenas tardes", "¿Cómo estás?", "Buenas", "Hola cómo te va", "¿Quién habla?"):
     * NUNCA lo marques como personal.
     * Trátalo como un cliente potencial: salúdalo con calidez y cortesía, preséntate como el asistente de "${businessName}" y pregúntale en qué le puedes colaborar hoy.

3. REGLA ESTRICTA DE SEGURIDAD:
   - Solo emite [MARCAR_PERSONAL: MOTIVO] cuando sea 100% evidente e indiscutible que es un familiar, pareja o amigo cercano hablando de temas privados. Ante cualquier duda o si parece un cliente, responde comercialmente.
======================================================`;
    }

    // Tarea 7: Memoria Resumida (Summary-Buffer) de interacciones previas con este cliente
    if (conversationSummary && conversationSummary.trim()) {
      instruction += `\n\n======================================================
📝 RESUMEN DE LA CONVERSACIÓN PREVIA CON ESTE CLIENTE:
======================================================
${conversationSummary.trim()}

(Toma en cuenta este resumen como antecedente fáctico de lo conversado previamente con este cliente. Continúa la conversación con coherencia y naturalidad sin repetir preguntas que ya hayan sido respondidas).`;
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
        const startStr = promo.startDate instanceof Date ? promo.startDate.toISOString().split('T')[0] : (promo.startDate || promo.start_date || '');
        const endStr = promo.endDate instanceof Date ? promo.endDate.toISOString().split('T')[0] : (promo.endDate || promo.end_date || '');
        const promoContent = (promo.content || promo.textContent || '').trim();
        const promoDesc = (promo.description || '').trim();

        promoBlock += `\n* 🎯 CAMPAÑA / OFERTA: ${promo.name}
  - Vigencia: Desde ${startStr} hasta ${endStr}
  - Detalles de la Oferta / Promoción:
${promoContent}
`;
        if (promoDesc) {
          promoBlock += `  - 📌 INSTRUCCIONES E INDICACIONES INTERNAS PARA EL ASISTENTE:
${promoDesc}
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

    // Tarea 10: Detección de Intención de Compra y Alertas en Línea Única
    instruction += `\n\n======================================================
💰 DETECCIÓN DE INTENCIÓN DE COMPRA Y PEDIDOS (OBLIGATORIO):
======================================================
Analiza los mensajes del cliente para detectar si tiene intención explícita de compra o si está cerrando un pedido.
Criterios de detección de venta/pedido:
1. El cliente confirma un pedido o la compra de productos específicos (ej: "Quiero 2 unidades del combo 1", "Me llevo la hamburguesa", "Apartamelo por favor", "Quiero pedir X", "Listo, hazme el pedido").
2. El cliente solicita datos de pago, métodos de transferencia o cuentas bancarias (ej: "¿Cómo te puedo pagar?", "¿A qué cuenta te transfiero?", "¿Tienes Nequi, Daviplata o tarjeta?", "Pásame el link de pago").
3. El cliente proporciona datos de despacho o entrega (ej: "Envíamelo a la Cra 15 # 20-30", "Mi dirección es...").
4. El cliente envía o afirma haber realizado una transferencia o comprobante de pago (ej: "Listo, ya te transferí", "Te acabo de enviar el comprobante").

REGLAS DE ACTUACIÓN CUANDO SE DETECTE UNA VENTA O PEDIDO:
1. Responde al cliente de forma sumamente cordial, confirmándole con amabilidad que su solicitud o pedido ha sido recibido y que un asesor comercial del equipo se pondrá en contacto de inmediato por este mismo chat para coordinar el pago, despacho y entrega.
2. Agrega OBLIGATORIAMENTE al final de tu respuesta (en una nueva línea) la directiva:
   [ALERTA_VENTA: RESUMEN_DEL_PEDIDO]
   Donde "RESUMEN_DEL_PEDIDO" debe ser un resumen sintético de los artículos pedidos, cantidades, total o intención detectada (por ejemplo: [ALERTA_VENTA: 2x Combo Hamburguesa - Solicita datos de transferencia] o [ALERTA_VENTA: Camiseta Talla M - Enviar a Cra 15 # 20-30]).
3. NUNCA inventes números de cuenta bancaria personales no autorizados ni enlaces ficticios; confía siempre el cobro y la confirmación final al asesor humano.
======================================================`;

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
      phoneUsageType?: string;
    },
    catalogProducts: any[] = [],
    promotions: any[] = [],
    conversationSummary?: string | null,
    recentHistory: any[] = [],
  ): any {
    const effectiveKey = (customApiKey && customApiKey.trim()) ? customApiKey.trim() : this.globalApiKey;
    const client = this.getClient(effectiveKey);
    if (!client) {
      throw new Error('Gemini no está configurado. No se encontró ninguna API Key válida.');
    }

    const keyPrefix = effectiveKey ? effectiveKey.slice(-8) : 'global';
    const cacheKey = `${keyPrefix}_${sessionId}`;
    const now = Date.now();

    // Tarea 7: Control de inactividad de sesión (>60 minutos)
    if (this.sessions.has(cacheKey)) {
      const session = this.sessions.get(cacheKey)!;
      const minutesInactive = (now - session.lastActivity) / (1000 * 60);
      if (minutesInactive > 60) {
        this.logger.log(`⏰ [Sesión ${cacheKey}] Sesión expirada (>60 min sin actividad). Reiniciando sesión con resumen y buffer.`);
        this.sessions.delete(cacheKey);
      }
    }

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
      conversationSummary,
    );
    const currentHash = this.computeContextHash(systemPrompt);

    if (this.sessions.has(cacheKey)) {
      const session = this.sessions.get(cacheKey)!;
      session.lastActivity = now;

      // Si el catálogo, promociones y el resumen no han cambiado, reutilizamos la sesión
      if (session.contextHash === currentHash) {
        return session.chat;
      }

      // Si el catálogo, promociones o resumen cambiaron en caliente:
      let existingHistory: any[] = [];
      try {
        if (typeof session.chat.getHistory === 'function') {
          existingHistory = session.chat.getHistory() || [];
        }
      } catch (e) {
        existingHistory = [];
      }

      // Tarea 7: Acotar historial existente a la ventana de 6 mensajes (Summary-Buffer)
      const bufferHistory = this.formatHistoryBuffer(
        existingHistory.length > 0 ? existingHistory : recentHistory,
        6,
      );

      this.logger.log(
        `🔄 [Sesión ${cacheKey}] Contexto/Catálogo actualizado en caliente (Agotados: ${justSoldOutProducts.length}, Reabastecidos: ${justRestockedProducts.length}). Preservando buffer de ${bufferHistory.length} mensajes previos.`,
      );

      const updatedChat = client.chats.create({
        model: modelName,
        config: {
          systemInstruction: systemPrompt,
        },
        history: bufferHistory.length > 0 ? bufferHistory : undefined,
      });

      session.chat = updatedChat;
      session.contextHash = currentHash;
      session.availableCodes = availableCodesSet;
      session.unavailableCodes = unavailableCodesSet;
      return updatedChat;
    }

    // Nueva sesión o sesión restablecida tras >60 minutos de inactividad
    const initialBuffer = this.formatHistoryBuffer(recentHistory, 6);
    const chat = client.chats.create({
      model: modelName,
      config: {
        systemInstruction: systemPrompt,
      },
      history: initialBuffer.length > 0 ? initialBuffer : undefined,
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
      phoneUsageType?: string;
    },
    catalogProducts: any[] = [],
    promotions: any[] = [],
    conversationSummary?: string | null,
    recentHistory: any[] = [],
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
          conversationSummary,
          recentHistory,
        );
        const response = await chat.sendMessage({ message: messagePayload });

        // Tarea 7: Limitar historial de memoria de sesión en vivo a máximo 6 mensajes (3 turnos)
        if (chat && Array.isArray(chat.history) && chat.history.length > 6) {
          chat.history = chat.history.slice(-6);
          while (chat.history.length > 0 && chat.history[0].role !== 'user') {
            chat.history.shift();
          }
        }

        const rawText = response.text || '';
        return this.formatForWhatsApp(rawText);
      } catch (err: any) {
        this.logger.warn(`Fallo con modelo ${model}: ${err?.message}. Probando fallback...`);
      }
    }

    throw new Error('No fue posible obtener respuesta de Gemini con ninguno de los modelos disponibles.');
  }
}

