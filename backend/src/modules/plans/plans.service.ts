import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from '../../entities/plan.entity';
import { Company } from '../../entities/company.entity';

@Injectable()
export class PlansService implements OnModuleInit {
  private readonly logger = new Logger('PlansService');

  constructor(
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) { }

  async onModuleInit() {
    await this.seedDefaultPlans();
  }

  /**
   * Inicializa los planes por defecto en el sistema si la tabla está vacía
   */
  async seedDefaultPlans() {
    try {
      const count = await this.planRepository.count();
      if (count === 0) {
        this.logger.log('Sembrando planes SaaS iniciales por defecto...');
        const defaultPlans = [
          {
            id: 'plan_demo',
            name: 'Versión Gratuita / Demo',
            description: '100 llamados de IA totales para probar el sistema sin costo.',
            price: 0.0,
            currency: 'USD',
            geminiLimitType: 'total',
            geminiLimit: 100,
            autoMessagesLimitType: 'monthly',
            autoMessagesLimit: 200,
            customWarningMessage:
              'Has completado el límite de 100 consultas de inteligencia artificial de la versión demo. Un asesor humano continuará la atención.',
            isDefault: true,
            isActive: true,
          },
          {
            id: 'plan_standard',
            name: 'Plan Estándar ($5 USD/mes)',
            description: '2.500 respuestas de IA Gemini mensuales y 5.000 mensajes automáticos.',
            price: 5.0,
            currency: 'USD',
            geminiLimitType: 'monthly',
            geminiLimit: 2500,
            autoMessagesLimitType: 'monthly',
            autoMessagesLimit: 5000,
            customWarningMessage:
              'Hemos completado el límite mensual de respuestas automáticas de nuestro plan. En breve un asesor continuará la atención personalmente.',
            isDefault: false,
            isActive: true,
          },
          {
            id: 'plan_pro',
            name: 'Plan Pro Ilimitado',
            description: 'Consultas de IA y mensajes automáticos sin límite de cuota.',
            price: 15.0,
            currency: 'USD',
            geminiLimitType: 'monthly',
            geminiLimit: -1,
            autoMessagesLimitType: 'unlimited',
            autoMessagesLimit: -1,
            customWarningMessage: null,
            isDefault: false,
            isActive: true,
          },
        ];

        for (const p of defaultPlans) {
          const entity = this.planRepository.create(p);
          await this.planRepository.save(entity);
        }
        this.logger.log('Planes SaaS iniciales creados exitosamente.');
      }

      // Asignar el plan demo a cualquier empresa existente sin plan
      await this.companyRepository
        .createQueryBuilder()
        .update(Company)
        .set({ planId: 'plan_demo' })
        .where('plan_id IS NULL')
        .execute();
    } catch (err: any) {
      this.logger.warn(`Aviso verificando seed de planes: ${err?.message}`);
    }
  }

  async getPlans(): Promise<Plan[]> {
    return this.planRepository.find({ order: { price: 'ASC' } });
  }

  async getPlanById(id: string): Promise<Plan> {
    const plan = await this.planRepository.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Plan no encontrado');
    return plan;
  }

  async createPlan(data: Partial<Plan>): Promise<Plan> {
    const id = data.id || 'plan_' + Date.now();
    const existing = await this.planRepository.findOne({ where: { id } });
    if (existing) {
      throw new BadRequestException(`Ya existe un plan con el identificador "${id}"`);
    }

    if (data.isDefault) {
      await this.planRepository.update({}, { isDefault: false });
    }

    const plan = this.planRepository.create({
      id,
      name: (data.name || 'Nuevo Plan').trim(),
      description: data.description || null,
      price: data.price !== undefined ? Number(data.price) : 0,
      currency: data.currency || 'USD',
      geminiLimitType: data.geminiLimitType === 'total' ? 'total' : 'monthly',
      geminiLimit: data.geminiLimit !== undefined ? Number(data.geminiLimit) : 100,
      autoMessagesLimitType: data.autoMessagesLimitType || 'monthly',
      autoMessagesLimit: data.autoMessagesLimit !== undefined ? Number(data.autoMessagesLimit) : 500,
      customWarningMessage: data.customWarningMessage || null,
      isDefault: Boolean(data.isDefault),
      isActive: data.isActive !== false,
    });

    return this.planRepository.save(plan);
  }

  async updatePlan(id: string, data: Partial<Plan>): Promise<Plan> {
    const plan = await this.getPlanById(id);

    if (data.isDefault && !plan.isDefault) {
      await this.planRepository.update({}, { isDefault: false });
    }

    if (data.name !== undefined) plan.name = data.name.trim();
    if (data.description !== undefined) plan.description = data.description;
    if (data.price !== undefined) plan.price = Number(data.price);
    if (data.currency !== undefined) plan.currency = data.currency;
    if (data.geminiLimitType !== undefined) plan.geminiLimitType = data.geminiLimitType;
    if (data.geminiLimit !== undefined) plan.geminiLimit = Number(data.geminiLimit);
    if (data.autoMessagesLimitType !== undefined) plan.autoMessagesLimitType = data.autoMessagesLimitType;
    if (data.autoMessagesLimit !== undefined) plan.autoMessagesLimit = Number(data.autoMessagesLimit);
    if (data.customWarningMessage !== undefined) plan.customWarningMessage = data.customWarningMessage;
    if (data.isDefault !== undefined) plan.isDefault = Boolean(data.isDefault);
    if (data.isActive !== undefined) plan.isActive = Boolean(data.isActive);

    return this.planRepository.save(plan);
  }

  async deletePlan(id: string): Promise<{ success: boolean; message: string }> {
    const plan = await this.getPlanById(id);
    if (plan.isDefault) {
      throw new BadRequestException('No puedes eliminar el plan predeterminado del sistema');
    }

    // Reasignar empresas que tengan este plan al plan por defecto
    const defaultPlan = (await this.planRepository.findOne({ where: { isDefault: true } })) ||
      (await this.planRepository.findOne({ order: { price: 'ASC' } }));

    if (defaultPlan) {
      await this.companyRepository.update({ planId: id }, { planId: defaultPlan.id });
    }

    await this.planRepository.remove(plan);
    return { success: true, message: `Plan "${plan.name}" eliminado exitosamente.` };
  }

  /**
   * Asignar un plan específico a una empresa
   */
  async assignPlanToCompany(companyId: string, planId: string): Promise<Company> {
    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada');

    const plan = await this.getPlanById(planId);
    company.planId = plan.id;
    company.planStartedAt = new Date();
    // Reiniciar contadores al cambiar de plan
    company.geminiCallsCount = 0;
    company.geminiCallsResetAt = new Date();
    company.autoMessagesCount = 0;
    company.autoMessagesResetAt = new Date();

    return this.companyRepository.save(company);
  }

  /**
   * Reiniciar manualmente la cuota de una empresa (Superadmin)
   */
  async resetCompanyQuota(companyId: string): Promise<{ success: boolean; message: string }> {
    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada');

    company.geminiCallsCount = 0;
    company.geminiCallsResetAt = new Date();
    company.autoMessagesCount = 0;
    company.autoMessagesResetAt = new Date();
    await this.companyRepository.save(company);

    return { success: true, message: `Cuota de la empresa "${company.name}" reiniciada exitosamente a 0.` };
  }

  /**
   * Obtener el consumo actual de la empresa para mostrar la barra de progreso en el dashboard
   */
  async getCompanyUsage(companyId: string) {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['plan'],
    });
    if (!company) throw new NotFoundException('Empresa no encontrada');

    // Si no tiene plan o el plan fue eliminado, asignar plan por defecto
    let plan = company.plan;
    if (!plan && company.planId) {
      plan = await this.planRepository.findOne({ where: { id: company.planId } });
    }
    if (!plan) {
      plan = (await this.planRepository.findOne({ where: { isDefault: true } })) ||
        (await this.planRepository.findOne({ order: { price: 'ASC' } })) ||
        ({
          id: 'plan_demo',
          name: 'Versión Gratuita / Demo',
          price: 0,
          currency: 'USD',
          geminiLimitType: 'total',
          geminiLimit: 100,
          autoMessagesLimitType: 'monthly',
          autoMessagesLimit: 200,
          customWarningMessage: null,
        } as any);
    }

    // Auto-reinicio mensual si corresponde
    await this.checkAndPerformMonthlyReset(company, plan);

    const geminiLimit = Number(plan.geminiLimit);
    const geminiUsed = Number(company.geminiCallsCount || 0);
    const isGeminiUnlimited = geminiLimit <= 0;
    const geminiPercent = isGeminiUnlimited
      ? 0
      : Math.min(100, Math.round((geminiUsed / geminiLimit) * 100));

    const autoLimit = Number(plan.autoMessagesLimit);
    const autoUsed = Number(company.autoMessagesCount || 0);
    const isAutoUnlimited = autoLimit <= 0 || plan.autoMessagesLimitType === 'unlimited';
    const autoPercent = isAutoUnlimited
      ? 0
      : Math.min(100, Math.round((autoUsed / autoLimit) * 100));

    return {
      companyId: company.id,
      companyName: company.name,
      plan: {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        price: Number(plan.price),
        currency: plan.currency,
        geminiLimitType: plan.geminiLimitType,
        geminiLimit,
        autoMessagesLimitType: plan.autoMessagesLimitType,
        autoMessagesLimit: autoLimit,
        customWarningMessage: plan.customWarningMessage,
      },
      geminiUsage: {
        current: geminiUsed,
        limit: geminiLimit,
        type: plan.geminiLimitType,
        percent: geminiPercent,
        isExhausted: !isGeminiUnlimited && geminiUsed >= geminiLimit,
        isUnlimited: isGeminiUnlimited,
        resetAt: company.geminiCallsResetAt,
      },
      autoMessagesUsage: {
        current: autoUsed,
        limit: autoLimit,
        type: plan.autoMessagesLimitType,
        percent: autoPercent,
        isExhausted: !isAutoUnlimited && autoUsed >= autoLimit,
        isUnlimited: isAutoUnlimited,
        resetAt: company.autoMessagesResetAt,
      },
    };
  }

  /**
   * Verifica la cuota de llamadas a Gemini antes de contactar a la IA
   * Si se agotó, retorna allowed = false con el mensaje de advertencia
   */
  async checkGeminiQuota(companyId: string): Promise<{
    allowed: boolean;
    warningMessage: string | null;
    current: number;
    limit: number;
    planName?: string;
  }> {
    try {
      const company = await this.companyRepository.findOne({
        where: { id: companyId },
        relations: ['plan'],
      });
      if (!company) return { allowed: true, warningMessage: null, current: 0, limit: -1, planName: '' };

      const plan = company.plan || (await this.planRepository.findOne({ where: { id: company.planId } })) ||
        (await this.planRepository.findOne({ where: { isDefault: true } }));

      if (!plan) return { allowed: true, warningMessage: null, current: 0, limit: -1, planName: '' };

      await this.checkAndPerformMonthlyReset(company, plan);

      const limit = Number(plan.geminiLimit);
      const current = Number(company.geminiCallsCount || 0);

      // Si el límite es <= 0 o tipo ilimitado, es ilimitado
      if (limit <= 0 || plan.geminiLimitType === 'unlimited') {
        return { allowed: true, warningMessage: null, current, limit, planName: plan.name };
      }

      if (current >= limit) {
        // Solo enviar mensaje de aviso al cliente si está explícitamente configurado en el plan.
        // Si el empresario/superadmin dejó el campo vacío, NO se envía nada a los clientes para no exponer la cuota.
        const warning = (plan.customWarningMessage && plan.customWarningMessage.trim())
          ? plan.customWarningMessage.trim()
          : null;
        return { allowed: false, warningMessage: warning, current, limit, planName: plan.name };
      }

      return { allowed: true, warningMessage: null, current, limit, planName: plan.name };
    } catch (err: any) {
      this.logger.warn(`Error verificando cuota de Gemini para ${companyId}: ${err?.message}`);
      return { allowed: true, warningMessage: null, current: 0, limit: -1, planName: '' };
    }
  }

  /**
   * Incrementa el contador de llamadas consumidas a Gemini
   */
  async incrementGeminiCalls(companyId: string): Promise<{
    current: number;
    limit: number;
    isExhausted: boolean;
    planName?: string;
  }> {
    try {
      await this.companyRepository.increment({ id: companyId }, 'geminiCallsCount', 1);
      const usage = await this.getCompanyUsage(companyId);
      return {
        current: usage.geminiUsage.current,
        limit: usage.geminiUsage.limit,
        isExhausted: usage.geminiUsage.isExhausted,
        planName: usage.plan.name,
      };
    } catch (err: any) {
      this.logger.warn(`Error incrementando llamadas a Gemini para ${companyId}: ${err?.message}`);
      return { current: 0, limit: -1, isExhausted: false };
    }
  }

  /**
   * Verifica la cuota de mensajes automáticos (reglas)
   */
  async checkAutoMessagesQuota(companyId: string): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    planName?: string;
  }> {
    try {
      const company = await this.companyRepository.findOne({
        where: { id: companyId },
        relations: ['plan'],
      });
      if (!company) return { allowed: true, current: 0, limit: -1, planName: '' };

      const plan = company.plan || (await this.planRepository.findOne({ where: { id: company.planId } })) ||
        (await this.planRepository.findOne({ where: { isDefault: true } }));

      if (!plan) return { allowed: true, current: 0, limit: -1, planName: '' };

      await this.checkAndPerformMonthlyReset(company, plan);

      const limit = Number(plan.autoMessagesLimit);
      const current = Number(company.autoMessagesCount || 0);

      if (limit <= 0 || plan.autoMessagesLimitType === 'unlimited') {
        return { allowed: true, current, limit, planName: plan.name };
      }

      if (current >= limit) {
        return { allowed: false, current, limit, planName: plan.name };
      }

      return { allowed: true, current, limit, planName: plan.name };
    } catch (err: any) {
      this.logger.warn(`Error verificando cuota de mensajes para ${companyId}: ${err?.message}`);
      return { allowed: true, current: 0, limit: -1, planName: '' };
    }
  }

  /**
   * Incrementa el contador de mensajes automáticos
   */
  async incrementAutoMessages(companyId: string): Promise<{
    current: number;
    limit: number;
    isExhausted: boolean;
    planName?: string;
  }> {
    try {
      await this.companyRepository.increment({ id: companyId }, 'autoMessagesCount', 1);
      const usage = await this.getCompanyUsage(companyId);
      return {
        current: usage.autoMessagesUsage.current,
        limit: usage.autoMessagesUsage.limit,
        isExhausted: usage.autoMessagesUsage.isExhausted,
        planName: usage.plan.name,
      };
    } catch (err: any) {
      this.logger.warn(`Error incrementando mensajes para ${companyId}: ${err?.message}`);
      return { current: 0, limit: -1, isExhausted: false };
    }
  }

  /**
   * Realiza el reinicio automático de cuotas si el mes calendario cambió
   */
  private async checkAndPerformMonthlyReset(company: Company, plan: Plan): Promise<void> {
    const now = new Date();
    let needsSave = false;

    // Reinicio mensual de Gemini
    if (plan.geminiLimitType === 'monthly') {
      const lastReset = company.geminiCallsResetAt ? new Date(company.geminiCallsResetAt) : new Date(0);
      const isNewMonth = now.getFullYear() !== lastReset.getFullYear() || now.getMonth() !== lastReset.getMonth();
      if (isNewMonth) {
        company.geminiCallsCount = 0;
        company.geminiCallsResetAt = now;
        needsSave = true;
      }
    }

    // Reinicio mensual de Mensajes Automáticos
    if (plan.autoMessagesLimitType === 'monthly') {
      const lastReset = company.autoMessagesResetAt ? new Date(company.autoMessagesResetAt) : new Date(0);
      const isNewMonth = now.getFullYear() !== lastReset.getFullYear() || now.getMonth() !== lastReset.getMonth();
      if (isNewMonth) {
        company.autoMessagesCount = 0;
        company.autoMessagesResetAt = now;
        needsSave = true;
      }
    }

    if (needsSave) {
      await this.companyRepository.save(company);
    }
  }
}

