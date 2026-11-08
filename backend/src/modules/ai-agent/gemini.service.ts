import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { LibraryService } from './library.service';

const PRIMARY_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];

@Injectable()
export class GeminiService {
  private readonly logger = new Logger('GeminiService');
  private readonly clientsCache = new Map<string, any>();
  private readonly sessions = new Map<string, { chat: any; lastActivity: number }>();
  private readonly globalApiKey: string | null;

  constructor(private readonly libraryService: LibraryService) {
    this.globalApiKey = process.env.GEMINI_API_KEY || process.env.KEY || null;
    if (this.globalApiKey) {
      try {
        this.clientsCache.set(this.globalApiKey, new GoogleGenAI({ apiKey: this.globalApiKey }));
        this.logger.log('GoogleGenAI global inicializado.');
      } catch (err: any) {
        this.logger.error(`Error inicializando GoogleGenAI global: ${err?.message}`);
      }
    }
  }

  getClient(customApiKey?: string | null): any {
    const effectiveKey = (customApiKey && customApiKey.trim()) ? customApiKey.trim() : this.globalApiKey;
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
    const effectiveKey = (customApiKey && customApiKey.trim()) ? customApiKey.trim() : this.globalApiKey;
    return Boolean(effectiveKey && effectiveKey.trim());
  }

  clearAllSessions() {
    this.sessions.clear();
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

  getSystemInstruction(businessName: string = 'nuestro negocio', libraryContext: string = ''): string {
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

    if (libraryContext && libraryContext.trim()) {
      instruction += `\n\n======================================================
📚 BASE DE CONOCIMIENTO AUTORIZADA DEL NEGOCIO (BIBLIOTECA):
======================================================
La siguiente información es tu ÚNICA fuente de verdad:

${libraryContext}

REGLAS ESTRICTAS DE RESPUESTA:
- Responde ÚNICAMENTE con los datos proporcionados en los documentos anteriores.
- Si el cliente pregunta por información que NO esté presente, indica amablemente que no cuentas con ese dato exacto y que un asesor se comunicará con él.
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
  ): any {
    const effectiveKey = (customApiKey && customApiKey.trim()) ? customApiKey.trim() : this.globalApiKey;
    const client = this.getClient(effectiveKey);
    if (!client) {
      throw new Error('Gemini no está configurado. No se encontró ninguna API Key válida.');
    }

    const keyPrefix = effectiveKey ? effectiveKey.slice(-8) : 'global';
    const cacheKey = `${keyPrefix}_${sessionId}`;
    const now = Date.now();

    if (this.sessions.has(cacheKey)) {
      const session = this.sessions.get(cacheKey)!;
      session.lastActivity = now;
      return session.chat;
    }

    const { contextText } = this.libraryService.getActiveLibraryContext(documents);
    const systemPrompt = this.getSystemInstruction(businessName, contextText);

    const chat = client.chats.create({
      model: modelName,
      config: {
        systemInstruction: systemPrompt,
      },
    });

    this.sessions.set(cacheKey, { chat, lastActivity: now });
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
        const chat = this.getOrCreateChat(sessionId, businessName, documents, model, customApiKey);
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

