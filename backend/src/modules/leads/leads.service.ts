import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead } from '../../entities/lead.entity';
import { Message } from '../../entities/message.entity';
import { WhatsAppManagerService } from '../whatsapp/whatsapp-manager.service';

@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    private readonly whatsappManager: WhatsAppManagerService,
  ) {}

  async getLeads(companyId: string): Promise<Lead[]> {
    return this.leadRepository.find({
      where: { companyId },
      order: { lastInteraction: 'DESC' },
    });
  }

  async togglePause(companyId: string, phone: string): Promise<{ success: boolean; humanPaused: boolean }> {
    const cleanPhone = phone.replace(/\D/g, '');
    let lead = await this.leadRepository.findOne({
      where: [
        { companyId, phone },
        { companyId, phone: cleanPhone },
      ],
    });

    if (!lead) {
      throw new NotFoundException('Contacto no encontrado');
    }

    lead.humanPaused = !lead.humanPaused;
    await this.leadRepository.save(lead);

    return { success: true, humanPaused: lead.humanPaused };
  }

  async getLeadMessages(companyId: string, phone: string) {
    const cleanDigits = phone.replace(/\D/g, '');
    const { chatId } = this.whatsappManager.resolveChatId(phone);

    let messages: any[] = [];
    let liveFetched = false;

    // 1. Intentar obtener mensajes en vivo de WhatsApp si está conectado
    const holder = this.whatsappManager.getClientState(companyId);
    if (holder && holder.status === 'ready' && holder.client && chatId) {
      try {
        const chat = await holder.client.getChatById(chatId);
        if (chat) {
          const rawMsgs = await chat.fetchMessages({ limit: 100 });
          if (Array.isArray(rawMsgs) && rawMsgs.length > 0) {
            messages = rawMsgs.map((m: any) => {
              const isAudio = m.type === 'ptt' || m.type === 'audio';
              const bodyText =
                m.body ||
                (m.hasMedia ? m._data?.caption || (isAudio ? '🎤 [Nota de voz]' : '📎 [Archivo adjunto]') : '');
              return {
                id: m.id?._serialized || m.id?.id || `w_${m.timestamp}_${Math.random()}`,
                fromMe: Boolean(m.fromMe),
                author: m.author || null,
                body: bodyText,
                timestamp: m.timestamp ? (m.timestamp > 1e11 ? m.timestamp : m.timestamp * 1000) : Date.now(),
                type: m.type || 'chat',
                hasMedia: Boolean(m.hasMedia),
                mediaUrl: null,
              };
            });
            liveFetched = true;
          }
        }
      } catch (err: any) {
        // Fallback silencioso a base de datos
      }
    }

    // 2. Si no se obtuvieron en vivo, consultar base de datos
    if (!liveFetched) {
      const dbMsgs = await this.messageRepository
        .createQueryBuilder('m')
        .where('m.companyId = :companyId AND (m.phone = :phone OR m.phone = :cleanDigits)', {
          companyId,
          phone,
          cleanDigits,
        })
        .orderBy('m.timestamp', 'ASC')
        .take(100)
        .getMany();

      messages = dbMsgs.map((m) => ({
        id: m.id,
        fromMe: Boolean(m.fromMe),
        body: m.body,
        timestamp: m.timestamp.getTime(),
        type: m.messageType || 'chat',
        hasMedia: Boolean(m.mediaUrl),
        mediaUrl: m.mediaUrl,
        mediaMimetype: m.mediaMimetype,
      }));
    }

    const lead = await this.leadRepository.findOne({
      where: [
        { companyId, phone },
        { companyId, phone: cleanDigits },
      ],
    });

    return {
      success: true,
      phone: cleanDigits || phone,
      leadName: lead?.name || cleanDigits || phone,
      leadTag: lead?.tag || 'Nuevo',
      humanPaused: Boolean(lead?.humanPaused),
      liveFetched,
      messages,
    };
  }

  async sendLeadMessage(companyId: string, phone: string, message: string) {
    if (!message || !message.trim()) {
      throw new BadRequestException('El mensaje no puede estar vacío');
    }

    return this.whatsappManager.sendMessage(companyId, phone, message.trim());
  }
}

