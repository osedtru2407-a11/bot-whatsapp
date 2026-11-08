import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Promotion } from '../../entities/promotion.entity';
import { LibraryService } from '../ai-agent/library.service';

export interface PromotionStatusInfo {
  status: 'active' | 'scheduled' | 'expired' | 'paused';
  statusLabel: string;
  badgeClass: string;
  daysRemaining?: number;
  daysToStart?: number;
}

@Injectable()
export class PromotionsService {
  private readonly logger = new Logger('PromotionsService');

  constructor(
    @InjectRepository(Promotion)
    private readonly promotionRepository: Repository<Promotion>,
    private readonly libraryService: LibraryService,
  ) {}

  /**
   * Obtiene la fecha actual en formato YYYY-MM-DD
   */
  getTodayDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Genera el arreglo de días (YYYY-MM-DD) entre dos fechas inclusive
   */
  private getDaysRange(startDate: string, endDate: string): string[] {
    const days: string[] = [];
    const current = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);

    while (current <= end) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      days.push(`${year}-${month}-${day}`);
      current.setDate(current.getDate() + 1);
    }
    return days;
  }

  /**
   * Calcula el estado dinámico de una promoción basado en la fecha actual
   */
  calculatePromotionStatus(promo: Promotion): PromotionStatusInfo {
    const today = this.getTodayDateString();
    const start = promo.startDate;
    const end = promo.endDate;

    if (end < today) {
      return {
        status: 'expired',
        statusLabel: 'Finalizada',
        badgeClass: 'badge-expired',
      };
    }

    if (!promo.isActive) {
      return {
        status: 'paused',
        statusLabel: 'Pausada',
        badgeClass: 'badge-paused',
      };
    }

    if (start <= today && end >= today) {
      const endD = new Date(`${end}T00:00:00`);
      const todayD = new Date(`${today}T00:00:00`);
      const diffDays = Math.ceil((endD.getTime() - todayD.getTime()) / (1000 * 60 * 60 * 24));
      return {
        status: 'active',
        statusLabel: 'Vigente Hoy',
        badgeClass: 'badge-active',
        daysRemaining: diffDays,
      };
    }

    // start > today
    const startD = new Date(`${start}T00:00:00`);
    const todayD = new Date(`${today}T00:00:00`);
    const diffDays = Math.ceil((startD.getTime() - todayD.getTime()) / (1000 * 60 * 60 * 24));
    return {
      status: 'scheduled',
      statusLabel: 'Programada',
      badgeClass: 'badge-scheduled',
      daysToStart: diffDays,
    };
  }

  /**
   * Valida la regla de negocio: máximo 2 promociones con fechas coincidentes activas simultáneamente
   */
  async validateDatesOverlap(
    companyId: string,
    startDate: string,
    endDate: string,
    excludeId?: string,
  ): Promise<boolean> {
    const today = this.getTodayDateString();

    if (startDate > endDate) {
      throw new BadRequestException('La fecha de inicio no puede ser posterior a la fecha de fin.');
    }

    if (endDate < today) {
      throw new BadRequestException('La fecha de fin no puede ser anterior a la fecha de hoy.');
    }

    // Consultamos todas las promociones activas cuya vigencia no haya expirado
    const allPromotions = await this.promotionRepository.find({
      where: { companyId, isActive: true },
    });

    const activeFuturePromotions = allPromotions.filter(
      (p) => p.endDate >= today && (!excludeId || p.id !== excludeId),
    );

    // Revisamos cada día del rango solicitado
    const candidateDays = this.getDaysRange(startDate, endDate);

    for (const day of candidateDays) {
      const overlapping = activeFuturePromotions.filter(
        (p) => p.startDate <= day && p.endDate >= day,
      );

      if (overlapping.length >= 2) {
        const names = overlapping.map((p) => `"${p.name}"`).join(' y ');
        throw new BadRequestException(
          `No es posible programar esta promoción: ya existen 2 promociones activas con fechas coincidentes el día ${day} (${names}). El sistema permite máximo 2 promociones simultáneas. Por favor ajusta los días o desactiva alguna de las campañas existentes.`,
        );
      }
    }

    return true;
  }

  /**
   * Crea una nueva campaña/promoción temporal
   */
  async createPromotion(
    companyId: string,
    dto: {
      name: string;
      startDate: string;
      endDate: string;
      description?: string;
      filename?: string;
      data?: string; // Base64
      textContent?: string;
    },
  ): Promise<any> {
    const name = (dto.name || '').trim();
    const startDate = (dto.startDate || '').trim();
    const endDate = (dto.endDate || '').trim();

    if (!name) {
      throw new BadRequestException('El nombre de la campaña es obligatorio.');
    }
    if (!startDate || !endDate) {
      throw new BadRequestException('Las fechas de inicio y fin son obligatorias.');
    }

    // Extraer contenido del archivo o del texto plano
    let content = (dto.textContent || '').trim();
    let originalFilename: string | null = null;

    if (dto.data && dto.filename) {
      originalFilename = dto.filename.trim();
      const rawBase64 = dto.data.includes('base64,') ? dto.data.split('base64,')[1] : dto.data;
      const buffer = Buffer.from(rawBase64, 'base64');
      content = await this.libraryService.convertToMarkdown(buffer, originalFilename);
    }

    if (!content) {
      throw new BadRequestException(
        'Debes adjuntar un archivo con la información de la promoción o ingresar el contenido del texto.',
      );
    }

    // Validar límite de 2 activas simultáneas
    await this.validateDatesOverlap(companyId, startDate, endDate);

    const promo = this.promotionRepository.create({
      id: 'promo_' + Date.now(),
      companyId,
      name,
      description: dto.description ? dto.description.trim() : null,
      originalFilename,
      content,
      startDate,
      endDate,
      isActive: true,
    });

    const saved = await this.promotionRepository.save(promo);
    return {
      ...saved,
      ...this.calculatePromotionStatus(saved),
    };
  }

  /**
   * Lista todas las promociones de la empresa clasificadas por su estado dinámico
   */
  async getPromotions(companyId: string): Promise<any> {
    const list = await this.promotionRepository.find({
      where: { companyId },
      order: { startDate: 'ASC', createdAt: 'DESC' },
    });

    const enriched = list.map((p) => ({
      ...p,
      ...this.calculatePromotionStatus(p),
    }));

    const activeList = enriched.filter((p) => p.status === 'active');
    const scheduledList = enriched.filter((p) => p.status === 'scheduled');
    const expiredList = enriched.filter((p) => p.status === 'expired');
    const pausedList = enriched.filter((p) => p.status === 'paused');

    return {
      total: enriched.length,
      activeCount: activeList.length,
      scheduledCount: scheduledList.length,
      expiredCount: expiredList.length,
      pausedCount: pausedList.length,
      activeList,
      scheduledList,
      expiredList,
      pausedList,
      all: enriched,
    };
  }

  /**
   * Alterna el estado activo/pausado de una promoción
   */
  async togglePromotion(companyId: string, id: string): Promise<any> {
    const promo = await this.promotionRepository.findOne({
      where: { id, companyId },
    });
    if (!promo) {
      throw new NotFoundException('Promoción no encontrada.');
    }

    const today = this.getTodayDateString();

    // Si está apagada y el usuario quiere encenderla:
    if (!promo.isActive) {
      if (promo.endDate < today) {
        throw new BadRequestException(
          `Esta promoción ya expiró el ${promo.endDate}. Para reactivarla, actualiza su fecha de fin primero.`,
        );
      }
      // Validar que no choque con 2 ya activas
      await this.validateDatesOverlap(companyId, promo.startDate, promo.endDate, promo.id);
      promo.isActive = true;
    } else {
      promo.isActive = false;
    }

    const updated = await this.promotionRepository.save(promo);
    return {
      ...updated,
      ...this.calculatePromotionStatus(updated),
    };
  }

  /**
   * Actualiza los datos de una promoción existente
   */
  async updatePromotion(
    companyId: string,
    id: string,
    dto: {
      name?: string;
      startDate?: string;
      endDate?: string;
      description?: string;
      content?: string;
      textContent?: string;
      filename?: string;
      data?: string;
    },
  ): Promise<any> {
    const promo = await this.promotionRepository.findOne({
      where: { id, companyId },
    });
    if (!promo) {
      throw new NotFoundException('Promoción no encontrada.');
    }

    const targetStart = dto.startDate ? dto.startDate.trim() : promo.startDate;
    const targetEnd = dto.endDate ? dto.endDate.trim() : promo.endDate;

    if (promo.isActive) {
      await this.validateDatesOverlap(companyId, targetStart, targetEnd, promo.id);
    }

    if (dto.name) promo.name = dto.name.trim();
    if (dto.startDate) promo.startDate = targetStart;
    if (dto.endDate) promo.endDate = targetEnd;
    if (dto.description !== undefined) promo.description = dto.description?.trim() || null;

    if (dto.data && dto.filename) {
      promo.originalFilename = dto.filename.trim();
      const rawBase64 = dto.data.includes('base64,') ? dto.data.split('base64,')[1] : dto.data;
      const buffer = Buffer.from(rawBase64, 'base64');
      promo.content = await this.libraryService.convertToMarkdown(buffer, promo.originalFilename);
    } else if (dto.textContent !== undefined && dto.textContent.trim()) {
      promo.content = dto.textContent.trim();
    } else if (dto.content !== undefined && dto.content.trim()) {
      promo.content = dto.content.trim();
    }

    const updated = await this.promotionRepository.save(promo);
    return {
      ...updated,
      ...this.calculatePromotionStatus(updated),
    };
  }

  /**
   * Elimina una promoción
   */
  async deletePromotion(companyId: string, id: string): Promise<any> {
    const promo = await this.promotionRepository.findOne({
      where: { id, companyId },
    });
    if (!promo) {
      throw new NotFoundException('Promoción no encontrada.');
    }
    await this.promotionRepository.remove(promo);
    return { success: true, message: 'Promoción eliminada correctamente.' };
  }

  /**
   * Obtiene las promociones vigentes hoy para alimentar el prompt de Gemini (máximo 2)
   */
  async getActivePromotionsForBot(companyId: string): Promise<Promotion[]> {
    const today = this.getTodayDateString();
    const active = await this.promotionRepository
      .createQueryBuilder('p')
      .where('p.company_id = :companyId', { companyId })
      .andWhere('p.is_active = :isActive', { isActive: true })
      .andWhere('p.start_date <= :today', { today })
      .andWhere('p.end_date >= :today', { today })
      .orderBy('p.start_date', 'ASC')
      .take(2)
      .getMany();

    return active;
  }
}

