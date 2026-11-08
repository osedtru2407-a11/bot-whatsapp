import { Injectable, Logger, NotFoundException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Schedule } from '../../entities/schedule.entity';
import { Company } from '../../entities/company.entity';
import { Lead } from '../../entities/lead.entity';
import { Contact } from '../../entities/contact.entity';
import { LeadGroupMember } from '../../entities/lead-group-member.entity';
import { WhatsAppManagerService } from '../whatsapp/whatsapp-manager.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger('SchedulerService');

  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepository: Repository<Schedule>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(LeadGroupMember)
    private readonly groupMemberRepository: Repository<LeadGroupMember>,
    private readonly whatsappManager: WhatsAppManagerService,
  ) {}

  // Cron job automático que revisa cada minuto si hay campañas pendientes que deban enviarse
  @Cron('* * * * *')
  async handleCron() {
    const now = new Date();
    const pending = await this.scheduleRepository.find({
      where: {
        status: 'pending',
        scheduledTime: LessThanOrEqual(now),
      },
    });

    for (const item of pending) {
      this.logger.log(`⏰ Cron ejecutando campaña programada "${item.name}" (${item.id})...`);
      this.executeCampaign(item.companyId, item).catch((err) => {
        this.logger.error(`Error en cron ejecutando campaña ${item.id}: ${err?.message}`);
      });
    }
  }

  async getSchedules(companyId: string): Promise<Schedule[]> {
    return this.scheduleRepository.find({
      where: { companyId },
      order: { scheduledTime: 'ASC' },
    });
  }

  async createSchedule(companyId: string, data: any): Promise<Schedule> {
    const effectiveTargetType = data.targetType || 'single';
    const effectiveTargetVal = data.targetValue || data.recipient || '';

    if (!effectiveTargetVal || (!data.message && !data.media) || !data.scheduledTime) {
      throw new BadRequestException('Destinatario/Grupo, fecha y (mensaje o archivo) son obligatorios.');
    }

    let estimatedCount = 1;
    if (effectiveTargetType === 'tag') {
      estimatedCount = await this.leadRepository.count({
        where: { companyId, tag: effectiveTargetVal },
      });
    } else if (effectiveTargetType === 'group') {
      estimatedCount = await this.groupMemberRepository.count({
        where: { companyId, groupId: effectiveTargetVal },
      });
    }

    const validRecurrence = ['none', 'daily', 'weekly', 'monthly', 'yearly'].includes(data.recurrence)
      ? data.recurrence
      : 'none';

    const item = this.scheduleRepository.create({
      id: 'sched-' + Date.now(),
      companyId,
      name: data.name || (effectiveTargetType === 'single' ? 'Envío Individual' : `Campaña: ${effectiveTargetVal}`),
      recipient: effectiveTargetType === 'single' ? effectiveTargetVal.replace(/\D/g, '') : effectiveTargetVal,
      targetType: effectiveTargetType,
      targetValue: effectiveTargetVal,
      totalRecipients: estimatedCount,
      sentRecipients: 0,
      failedRecipients: 0,
      delaySeconds: parseInt(data.delaySeconds, 10) || 10,
      recurrence: validRecurrence,
      executionLogs: [],
      message: data.message || '',
      media: data.media || null,
      scheduledTime: new Date(data.scheduledTime),
      status: 'pending',
    });

    return this.scheduleRepository.save(item);
  }

  async updateSchedule(companyId: string, id: string, data: any): Promise<Schedule> {
    const item = await this.scheduleRepository.findOne({ where: { id, companyId } });
    if (!item) throw new NotFoundException('Envío programado no encontrado');

    if (data.name !== undefined) item.name = data.name;
    if (data.recipient !== undefined) item.recipient = data.recipient;
    if (data.targetType !== undefined) item.targetType = data.targetType;
    if (data.targetValue !== undefined) item.targetValue = data.targetValue;
    if (data.delaySeconds !== undefined) item.delaySeconds = parseInt(data.delaySeconds, 10) || 10;
    if (data.recurrence !== undefined) item.recurrence = data.recurrence;
    if (data.message !== undefined) item.message = data.message;
    if (data.media !== undefined) item.media = data.media;
    if (data.scheduledTime !== undefined) item.scheduledTime = new Date(data.scheduledTime);
    if (data.status !== undefined) item.status = data.status;

    return this.scheduleRepository.save(item);
  }

  async deleteSchedule(companyId: string, id: string): Promise<{ success: boolean }> {
    const item = await this.scheduleRepository.findOne({ where: { id, companyId } });
    if (!item) throw new NotFoundException('Envío programado no encontrado');

    await this.scheduleRepository.delete(id);
    return { success: true };
  }

  async sendNow(companyId: string, id: string) {
    const item = await this.scheduleRepository.findOne({ where: { id, companyId } });
    if (!item) throw new NotFoundException('Envío no encontrado');

    const holder = this.whatsappManager.getClientState(companyId);
    if (!holder || holder.status !== 'ready' || !holder.client) {
      throw new ServiceUnavailableException('El WhatsApp de la empresa no está conectado todavía.');
    }

    item.status = 'pending';
    item.sentRecipients = 0;
    item.failedRecipients = 0;
    item.executionLogs = [];
    item.sentAt = null;
    await this.scheduleRepository.save(item);

    this.executeCampaign(companyId, item).catch((err) => {
      this.logger.error(`Error ejecutando campaña manual ${id}: ${err?.message}`);
    });

    return { success: true, message: 'Campaña iniciada', schedule: item };
  }

  async cancelSchedule(companyId: string, id: string) {
    const item = await this.scheduleRepository.findOne({ where: { id, companyId } });
    if (!item) throw new NotFoundException('Envío no encontrado');

    item.status = 'cancelled';
    await this.scheduleRepository.save(item);
    return { success: true, message: 'Campaña cancelada' };
  }

  async executeCampaign(companyId: string, item: Schedule) {
    const holder = this.whatsappManager.getClientState(companyId);
    if (!holder || holder.status !== 'ready' || !holder.client) {
      this.logger.warn(`No se puede ejecutar campaña ${item.id}: WhatsApp no está listo.`);
      return;
    }

    if (item.status === 'sending' || item.status === 'sent' || item.status === 'cancelled') {
      return;
    }

    item.status = 'sending';
    item.sentRecipients = 0;
    item.failedRecipients = 0;
    item.executionLogs = [];
    await this.scheduleRepository.save(item);

    let targetRecipients: { phone: string; name: string }[] = [];
    const targetType = item.targetType || 'single';
    const targetValue = item.targetValue || item.recipient || '';

    if (targetType === 'single') {
      const cleanDigits = targetValue.replace(/\D/g, '');
      if (cleanDigits) {
        const lead = await this.leadRepository.findOne({ where: { companyId, phone: cleanDigits } });
        targetRecipients.push({ phone: targetValue, name: lead?.name || 'Cliente' });
      }
    } else if (targetType === 'tag') {
      const leads = await this.leadRepository.find({ where: { companyId, tag: targetValue } });
      targetRecipients = leads.map((l) => ({ phone: l.phone, name: l.name || 'Cliente' }));
    } else if (targetType === 'group') {
      const groupMembers = await this.groupMemberRepository.find({ where: { companyId, groupId: targetValue } });
      for (const gm of groupMembers) {
        const contact = await this.contactRepository.findOne({ where: { companyId, phone: gm.leadPhone } });
        targetRecipients.push({ phone: gm.leadPhone, name: contact?.name || 'Cliente' });
      }
    }

    item.totalRecipients = targetRecipients.length;
    if (targetRecipients.length === 0) {
      item.status = 'failed';
      item.executionLogs.push({ time: new Date().toISOString(), status: 'error', detail: 'Sin destinatarios válidos' });
      await this.scheduleRepository.save(item);
      return;
    }

    this.logger.log(`📢 Ejecutando campaña "${item.name}" para ${targetRecipients.length} destinatarios...`);

    const delayMs = (item.delaySeconds || 10) * 1000;
    let sentCount = 0;
    let failCount = 0;

    for (let i = 0; i < targetRecipients.length; i++) {
      // Si la campaña fue cancelada durante el proceso
      const current = await this.scheduleRepository.findOne({ where: { id: item.id } });
      if (current?.status === 'cancelled') {
        this.logger.log(`Campaña ${item.id} cancelada en progreso.`);
        return;
      }

      const rec = targetRecipients[i];
      const personalizedMsg = item.message.replace(/{{nombre}}/gi, rec.name).replace(/{nombre}/gi, rec.name);

      try {
        await this.whatsappManager.sendMessage(companyId, rec.phone, personalizedMsg, item.media);
        sentCount++;
        item.sentRecipients = sentCount;
        item.executionLogs.push({
          phone: rec.phone,
          status: 'success',
          time: new Date().toISOString(),
        });
      } catch (err: any) {
        failCount++;
        item.failedRecipients = failCount;
        item.executionLogs.push({
          phone: rec.phone,
          status: 'failed',
          error: err?.message,
          time: new Date().toISOString(),
        });
      }

      await this.scheduleRepository.save(item);

      if (i < targetRecipients.length - 1 && delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    item.sentAt = new Date();
    item.status = failCount === 0 ? 'sent' : sentCount > 0 ? 'partially_sent' : 'failed';

    // Manejo de recurrencia
    if (item.recurrence && item.recurrence !== 'none') {
      const nextTime = new Date(item.scheduledTime);
      if (item.recurrence === 'daily') nextTime.setDate(nextTime.getDate() + 1);
      else if (item.recurrence === 'weekly') nextTime.setDate(nextTime.getDate() + 7);
      else if (item.recurrence === 'monthly') nextTime.setMonth(nextTime.getMonth() + 1);
      else if (item.recurrence === 'yearly') nextTime.setFullYear(nextTime.getFullYear() + 1);

      item.scheduledTime = nextTime;
      item.status = 'pending';
      item.sentRecipients = 0;
      item.failedRecipients = 0;
      item.executionLogs = [];
      this.logger.log(`Campaña recurrente ${item.id} reprogramada para: ${nextTime.toISOString()}`);
    }

    await this.scheduleRepository.save(item);
  }
}

