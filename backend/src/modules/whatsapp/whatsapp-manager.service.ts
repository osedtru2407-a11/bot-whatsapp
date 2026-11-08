import {
  Injectable,
  OnModuleInit,
  OnApplicationShutdown,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';
import * as QRCode from 'qrcode';
// @ts-ignore
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import { Company } from '../../entities/company.entity';
import { CompanySetting } from '../../entities/company-setting.entity';
import { Lead } from '../../entities/lead.entity';
import { Message } from '../../entities/message.entity';
import { Rule } from '../../entities/rule.entity';
import { LibraryDocument } from '../../entities/library-document.entity';
import { RulesService } from '../rules/rules.service';
import { GeminiService } from '../ai-agent/gemini.service';

export interface WhatsAppClientState {
  client: any;
  status: 'initializing' | 'qr_ready' | 'authenticated' | 'ready' | 'disconnected' | 'auth_failure' | 'error';
  qrCode: string | null;
  clientInfo: any;
  qrCount: number;
  authTimeout: any;
}

@Injectable()
export class WhatsAppManagerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('WhatsAppManager');
  private readonly companyClients = new Map<string, WhatsAppClientState>();
  private readonly chatSSEClients = new Map<string, Set<any>>();
  private readonly companyEventsClients = new Map<string, Set<any>>();

  public readonly authDir: string;
  public readonly uploadsDir: string;

  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(CompanySetting)
    private readonly companySettingRepository: Repository<CompanySetting>,
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(Rule)
    private readonly ruleRepository: Repository<Rule>,
    @InjectRepository(LibraryDocument)
    private readonly libraryRepository: Repository<LibraryDocument>,
    @Inject(forwardRef(() => RulesService))
    private readonly rulesService: RulesService,
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
  ) {
    const potentialAuthDirs = [
      process.env.WWEBJS_AUTH_DIR,
      path.resolve(process.cwd(), '.wwebjs_auth'),
      path.resolve(process.cwd(), '..', '.wwebjs_auth'),
    ].filter(Boolean) as string[];

    let resolvedAuth = path.resolve(process.cwd(), '.wwebjs_auth');
    for (const p of potentialAuthDirs) {
      if (fs.existsSync(p)) {
        resolvedAuth = p;
        break;
      }
    }
    this.authDir = resolvedAuth;

    const potentialUploads = [
      process.env.UPLOADS_DIR,
      path.resolve(process.cwd(), 'public', 'uploads'),
      path.resolve(process.cwd(), '..', 'public', 'uploads'),
    ].filter(Boolean) as string[];

    let resolvedUploads = path.resolve(process.cwd(), 'public', 'uploads');
    for (const p of potentialUploads) {
      if (fs.existsSync(p)) {
        resolvedUploads = p;
        break;
      }
    }
    this.uploadsDir = resolvedUploads;
  }

  async onModuleInit() {
    this.logger.log(`Directorio de sesiones de WhatsApp: ${this.authDir}`);
    this.logger.log(`Directorio de subidas de archivos: ${this.uploadsDir}`);

    ['rules', 'received', 'quick', 'library'].forEach((dir) => {
      const fullPath = path.join(this.uploadsDir, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    });

    await this.initAllSavedClients();
  }

  async onApplicationShutdown() {
    this.logger.log('Cerrando todos los clientes de WhatsApp de forma segura...');
    for (const [companyId, state] of this.companyClients.entries()) {
      if (state.client) {
        try {
          await state.client.destroy();
          this.logger.log(`Cliente de empresa ${companyId} cerrado.`);
        } catch (err: any) {
          this.logger.warn(`Error al destruir cliente ${companyId}: ${err?.message}`);
        }
      }
    }
    this.companyClients.clear();
  }

  hasSavedSession(companyId: string): boolean {
    const authClientId = companyId === 'default' ? null : companyId;
    const sessionDir = path.join(this.authDir, authClientId ? `session-${authClientId}` : 'session');
    if (!fs.existsSync(sessionDir)) return false;
    const defaultDir = path.join(sessionDir, 'Default');
    return fs.existsSync(defaultDir);
  }

  async initAllSavedClients() {
    const companies = await this.companyRepository.find();
    for (const comp of companies) {
      if (this.hasSavedSession(comp.id)) {
        this.logger.log(`[Empresa: ${comp.name}] Sesión vinculada encontrada. Inicializando cliente WhatsApp...`);
        this.initCompanyClient(comp.id);
      } else {
        this.logger.log(`[Empresa: ${comp.name}] Sin sesión previa activa. En espera de solicitud de vinculación.`);
      }
    }
  }

  async initCompanyClient(companyId: string) {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['settings'],
    });

    if (!company) {
      this.logger.warn(`No se encontró la empresa con ID: ${companyId}`);
      return;
    }

    await this.stopCompanyClient(companyId, false);

    const state: WhatsAppClientState = {
      client: null,
      status: 'initializing',
      qrCode: null,
      clientInfo: null,
      qrCount: 0,
      authTimeout: null,
    };
    this.companyClients.set(companyId, state);

    this.logger.log(`[Empresa: ${company.name}] Creando instancia del cliente WhatsApp...`);

    const authClientId = companyId === 'default' ? null : companyId;
    const sessionDir = path.join(this.authDir, authClientId ? `session-${authClientId}` : 'session');
    const lockFiles = [
      path.join(sessionDir, 'lockfile'),
      path.join(sessionDir, 'Default', 'LOCK'),
      path.join(sessionDir, 'Default', 'SingletonLock'),
    ];

        for (const lockPath of lockFiles) {
          if (fs.existsSync(lockPath)) {
            try {
              fs.unlinkSync(lockPath);
              this.logger.log(`[Empresa: ${company.name}] 🧹 Lockfile huérfano liberado: ${path.basename(lockPath)}`);
            } catch (e: any) {
              this.logger.warn(`[Empresa: ${company.name}] ⚠️ Archivo de sesión ocupado (${path.basename(lockPath)}): ${e.message}`);
            }
          }
        }

        const clientInstance = new Client({
          authStrategy: new LocalAuth({
            clientId: authClientId,
            dataPath: this.authDir,
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

        clientInstance.on('qr', async (qr: string) => {
          state.qrCount++;
          if (state.qrCount > 5) {
            this.logger.warn(`[Empresa: ${company.name}] ⏱️ Código QR expiró tras 5 intentos. Deteniendo proceso.`);
            state.status = 'disconnected';
            state.qrCode = null;
            await this.stopCompanyClient(companyId);
            return;
          }

          this.logger.log(`[Empresa: ${company.name}] Código QR recibido (#${state.qrCount}/5)`);
          state.status = 'qr_ready';
          try {
            state.qrCode = await QRCode.toDataURL(qr, {
              width: 320,
              margin: 2,
              color: { dark: '#0b141a', light: '#ffffff' },
            });
          } catch (err: any) {
            this.logger.error(`[Empresa: ${company.name}] Error generando DataURL de QR: ${err.message}`);
          }
        });

        clientInstance.on('authenticated', () => {
          state.qrCount = 0;
          this.logger.log(`[Empresa: ${company.name}] Sesión autenticada correctamente.`);
          state.status = 'authenticated';
          state.qrCode = null;

          if (state.authTimeout) clearTimeout(state.authTimeout);
          state.authTimeout = setTimeout(async () => {
            if (state.status === 'authenticated') {
              this.logger.warn(`[Empresa: ${company.name}] ⚠️ Atascado en 'authenticated'. Restaurando credenciales...`);
              try {
                await this.unlinkCompanyWhatsApp(companyId);
              } catch (e: any) {
                this.logger.error(`Error en autorecuperación: ${e.message}`);
              }
            }
          }, 45000);
        });

        clientInstance.on('auth_failure', async (msg: string) => {
          this.logger.error(`[Empresa: ${company.name}] Fallo de autenticación: ${msg}`);
          state.status = 'auth_failure';
          if (state.authTimeout) clearTimeout(state.authTimeout);
          try {
            await this.unlinkCompanyWhatsApp(companyId);
          } catch (e: any) {
            this.logger.error(`Error tras auth_failure: ${e.message}`);
          }
        });

        clientInstance.on('ready', () => {
          if (state.authTimeout) clearTimeout(state.authTimeout);
          this.logger.log(`[Empresa: ${company.name}] WhatsApp CONECTADO y listo para operar.`);
          state.status = 'ready';
          state.qrCode = null;
          try {
            state.clientInfo = {
              pushname: clientInstance.info?.pushname || company.name,
              wid: clientInstance.info?.wid?.user || 'Conectado',
              platform: clientInstance.info?.platform || 'web',
            };
          } catch {
            state.clientInfo = { pushname: company.name, wid: 'Conectado' };
          }
        });

        clientInstance.on('disconnected', (reason: string) => {
          if (state.authTimeout) clearTimeout(state.authTimeout);
          this.logger.log(`[Empresa: ${company.name}] Desconectado: ${reason}`);
          state.status = 'disconnected';
          state.clientInfo = null;
          state.qrCode = null;
        });

        clientInstance.on('message', async (msg: any) => {
          try {
            await this.handleIncomingMessage(companyId, msg);
          } catch (err: any) {
            this.logger.error(`[Empresa: ${company.name}] Error procesando mensaje entrante: ${err.message}`);
          }
        });

        clientInstance.on('message_create', async (msg: any) => {
          try {
            if (msg.fromMe) {
              const toId = msg.to || '';
              const recipientPhone = toId.replace('@c.us', '').replace('@g.us', '');
              if (recipientPhone && recipientPhone !== 'status@broadcast' && !toId.includes('@g.us')) {
                const isAudio = msg.type === 'ptt' || msg.type === 'audio';
                const text = msg.body || (msg.hasMedia ? (isAudio ? '🎤 [Nota de voz]' : '📎 [Archivo adjunto]') : '');
                if (text) {
                  await this.saveMessage(companyId, recipientPhone, true, text, null, null, msg.type || 'chat', msg.id?._serialized);
                  this.broadcastChatMessage(companyId, recipientPhone, {
                    id: msg.id?._serialized || `out_${Date.now()}`,
                    fromMe: true,
                    body: text,
                    timestamp: msg.timestamp ? (msg.timestamp > 1e11 ? msg.timestamp : msg.timestamp * 1000) : Date.now(),
                    type: msg.type || 'chat',
                    hasMedia: Boolean(msg.hasMedia),
                  });

                  await this.updateLeadLastMessage(companyId, recipientPhone, `Tú: ${text}`);
                }
              }
            }
          } catch { }
        });

          clientInstance.initialize().catch(async (err: any) => {
            this.logger.error(`[Empresa: ${company.name}] Error en client.initialize(): ${err.message}`);
            state.status = 'error';
            try {
              await clientInstance.destroy();
            } catch { }

            if (err.message?.includes('Waiting failed') || err.message?.includes('timeout')) {
              this.logger.warn(
                `[Empresa: ${company.name}] ⏱️ Tiempo de espera agotado al conectar WhatsApp. Si la sesión previa expiró en el teléfono móvil o está corrupta, desvincula WhatsApp desde el panel (o elimina .wwebjs_auth/session) para escanear un nuevo código QR.`,
              );
            }
          });
        }

  async stopCompanyClient(companyId: string, removeFromMap: boolean = true) {
          if(this.companyClients.has(companyId)) {
          const holder = this.companyClients.get(companyId);
          if (holder?.client) {
            try {
              await holder.client.destroy();
            } catch (e: any) {
              this.logger.warn(`Aviso deteniendo cliente ${companyId}: ${e.message}`);
            }
          }
          if (removeFromMap) {
            this.companyClients.delete(companyId);
          }
        }
      }

  async unlinkCompanyWhatsApp(companyId: string) {
        await this.stopCompanyClient(companyId, true);
        await new Promise((r) => setTimeout(r, 600));

        const authClientId = companyId === 'default' ? null : companyId;
        const sessionDir = path.join(this.authDir, authClientId ? `session-${authClientId}` : 'session');
        if (fs.existsSync(sessionDir)) {
          for (let attempt = 1; attempt <= 4; attempt++) {
            try {
              fs.rmSync(sessionDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
              break;
            } catch (e: any) {
              if (attempt === 4) {
                this.logger.warn(`Aviso borrando sesión para ${companyId} (${e.code}): ${e.message}`);
              } else {
                await new Promise((r) => setTimeout(r, 400));
              }
            }
          }
        }
      }

      getClientState(companyId: string): WhatsAppClientState | undefined {
        return this.companyClients.get(companyId);
      }

      resolveChatId(rawPhone: string): { chatId: string; cleanDigits: string } {
        const raw = String(rawPhone || '').trim();
        const cleanDigits = raw.replace(/\D/g, '');
        let chatId = '';

        if (raw.endsWith('@lid') || raw.endsWith('@c.us') || raw.endsWith('@g.us')) {
          chatId = raw;
        } else if (cleanDigits) {
          chatId = `${cleanDigits}@c.us`;
        }

        return { chatId, cleanDigits };
      }

  async sendMessage(companyId: string, phone: string, message ?: string, media ?: any) {
        const holder = this.companyClients.get(companyId);
        if (!holder || holder.status !== 'ready' || !holder.client) {
          throw new ServiceUnavailableException('El bot de WhatsApp no está conectado todavía. Escanea el código QR.');
        }

        const { chatId, cleanDigits } = this.resolveChatId(phone);
        if (!chatId) {
          throw new BadRequestException('Número de WhatsApp inválido');
        }

        let result: any;
        if (media && media.url) {
          let mediaInstance: any = null;
          const relPath = media.url.startsWith('/') ? media.url.slice(1) : media.url;
          const fullPath = path.resolve(this.uploadsDir, '..', relPath);

          if (fs.existsSync(fullPath)) {
            mediaInstance = MessageMedia.fromFilePath(fullPath);
          } else if (media.url.startsWith('http')) {
            mediaInstance = await MessageMedia.fromUrl(media.url);
          }

          if (mediaInstance) {
            result = await holder.client.sendMessage(chatId, mediaInstance, { caption: message || undefined });
          } else {
            result = await holder.client.sendMessage(chatId, message || '');
          }
        } else {
          result = await holder.client.sendMessage(chatId, message || '');
        }

        const msgSerializedId = result?.id?._serialized || null;
        const bodyText = message || (media ? '📎 Archivo enviado' : '');

        await this.saveMessage(companyId, cleanDigits || phone, true, bodyText, media?.url, media?.mimetype, 'chat', msgSerializedId);

        this.broadcastChatMessage(companyId, cleanDigits || phone, {
          id: msgSerializedId || `send_${Date.now()}`,
          fromMe: true,
          body: bodyText,
          timestamp: Date.now(),
          type: 'chat',
          hasMedia: Boolean(media),
          mediaUrl: media?.url || null,
        });

        await this.updateLeadLastMessage(companyId, cleanDigits || phone, bodyText);

        return {
          success: true,
          message: `Mensaje entregado a ${cleanDigits || phone}`,
          id: msgSerializedId,
        };
      }

  private async handleIncomingMessage(companyId: string, msg: any) {
    const settings = await this.companySettingRepository.findOne({ where: { companyId } });
    if (!settings || !settings.botEnabled) return;
    if (msg.fromMe) return;

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

    if (settings.ignoreGroups && fromId.includes('@g.us')) return;

    const senderPhone = fromId.replace('@c.us', '').replace('@g.us', '');
    if (!senderPhone || senderPhone === 'status@broadcast') return;

    const cleanText = (msg.body || '').trim();
    const isAudioType = msg.type === 'ptt' || msg.type === 'audio';
    const hasMedia = Boolean(msg.hasMedia || isAudioType);

    let receivedMedia: any = null;

    if (hasMedia) {
      try {
        let downloaded: any = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            downloaded = await msg.downloadMedia();
            if (downloaded && downloaded.data) break;
          } catch { }
          await new Promise((r) => setTimeout(r, 600));
        }

        if (downloaded && downloaded.data) {
          const uniqueFilename = `${Date.now()}_recibido.${isAudioType ? 'oga' : 'bin'}`;
          const savePath = path.join(this.uploadsDir, 'received', uniqueFilename);
          fs.writeFileSync(savePath, Buffer.from(downloaded.data, 'base64'));

          receivedMedia = {
            id: 'med-' + Date.now(),
            filename: downloaded.filename || uniqueFilename,
            mimetype: downloaded.mimetype,
            size: downloaded.data ? Math.round(downloaded.data.length * 0.75) : 0,
            url: `/uploads/received/${uniqueFilename}`,
            receivedAt: new Date().toISOString(),
            caption: cleanText,
          };
        }
      } catch (err: any) {
        this.logger.warn(`Error descargando medio de ${senderPhone}: ${err.message}`);
      }
    }

    const displayMsg = isAudioType
      ? (cleanText ? `🎤 [Nota de voz] ${cleanText}` : `🎤 [Nota de voz / Audio]`)
      : (receivedMedia
        ? (cleanText ? `📎 [${receivedMedia.filename}] ${cleanText}` : `📎 [${receivedMedia.filename}]`)
        : cleanText);

    await this.saveMessage(companyId, senderPhone, false, cleanText || displayMsg, receivedMedia?.url, receivedMedia?.mimetype, msg.type, msg.id?._serialized);

    this.broadcastChatMessage(companyId, senderPhone, {
      id: msg.id?._serialized || `in_${Date.now()}`,
      fromMe: false,
      body: cleanText || displayMsg,
      timestamp: Date.now(),
      type: msg.type || 'chat',
      hasMedia: Boolean(receivedMedia),
      mediaUrl: receivedMedia?.url || null,
      mediaMimetype: receivedMedia?.mimetype || null,
    });

    let lead = await this.leadRepository.findOne({ where: { companyId, phone: senderPhone } });
    if (!lead) {
      lead = this.leadRepository.create({
        id: 'lead_' + Date.now(),
        companyId,
        phone: senderPhone,
        name: msg._data?.notifyName || senderPhone,
        tag: isAudioType ? 'Audio / Nota de voz' : (receivedMedia ? 'Comprobante/Archivo' : 'Nuevo'),
        lastMessage: displayMsg,
        humanPaused: false,
        receivedFiles: receivedMedia ? [receivedMedia] : [],
        lastInteraction: new Date(),
      });
    } else {
      lead.lastMessage = displayMsg;
      lead.lastInteraction = new Date();
      if (receivedMedia) {
        lead.receivedFiles = [receivedMedia, ...(lead.receivedFiles || [])];
      }
    }
    await this.leadRepository.save(lead);

    this.broadcastCompanyEvent(companyId, 'lead_updated', {
      phone: lead.phone,
      name: lead.name,
      lastMessage: lead.lastMessage,
      tag: lead.tag,
    });

    // Atención humana activa: no responder automáticamente
    if (lead.humanPaused) {
      this.logger.log(`[Empresa ${companyId}] Mensaje de ${senderPhone}, atención humana activa.`);
      return;
    }

    // 1. Evaluación de Reglas manuales
    const context = { lastSentRuleId: lead.lastSentRuleId || null };
    const rules = await this.ruleRepository.find({ where: { companyId } });
    const matchedRule = this.rulesService.matchRule(
      cleanText.toLowerCase(),
      rules,
      Boolean(receivedMedia),
      receivedMedia ? receivedMedia.mimetype : (isAudioType ? 'audio/ogg' : ''),
      context,
    );

    if (matchedRule) {
      this.logger.log(`[Empresa ${companyId}] 🎯 Coincidencia con regla "${matchedRule.name}" para ${senderPhone}`);

      const typingDelay = (settings.simulateTyping && settings.typingDelaySeconds ? settings.typingDelaySeconds : 0) * 1000;
      if (typingDelay > 0) {
        await new Promise((r) => setTimeout(r, Math.min(typingDelay, 4000)));
      }

      await this.sendMessage(companyId, senderPhone, matchedRule.response, matchedRule.media);

      if (matchedRule.leadTag) {
        lead.tag = matchedRule.leadTag;
      }
      if (matchedRule.pauseBot) {
        lead.humanPaused = true;
      }
      lead.lastSentRuleId = matchedRule.id;
      await this.leadRepository.save(lead);
      return;
    }

    // 2. Fallback inteligente con Gemini IA (si está habilitado y configurado)
    if (settings.geminiEnabled && this.geminiService.isConfigured(settings.geminiApiKey)) {
      try {
        const docs = await this.libraryRepository.find({ where: { companyId, active: true } });
        const reply = await this.geminiService.sendMessage(
          senderPhone,
          displayMsg,
          settings.businessName || 'nuestro negocio',
          docs,
          settings.geminiApiKey,
          settings.geminiModel,
        );

        if (reply) {
          this.logger.log(`🤖 [Empresa ${companyId}] Respuesta generada por Gemini IA para ${senderPhone}`);
          const typingDelay = (settings.simulateTyping && settings.typingDelaySeconds ? settings.typingDelaySeconds : 0) * 1000;
          if (typingDelay > 0) {
            await new Promise((r) => setTimeout(r, Math.min(typingDelay, 4000)));
          }
          await this.sendMessage(companyId, senderPhone, reply);
          return;
        }
      } catch (err: any) {
        this.logger.warn(`Aviso consultando Gemini IA: ${err?.message}`);
      }
    }

    // 3. Fallback estático
    if (settings.fallbackMessage) {
      await this.sendMessage(companyId, senderPhone, settings.fallbackMessage);
    }
  }

  private async saveMessage(
    companyId: string,
    phone: string,
    fromMe: boolean,
    body: string,
    mediaUrl: string | null = null,
    mediaMimetype: string | null = null,
    messageType: string = 'chat',
    serializedId: string | null = null,
  ) {
    const msg = this.messageRepository.create({
      id: serializedId || `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      companyId,
      phone,
      fromMe,
      body,
      mediaUrl: mediaUrl || null,
      mediaMimetype: mediaMimetype || null,
      messageType,
      timestamp: new Date(),
    });
    await this.messageRepository.save(msg);
  }

  private async updateLeadLastMessage(companyId: string, phone: string, text: string) {
    const lead = await this.leadRepository.findOne({ where: { companyId, phone } });
    if (lead) {
      lead.lastMessage = text;
      lead.lastInteraction = new Date();
      await this.leadRepository.save(lead);
    }
  }

  registerChatStream(companyId: string, phone: string, res: any) {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    const key = `${companyId}_${cleanPhone}`;

    if (!this.chatSSEClients.has(key)) {
      this.chatSSEClients.set(key, new Set());
    }
    const clientSet = this.chatSSEClients.get(key)!;
    clientSet.add(res);

    res.write(`data: ${JSON.stringify({ type: 'connected', phone: cleanPhone })}\n\n`);

    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 20000);

    return () => {
      clearInterval(heartbeat);
      clientSet.delete(res);
      if (clientSet.size === 0) {
        this.chatSSEClients.delete(key);
      }
    };
  }

  broadcastChatMessage(companyId: string, phone: string, messageData: any) {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (!cleanPhone) return;

    const key = `${companyId}_${cleanPhone}`;
    const clients = this.chatSSEClients.get(key);
    if (clients && clients.size > 0) {
      const payload = `data: ${JSON.stringify(messageData)}\n\n`;
      for (const clientRes of clients) {
        try {
          clientRes.write(payload);
        } catch {
          clients.delete(clientRes);
        }
      }
    }
  }

  registerCompanyStream(companyId: string, res: any, leadsCount: number) {
    if (!this.companyEventsClients.has(companyId)) {
      this.companyEventsClients.set(companyId, new Set());
    }
    const clientSet = this.companyEventsClients.get(companyId)!;
    clientSet.add(res);

    res.write(`data: ${JSON.stringify({ event: 'connected', companyId, leadsCount })}\n\n`);

    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 20000);

    return () => {
      clearInterval(heartbeat);
      clientSet.delete(res);
      if (clientSet.size === 0) {
        this.companyEventsClients.delete(companyId);
      }
    };
  }

  broadcastCompanyEvent(companyId: string, eventName: string, payload: any) {
    const clients = this.companyEventsClients.get(companyId);
    if (clients && clients.size > 0) {
      const data = `data: ${JSON.stringify({ event: eventName, payload, timestamp: Date.now() })}\n\n`;
      for (const clientRes of clients) {
        try {
          clientRes.write(data);
        } catch {
          clients.delete(clientRes);
        }
      }
    }
  }
}
