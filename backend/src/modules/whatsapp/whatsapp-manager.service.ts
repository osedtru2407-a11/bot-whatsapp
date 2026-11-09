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
import { Product } from '../../entities/product.entity';
import { Promotion } from '../../entities/promotion.entity';
import { RulesService } from '../rules/rules.service';
import { GeminiService } from '../ai-agent/gemini.service';
import { PlansService } from '../plans/plans.service';

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

  // Tarea 11: Manejo de ráfagas (Debounce de 8.5 segundos) por remitente
  private readonly debounceQueues = new Map<
    string,
    {
      companyId: string;
      phone: string;
      timeoutId: NodeJS.Timeout;
      items: Array<{
        text: string;
        displayMsg: string;
        isAudioType: boolean;
        receivedMedia?: any;
        audioDataPayload?: { data: string; mimetype: string } | null;
      }>;
      minutesSinceLastInteraction: number;
    }
  >();

  // Mapeo en memoria de teléfono/LID a su chatId real en WhatsApp Web
  private readonly chatTargetMap = new Map<string, string>();

  // Control de throttling/cooldown de alertas de cuota de plan (evita spam al chat propio)
  private readonly lastQuotaAlertTime = new Map<string, number>();

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
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Promotion)
    private readonly promotionRepository: Repository<Promotion>,
    @Inject(forwardRef(() => RulesService))
    private readonly rulesService: RulesService,
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
    @Inject(forwardRef(() => PlansService))
    private readonly plansService: PlansService,
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

    const candidateRoots = [
      process.cwd(),
      path.resolve(process.cwd(), '..'),
      path.resolve(__dirname, '..', '..', '..'),
      path.resolve(__dirname, '..', '..'),
    ];
    const rootDir =
      candidateRoots.find(
        (dir) =>
          fs.existsSync(path.join(dir, 'server.js')) ||
          fs.existsSync(path.join(dir, 'pendientes.txt')) ||
          fs.existsSync(path.join(dir, 'public')),
      ) || process.cwd();

    const potentialUploads = [
      process.env.UPLOADS_DIR,
      path.resolve(rootDir, 'public', 'uploads'),
      path.resolve(process.cwd(), '..', 'public', 'uploads'),
      path.resolve(process.cwd(), 'public', 'uploads'),
    ].filter(Boolean) as string[];

    let resolvedUploads = path.resolve(rootDir, 'public', 'uploads');
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
    this.logger.log('Limpiando colas de debounce y cerrando clientes de WhatsApp...');
    for (const queue of this.debounceQueues.values()) {
      clearTimeout(queue.timeoutId);
    }
    this.debounceQueues.clear();

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
    if (this.companyClients.has(companyId)) {
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

  /**
   * Resuelve el número de teléfono real (E.164) y el chatId de WhatsApp para un remitente.
   * Maneja tanto números estándar (@c.us) como identidades vinculadas (@lid).
   */
  async resolveContactIdentifier(
    client: any,
    rawFrom: string,
    msg?: any,
  ): Promise<{ realPhone: string | null; chatId: string; isLid: boolean }> {
    const raw = String(rawFrom || '').trim();
    const isLid = raw.endsWith('@lid') || (raw.length >= 15 && !raw.includes('@'));
    const cleanRawDigits = raw.replace(/\D/g, '');

    // Si no es un LID y tiene formato telefónico estándar (7 a 14 dígitos)
    if (!isLid && cleanRawDigits.length >= 7 && cleanRawDigits.length <= 14) {
      return { realPhone: cleanRawDigits, chatId: `${cleanRawDigits}@c.us`, isLid: false };
    }

    const chatId = raw.endsWith('@lid') ? raw : `${raw}@lid`;
    let resolvedPhone: string | null = null;

    if (client) {
      // 1. Intentar client.getContactLidAndPhone oficial de whatsapp-web.js
      try {
        if (typeof client.getContactLidAndPhone === 'function') {
          const res = await client.getContactLidAndPhone([chatId]);
          if (Array.isArray(res) && res.length > 0 && res[0]?.pn) {
            const candidate = String(res[0].pn).replace('@c.us', '').replace(/\D/g, '');
            if (candidate && candidate.length >= 7 && candidate.length <= 14 && candidate !== cleanRawDigits) {
              resolvedPhone = candidate;
            }
          }
        }
      } catch (err: any) {
        this.logger.debug?.(`Error en getContactLidAndPhone para ${chatId}: ${err?.message}`);
      }

      // 2. Intentar msg.getContact()
      if (!resolvedPhone && msg && typeof msg.getContact === 'function') {
        try {
          const contact = await msg.getContact();
          if (contact) {
            const num = contact.number ? String(contact.number).replace(/\D/g, '') : '';
            if (num && num.length >= 7 && num.length <= 14 && num !== cleanRawDigits) {
              resolvedPhone = num;
            } else if (contact.id?._serialized && contact.id._serialized.endsWith('@c.us')) {
              const fromIdUser = contact.id.user || contact.id._serialized.replace('@c.us', '').replace(/\D/g, '');
              if (fromIdUser && fromIdUser.length >= 7 && fromIdUser.length <= 14 && fromIdUser !== cleanRawDigits) {
                resolvedPhone = fromIdUser;
              }
            }
          }
        } catch (err: any) {
          this.logger.debug?.(`Error en msg.getContact para ${chatId}: ${err?.message}`);
        }
      }

      // 3. Fallback directo en Puppeteer con WAWebApiContact / enforceLidAndPnRetrieval
      if (!resolvedPhone && client.pupPage && typeof client.pupPage.evaluate === 'function') {
        try {
          const evalResult = await client.pupPage.evaluate(async (targetLid: string) => {
            try {
              if ((window as any).WWebJS?.enforceLidAndPnRetrieval) {
                const res = await (window as any).WWebJS.enforceLidAndPnRetrieval(targetLid);
                if (res?.phone) {
                  const pn = res.phone._serialized || res.phone.user || res.phone;
                  return typeof pn === 'string' ? pn : null;
                }
              }
              const widFactory = (window as any).require?.('WAWebWidFactory');
              const wid = widFactory ? widFactory.createWid(targetLid) : null;
              if (wid) {
                const apiContact = (window as any).require?.('WAWebApiContact');
                if (apiContact) {
                  const pn = apiContact.getPhoneNumber?.(wid) || apiContact.getAlternateUserWid?.(wid);
                  if (pn) return pn.user || pn._serialized || null;
                }
                const c = (window as any).require?.('WAWebCollections')?.Contact?.get?.(wid);
                if (c?.phoneNumber) {
                  return typeof c.phoneNumber === 'string' ? c.phoneNumber : (c.phoneNumber.user || c.phoneNumber._serialized);
                }
              }
              return null;
            } catch {
              return null;
            }
          }, chatId);

          if (evalResult) {
            const candidate = String(evalResult).replace('@c.us', '').replace(/\D/g, '');
            if (candidate && candidate.length >= 7 && candidate.length <= 14 && candidate !== cleanRawDigits) {
              resolvedPhone = candidate;
            }
          }
        } catch (err: any) {
          this.logger.debug?.(`Error en evaluate Puppeteer para ${chatId}: ${err?.message}`);
        }
      }
    }

    return { realPhone: resolvedPhone, chatId, isLid: true };
  }

  resolveChatId(rawPhone: string): { chatId: string; cleanDigits: string } {
    const raw = String(rawPhone || '').trim();
    const cleanDigits = raw.replace(/\D/g, '');
    let chatId = '';

    if (this.chatTargetMap.has(raw)) {
      chatId = this.chatTargetMap.get(raw)!;
    } else if (cleanDigits && this.chatTargetMap.has(cleanDigits)) {
      chatId = this.chatTargetMap.get(cleanDigits)!;
    } else if (raw.endsWith('@lid') || raw.endsWith('@c.us') || raw.endsWith('@g.us')) {
      chatId = raw;
    } else if (cleanDigits) {
      chatId = `${cleanDigits}@c.us`;
    }

    return { chatId, cleanDigits };
  }

  async sendMessage(companyId: string, phone: string, message?: string, media?: any) {
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

  /**
   * Tarea 8: Despacho inteligente y secuencial de fotografías de producto por WhatsApp
   */
  async sendProductPhotos(companyId: string, phone: string, productCode: string): Promise<number> {
    const holder = this.companyClients.get(companyId);
    if (!holder || holder.status !== 'ready' || !holder.client) {
      this.logger.warn(`Cliente WhatsApp no está listo para enviar fotos a ${phone}`);
      return 0;
    }

    const { chatId, cleanDigits } = this.resolveChatId(phone);
    if (!chatId) return 0;

    // Buscar producto por código insensible a mayúsculas
    const allProducts = await this.productRepository.find({ where: { companyId } });
    const product = allProducts.find(
      (p) => p.code.trim().toUpperCase() === productCode.trim().toUpperCase(),
    );

    if (!product || !Array.isArray(product.images) || product.images.length === 0) {
      this.logger.log(`No hay fotografías registradas en base de datos para el código "${productCode}"`);
      return 0;
    }

    this.logger.log(
      `📸 Despachando ${product.images.length} foto(s) secuenciales de "${product.name}" (${product.code}) a ${cleanDigits || phone}`,
    );

    let sentCount = 0;
    for (let i = 0; i < product.images.length; i++) {
      const imgUrl = product.images[i];
      try {
        let mediaInstance: any = null;
        const relPath = imgUrl.startsWith('/') ? imgUrl.slice(1) : imgUrl;
        const fullPath = path.resolve(this.uploadsDir, '..', relPath);

        if (fs.existsSync(fullPath)) {
          mediaInstance = MessageMedia.fromFilePath(fullPath);
        } else if (imgUrl.startsWith('http')) {
          mediaInstance = await MessageMedia.fromUrl(imgUrl);
        }

        if (mediaInstance) {
          // Pausa breve entre fotos para garantizar orden secuencial en WhatsApp
          if (i > 0) {
            await new Promise((resolve) => setTimeout(resolve, 600));
          }

          const caption = i === 0 ? `📷 ${product.name} (${product.code})` : undefined;
          const result = await holder.client.sendMessage(chatId, mediaInstance, { caption });

          const msgSerializedId = result?.id?._serialized || null;
          const textCaption = caption || `📷 Foto de ${product.name}`;

          await this.saveMessage(
            companyId,
            cleanDigits || phone,
            true,
            textCaption,
            imgUrl,
            'image/jpeg',
            'image',
            msgSerializedId,
          );

          this.broadcastChatMessage(companyId, cleanDigits || phone, {
            id: msgSerializedId || `photo_${Date.now()}_${i}`,
            fromMe: true,
            body: textCaption,
            timestamp: Date.now(),
            type: 'image',
            hasMedia: true,
            mediaUrl: imgUrl,
          });

          sentCount++;
        } else {
          this.logger.warn(`No se pudo resolver archivo de imagen para: ${imgUrl}`);
        }
      } catch (err: any) {
        this.logger.error(`Error enviando foto ${i + 1} de ${product.code}: ${err?.message}`);
      }
    }

    if (sentCount > 0) {
      await this.updateLeadLastMessage(
        companyId,
        cleanDigits || phone,
        `📷 [${sentCount} fotos enviadas: ${product.name}]`,
      );
    }

    return sentCount;
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

    if (fromId.endsWith('@g.us') || fromId.includes('@g.us')) return;

    const holder = this.companyClients.get(companyId);
    const { realPhone, chatId } = await this.resolveContactIdentifier(holder?.client, fromId, msg);

    if (realPhone) {
      this.chatTargetMap.set(realPhone, chatId);
    }
    this.chatTargetMap.set(chatId, chatId);

    const senderPhone = realPhone || fromId.replace('@c.us', '').replace('@g.us', '');
    if (!senderPhone || senderPhone === 'status@broadcast') return;

    const cleanText = (msg.body || '').trim();
    const isAudioType = msg.type === 'ptt' || msg.type === 'audio';
    const hasMedia = Boolean(msg.hasMedia || isAudioType);

    let receivedMedia: any = null;
    let audioPayload: { data: string; mimetype: string } | null = null;

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
          if (isAudioType) {
            audioPayload = { data: downloaded.data, mimetype: downloaded.mimetype || 'audio/ogg' };
          }
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
    if (!lead && realPhone && fromId !== senderPhone) {
      // Buscar si existía guardado previamente con el identificador LID
      lead =
        (await this.leadRepository.findOne({ where: { companyId, phone: fromId } })) ||
        (await this.leadRepository.findOne({ where: { companyId, phone: fromId.replace('@lid', '') } }));
      if (lead) {
        lead.phone = senderPhone;
      }
    }
    const previousInteraction = lead?.lastInteraction ? new Date(lead.lastInteraction).getTime() : 0;
    const minutesSinceLastInteraction = previousInteraction > 0 ? (Date.now() - previousInteraction) / (1000 * 60) : 0;

    if (!lead) {
      lead = this.leadRepository.create({
        id: 'lead_' + Date.now(),
        companyId,
        phone: senderPhone,
        name: msg._data?.notifyName || (realPhone ? `+${realPhone}` : senderPhone),
        tag: isAudioType ? 'Audio / Nota de voz' : (receivedMedia ? 'Comprobante/Archivo' : 'Nuevo'),
        lastMessage: displayMsg,
        humanPaused: false,
        isPersonal: false,
        receivedFiles: receivedMedia ? [receivedMedia] : [],
        lastInteraction: new Date(),
      });
    } else {
      if (msg._data?.notifyName && (lead.name === lead.phone || lead.name.includes('@lid') || lead.name.length >= 15)) {
        lead.name = msg._data.notifyName;
      }
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
      isPersonal: Boolean(lead.isPersonal),
      personalReason: lead.personalReason || null,
      humanPaused: Boolean(lead.humanPaused),
    });

    // Tarea 11: Si el chat está silenciado como personal y el filtro personal está habilitado (uso mixto), no intervenir
    if (lead.isPersonal && settings.phoneUsageType === 'personal_and_business') {
      this.logger.log(`🛡️ [Empresa ${companyId}] Mensaje de ${senderPhone} silenciado (chat clasificado como personal).`);
      return;
    }

    // Atención humana activa: no responder automáticamente
    if (lead.humanPaused) {
      if (lead.humanPausedUntil && new Date() > new Date(lead.humanPausedUntil)) {
        this.logger.log(`[Empresa ${companyId}] ⏱️ Pausa de 120min expiró para ${senderPhone}. Reactivando bot.`);
        lead.humanPaused = false;
        lead.humanPausedUntil = null;
        await this.leadRepository.save(lead);
      } else {
        this.logger.log(`[Empresa ${companyId}] Mensaje de ${senderPhone}, atención humana activa.`);
        return;
      }
    }

    // Tarea 11: Encolar mensaje en buffer de ráfaga (Debounce de 8.5 segundos)
    this.enqueueDebouncedMessage(companyId, senderPhone, {
      text: cleanText,
      displayMsg,
      isAudioType,
      receivedMedia,
      audioDataPayload: audioPayload,
      minutesSinceLastInteraction,
    });
  }

  /**
   * Tarea 11: Encolar mensaje para captura de ráfagas con ventana de 8.5 segundos
   */
  private enqueueDebouncedMessage(companyId: string, phone: string, item: any) {
    const queueKey = `${companyId}_${phone}`;
    if (this.debounceQueues.has(queueKey)) {
      const queue = this.debounceQueues.get(queueKey)!;
      clearTimeout(queue.timeoutId);
      queue.items.push(item);
      queue.timeoutId = setTimeout(() => this.processDebouncedMessages(queueKey), 8500);
      this.logger.log(`⏳ [Empresa ${companyId}] Ráfaga detectada de ${phone} (${queue.items.length} mensajes acumulados). Reiniciando ventana de 8.5s...`);
    } else {
      const timeoutId = setTimeout(() => this.processDebouncedMessages(queueKey), 8500);
      this.debounceQueues.set(queueKey, {
        companyId,
        phone,
        timeoutId,
        items: [item],
        minutesSinceLastInteraction: item.minutesSinceLastInteraction || 0,
      });
      this.logger.log(`⏳ [Empresa ${companyId}] Mensaje de ${phone} recibido. Esperando ventana de 8.5s para capturar posibles ráfagas...`);
    }
  }

  /**
   * Tarea 11: Procesar lote consolidado tras expirar la ventana de ráfaga (Debounce)
   */
  private async processDebouncedMessages(queueKey: string) {
    const queue = this.debounceQueues.get(queueKey);
    if (!queue) return;
    this.debounceQueues.delete(queueKey);

    const { companyId, phone, items, minutesSinceLastInteraction } = queue;
    if (!items || items.length === 0) return;

    const settings = await this.companySettingRepository.findOne({ where: { companyId } });
    if (!settings || !settings.botEnabled) return;

    let lead = await this.leadRepository.findOne({ where: { companyId, phone } });
    if (!lead || (lead.humanPaused && (!lead.humanPausedUntil || new Date() <= new Date(lead.humanPausedUntil))) || (lead.isPersonal && settings.phoneUsageType === 'personal_and_business')) return;

    // Concatenar todos los mensajes de la ráfaga como un solo bloque de texto
    const combinedText = items
      .map((i) => i.text || i.displayMsg)
      .filter((t) => Boolean(t && t.trim()))
      .join('\n')
      .trim();

    const lastAudio = items.filter((i) => i.isAudioType && i.audioDataPayload).pop()?.audioDataPayload;
    const lastMedia = items.filter((i) => i.receivedMedia).pop()?.receivedMedia;
    const isAudioType = Boolean(lastAudio);

    // 1. Evaluación de Reglas manuales con el texto unificado
    const context = { lastSentRuleId: lead.lastSentRuleId || null };
    const rules = await this.ruleRepository.find({ where: { companyId } });
    const matchedRule = this.rulesService.matchRule(
      combinedText.toLowerCase(),
      rules,
      Boolean(lastMedia),
      lastMedia ? lastMedia.mimetype : (isAudioType ? 'audio/ogg' : ''),
      context,
    );

    if (matchedRule) {
      // Tarea 9: Verificar límite de mensajes automáticos del plan SaaS
      const autoQuota = await this.plansService.checkAutoMessagesQuota(companyId);
      if (!autoQuota.allowed) {
        this.logger.warn(`⚠️ [Empresa ${companyId}] Límite de mensajes automáticos alcanzado (${autoQuota.current}/${autoQuota.limit}). Omitiendo respuesta de regla.`);
        await this.notifyQuotaExceeded(companyId, 'auto_messages', autoQuota.current, autoQuota.limit, autoQuota.planName);
        return;
      } else {
        this.lastQuotaAlertTime.delete(`${companyId}_auto_messages`);
      }

      this.logger.log(`[Empresa ${companyId}] 🎯 Coincidencia con regla "${matchedRule.name}" para ${phone} tras ráfaga`);

      const typingDelay = (settings.simulateTyping && settings.typingDelaySeconds ? settings.typingDelaySeconds : 0) * 1000;
      if (typingDelay > 0) {
        await new Promise((r) => setTimeout(r, Math.min(typingDelay, 4000)));
      }

      await this.sendMessage(companyId, phone, matchedRule.response, matchedRule.media);
      const autoIncRes = await this.plansService.incrementAutoMessages(companyId);
      if (autoIncRes.isExhausted) {
        await this.notifyQuotaExceeded(companyId, 'auto_messages', autoIncRes.current, autoIncRes.limit, autoIncRes.planName);
      }

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

    // 2. Fallback inteligente con Gemini IA
    if (settings.geminiEnabled && this.geminiService.isConfigured(settings.geminiApiKey)) {
      // Tarea 9: Verificar límite de llamados a Gemini según el plan SaaS
      const geminiQuota = await this.plansService.checkGeminiQuota(companyId);
      if (!geminiQuota.allowed) {
        this.logger.warn(`⚠️ [Empresa ${companyId}] Límite de llamados a Gemini agotado (${geminiQuota.current}/${geminiQuota.limit}).`);
        await this.notifyQuotaExceeded(companyId, 'gemini', geminiQuota.current, geminiQuota.limit, geminiQuota.planName);
          if (geminiQuota.warningMessage && geminiQuota.warningMessage.trim()) {
            await this.sendMessage(companyId, phone, geminiQuota.warningMessage.trim());
          }
          return;
        } else {
          this.lastQuotaAlertTime.delete(`${companyId}_gemini`);
        }
        try {
          const docs = await this.libraryRepository.find({ where: { companyId, active: true } });
          const catalogProducts = await this.productRepository.find({ where: { companyId } });
          const now = new Date();
          const y = now.getFullYear();
          const m = String(now.getMonth() + 1).padStart(2, '0');
          const d = String(now.getDate()).padStart(2, '0');
          const localDate = `${y}-${m}-${d}`;
          const utcDate = now.toISOString().split('T')[0];
          let bogotaDate = localDate;
          try {
            bogotaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(now);
          } catch (e) { }

          const candidateDates = Array.from(new Set([localDate, utcDate, bogotaDate]));
          const dateConditions = candidateDates.map((_, idx) => `(p.start_date <= :d${idx} AND p.end_date >= :d${idx})`).join(' OR ');
          const dateParams: Record<string, any> = { companyId, isActive: true };
          candidateDates.forEach((dateVal, idx) => { dateParams[`d${idx}`] = dateVal; });

          const activePromotions = await this.promotionRepository
            .createQueryBuilder('p')
            .where('p.company_id = :companyId', { companyId })
            .andWhere('p.is_active = :isActive', { isActive: true })
            .andWhere(`(${dateConditions})`, dateParams)
            .orderBy('p.start_date', 'ASC')
            .take(2)
            .getMany();

          const allDbMessages = await this.messageRepository.find({
            where: { companyId, phone },
            order: { timestamp: 'ASC' },
          });

          // Excluir los mensajes de esta ráfaga actual para armar el buffer previo de antecedentes
          const priorMessages = allDbMessages.slice(0, -items.length);
          const totalPriorMessages = priorMessages.length;
          let conversationSummary = lead.conversationSummary || null;

          const shouldUpdateSummary =
            (totalPriorMessages > 6 && !conversationSummary) ||
            (minutesSinceLastInteraction > 60 && totalPriorMessages >= 2) ||
            (totalPriorMessages > 6 && (!lead.lastSummaryAt || (Date.now() - new Date(lead.lastSummaryAt).getTime()) > 60 * 60 * 1000));

          if (shouldUpdateSummary && totalPriorMessages > 0) {
            try {
              const messagesToSummarize = minutesSinceLastInteraction > 60
                ? priorMessages
                : priorMessages.slice(0, -6);

              if (messagesToSummarize.length > 0) {
                const newSummary = await this.geminiService.generateConversationSummary(
                  conversationSummary,
                  messagesToSummarize,
                  settings.geminiApiKey,
                );
                if (newSummary && newSummary.trim()) {
                  conversationSummary = newSummary.trim();
                  lead.conversationSummary = conversationSummary;
                  lead.lastSummaryAt = new Date();
                  await this.leadRepository.save(lead);
                  this.logger.log(`📝 [Empresa ${companyId}] Resumen consolidado generado/actualizado para ${phone} (${newSummary.split('\n').length} líneas).`);
                }
              }
            } catch (sumErr: any) {
              this.logger.warn(`Aviso actualizando resumen para ${phone}: ${sumErr?.message}`);
            }
          }

          const recentBuffer = priorMessages.slice(-6);
          const geminiInput = lastAudio ? { text: combinedText, audio: lastAudio } : combinedText;

          const reply = await this.geminiService.sendMessage(
            phone,
            geminiInput,
            settings.businessName || 'nuestro negocio',
            docs,
            settings.geminiApiKey,
            settings.geminiModel,
            {
              botTone: settings.botTone,
              businessInfo: settings.businessInfo,
              faqText: settings.faqText,
              neverDo: settings.neverDo,
              phoneUsageType: settings.phoneUsageType || 'business_only',
            },
            catalogProducts,
            activePromotions,
            conversationSummary,
            recentBuffer,
          );

          // Incrementar contador de llamadas de IA consumidas
          const geminiIncRes = await this.plansService.incrementGeminiCalls(companyId);
          if (geminiIncRes.isExhausted) {
            await this.notifyQuotaExceeded(companyId, 'gemini', geminiIncRes.current, geminiIncRes.limit, geminiIncRes.planName);
          }

          if (reply) {
            // Tarea 11: Interceptar directiva [MARCAR_PERSONAL: MOTIVO] únicamente si está configurado en uso mixto
            if (settings.phoneUsageType === 'personal_and_business') {
              const personalRegex = /\[MARCAR_PERSONAL(?::\s*([^\]]+))?\]/i;
              const personalMatch = reply.match(personalRegex);
              if (personalMatch) {
                const reason = (personalMatch[1] || 'Conversación personal detectada').trim();
                this.logger.log(`🛡️ [Empresa ${companyId}] Chat con ${phone} clasificado como PERSONAL (${reason}). Silenciando bot permanentemente.`);
                lead.isPersonal = true;
                lead.personalReason = reason;
                lead.tag = 'Personal / Silenciado';
                await this.leadRepository.save(lead);
                this.broadcastCompanyEvent(companyId, 'lead_updated', {
                  phone: lead.phone,
                  name: lead.name,
                  lastMessage: lead.lastMessage,
                  tag: lead.tag,
                  isPersonal: true,
                  personalReason: reason,
                  humanPaused: false,
                });
                // REGLA: No envíes ningún mensaje de respuesta a WhatsApp
                return;
              }
            }

            this.logger.log(`🤖 [Empresa ${companyId}] Respuesta generada por Gemini IA para ${phone} tras ráfaga (${items.length} msgs)`);

            // Tarea 10: Interceptar directiva [ALERTA_VENTA: RESUMEN_DEL_PEDIDO]
            const saleDirectiveRegex = /\[ALERTA_VENTA(?::\s*([^\]]+))?\]/gi;
            const saleMatches = [...reply.matchAll(saleDirectiveRegex)];
            const hasSaleAlert = saleMatches.length > 0;
            const saleSummary = hasSaleAlert ? (saleMatches[0][1] || 'Pedido confirmado / Intención de compra').trim() : '';

            // Tarea 8: Interceptar directiva [ENVIAR_FOTOS: CODIGO_PRODUCTO] mediante expresión regular
            const photoDirectiveRegex = /\[ENVIAR_FOTOS:\s*([A-Za-z0-9_\-\.]+)\s*\]/gi;
            const photoMatches = [...reply.matchAll(photoDirectiveRegex)];

            // Limpiar directivas del texto visible que recibe el cliente
            const cleanTextReply = reply
              .replace(saleDirectiveRegex, '')
              .replace(photoDirectiveRegex, '')
              .trim();

            const typingDelay = (settings.simulateTyping && settings.typingDelaySeconds ? settings.typingDelaySeconds : 0) * 1000;
            if (typingDelay > 0) {
              await new Promise((r) => setTimeout(r, Math.min(typingDelay, 4000)));
            }

            // Enviar primero la respuesta de texto limpio
            if (cleanTextReply) {
              await this.sendMessage(companyId, phone, cleanTextReply);
            }

            // Inmediatamente después, si hubo solicitud de fotos, despacharlas secuencialmente usando MessageMedia
            if (photoMatches.length > 0) {
              for (const match of photoMatches) {
                const productCode = match[1]?.trim();
                if (productCode) {
                  await this.sendProductPhotos(companyId, phone, productCode);
                }
              }
            }

            // Tarea 10: Procesar Alerta de Venta (Línea Única, Auto-mensaje, Mark Unread, Pausa 120min, Evento Web)
            if (hasSaleAlert) {
              const holder = this.companyClients.get(companyId);
              const { realPhone, chatId } = await this.resolveContactIdentifier(holder?.client, phone);
              const targetChatId = this.chatTargetMap.get(phone) || chatId;

              // Determinar si tenemos un número de teléfono E.164 válido (7 a 14 dígitos y que no sea un LID)
              const candidateDigits = (realPhone || phone).replace(/\D/g, '');
              const isLidNumber = candidateDigits.length >= 15 || phone.endsWith('@lid');
              const validWaPhone = !isLidNumber && candidateDigits.length >= 7 && candidateDigits.length <= 14
                ? candidateDigits
                : (realPhone && realPhone.length >= 7 && realPhone.length <= 14 ? realPhone : null);

              const clientDisplayName = lead.name && lead.name !== phone
                ? `${lead.name} (${validWaPhone ? `+${validWaPhone}` : phone})`
                : (validWaPhone ? `+${validWaPhone}` : phone);

              // Generar enlace wa.me SOLO si se dispone de un número telefónico E.164 válido
              const chatLinkText = validWaPhone
                ? `Ir al chat: https://wa.me/${validWaPhone}`
                : `(Abre WhatsApp y busca el chat de ${clientDisplayName} con punto verde)`;

              // 1. Mensaje al chat propio del negocio (el chat consigo mismo)
              try {
                const selfWid = holder?.client?.info?.wid?._serialized || (holder?.client?.info?.wid?.user ? `${holder.client.info.wid.user}@c.us` : null);
                if (holder?.client && selfWid) {
                  const selfAlertMsg = `🚨 ¡VENTA PENDIENTE!\nCliente: ${clientDisplayName}\nResumen: ${saleSummary}\n${chatLinkText}`;
                  await holder.client.sendMessage(selfWid, selfAlertMsg);
                  this.logger.log(`🚨 [Empresa ${companyId}] Alerta de venta enviada al chat propio (${selfWid})`);
                }
              } catch (errSelf: any) {
                this.logger.warn(`Error enviando auto-mensaje de venta: ${errSelf?.message}`);
              }

              // 2. Marcar la conversación del cliente como no leída en el WhatsApp del comerciante
              try {
                if (holder?.client) {
                  if (typeof holder.client.markChatUnread === 'function') {
                    await holder.client.markChatUnread(targetChatId);
                  } else {
                    const chat = await holder.client.getChatById(targetChatId);
                    if (chat && typeof chat.markUnread === 'function') {
                      await chat.markUnread();
                    }
                  }
                  this.logger.log(`🟢 [Empresa ${companyId}] Chat de ${targetChatId} marcado como no leído.`);
                }
              } catch (errUnread: any) {
                this.logger.warn(`Error marcando chat como no leído: ${errUnread?.message}`);
              }

              // 3. Pausa del Bot en ese Chat (atencion_humana: true) durante 120 minutos
              const pauseMinutes = 120;
              const pausedUntil = new Date(Date.now() + pauseMinutes * 60 * 1000);
              lead.humanPaused = true;
              lead.humanPausedUntil = pausedUntil;
              lead.tag = 'Venta Pendiente';
              await this.leadRepository.save(lead);

              // 4. Alerta en Panel Web (WebSockets / SSE)
              this.broadcastCompanyEvent(companyId, 'sale_alert', {
                lead: {
                  phone: validWaPhone || lead.phone,
                  name: clientDisplayName,
                  tag: 'Venta Pendiente',
                  humanPaused: true,
                  humanPausedUntil: pausedUntil.toISOString(),
                },
                summary: saleSummary,
                timestamp: Date.now(),
              });

              this.broadcastCompanyEvent(companyId, 'lead_updated', {
                phone: lead.phone,
                name: lead.name,
                lastMessage: cleanTextReply,
                tag: 'Venta Pendiente',
                humanPaused: true,
                humanPausedUntil: pausedUntil.toISOString(),
                isPersonal: Boolean(lead.isPersonal),
              });
            }

            return;
          }
        } catch (err: any) {
          this.logger.warn(`Aviso consultando Gemini IA: ${err?.message}`);
        }
      }

      // 3. Fallback estático
      if (settings.fallbackMessage) {
        await this.sendMessage(companyId, phone, settings.fallbackMessage);
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
    const targetSet = new Set<any>();

    // 1. Clientes conectados a esta empresa
    const clients = this.companyEventsClients.get(companyId);
    if (clients && clients.size > 0) {
      for (const c of clients) targetSet.add(c);
    }

    // 2. Si es una alerta de cuota, transmitir también a todos los clientes conectados (ej: superadministradores)
    if (eventName === 'quota_exhausted' || eventName === 'quota_reset') {
      for (const [_, clientSet] of this.companyEventsClients) {
        for (const c of clientSet) targetSet.add(c);
      }
    }

    if (targetSet.size > 0) {
      const data = `data: ${JSON.stringify({ event: eventName, payload, timestamp: Date.now() })}\n\n`;
        for (const clientRes of targetSet) {
          try {
            clientRes.write(data);
          } catch {
            targetSet.delete(clientRes);
          }
        }
      }
    }

  /**
   * Alerta cuando se supera el límite de cuota (Gemini o Mensajes Automáticos)
   * 1. Envía mensaje por WhatsApp al propio número del empresario (selfWid / chat consigo mismo)
   * 2. Emite evento SSE 'quota_exhausted' a la pantalla de la plataforma web
   * 3. Aplica throttling (cooldown) para no saturar al comerciante si llegan múltiples mensajes seguidos
   */
  async notifyQuotaExceeded(
      companyId: string,
      quotaType: 'gemini' | 'auto_messages',
      current: number,
      limit: number,
      planName ?: string,
    ) {
      const alertKey = `${companyId}_${quotaType}`;
      const lastAlert = this.lastQuotaAlertTime.get(alertKey) || 0;
      const now = Date.now();
      const COOLDOWN_MS = 4 * 60 * 60 * 1000; // Cooldown de 4 horas para re-alerta por WhatsApp

      const shouldSendWhatsApp = (now - lastAlert) > COOLDOWN_MS;

      let companyName = companyId;
      let finalPlanName = planName;
      try {
        const company = await this.companyRepository.findOne({
          where: { id: companyId },
          relations: ['plan'],
        });
        if (company?.name) companyName = company.name;
        if (!finalPlanName && company?.plan?.name) finalPlanName = company.plan.name;
      } catch (err: any) {
        this.logger.debug?.(`Error obteniendo empresa para alerta de cuota: ${err?.message}`);
      }

      if (!finalPlanName) finalPlanName = 'Plan Actual';

      const serviceName =
        quotaType === 'gemini'
          ? 'Consultas con Inteligencia Artificial (Gemini)'
          : 'Respuestas Automáticas con Reglas';

      const shortServiceName =
        quotaType === 'gemini'
          ? 'Gemini IA'
          : 'Mensajes Automáticos';

      if (shouldSendWhatsApp) {
        this.lastQuotaAlertTime.set(alertKey, now);
        const holder = this.companyClients.get(companyId);
        if (holder?.client && (holder.status === 'ready' || holder.status === ('READY' as any))) {
          try {
            const selfWid =
              holder.client.info?.wid?._serialized ||
              (holder.client.info?.wid?.user ? `${holder.client.info.wid.user}@c.us` : null);

            if (selfWid) {
              const waAlertMsg =
                `⚠️ *¡ALERTA DE LÍMITE DE PLAN SUPERADO!*\n\n` +
                `🏢 *Empresa:* ${companyName}\n` +
                `📦 *Plan:* ${finalPlanName}\n` +
                `🚫 *Servicio alcanzado:* ${serviceName}\n` +
                `📊 *Consumo:* ${current} de ${limit} permitidos\n\n` +
                `ℹ️ El bot ha pausado la atención automática en este servicio para evitar sobrecostos.\n\n` +
                `👉 Ingresa a la plataforma web para atender a tus clientes directamente o ampliar tu plan.`;

              await holder.client.sendMessage(selfWid, waAlertMsg);
              this.logger.log(`⚠️ [Empresa ${companyId}] Alerta de límite superado enviada a WhatsApp propio (${selfWid})`);
            }
          } catch (errSelf: any) {
            this.logger.warn(`Error enviando alerta de cuota al propio WhatsApp de ${companyId}: ${errSelf?.message}`);
          }
        }
      }

      // Emitir evento SSE a la pantalla de la plataforma en tiempo real
      this.broadcastCompanyEvent(companyId, 'quota_exhausted', {
        companyId,
        type: quotaType,
        current,
        limit,
        companyName,
        planName: finalPlanName,
        serviceName,
        shortServiceName,
        message: `⚠️ Has superado el límite de tu plan (${finalPlanName}) para ${shortServiceName} (${current}/${limit}). La atención automática ha sido pausada.`,
      });
    }

    clearQuotaAlertCooldown(companyId ?: string) {
      if (companyId) {
        this.lastQuotaAlertTime.delete(`${companyId}_gemini`);
        this.lastQuotaAlertTime.delete(`${companyId}_auto_messages`);
      } else {
        this.lastQuotaAlertTime.clear();
      }
    }
  }
