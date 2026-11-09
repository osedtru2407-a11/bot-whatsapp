import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Headers,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { PlansService } from './plans.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SuperadminGuard } from '../../common/guards/superadmin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../../entities/company.entity';

@Controller('api')
export class PlansController {
  constructor(
    private readonly plansService: PlansService,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  private async resolveCompanyId(
    user: any,
    queryCompId?: string,
    headerCompId?: string,
  ): Promise<string> {
    const candidate = queryCompId || headerCompId || user?.companyId;
    if (candidate && candidate !== 'undefined' && candidate !== 'null' && candidate.trim()) {
      const exists = await this.companyRepository.findOne({ where: { id: candidate.trim() } });
      if (exists) return exists.id;
    }

    const first = await this.companyRepository.find({ take: 1, order: { createdAt: 'ASC' } });
    if (first.length > 0) return first[0].id;

    throw new NotFoundException('No se encontró ninguna empresa activa.');
  }

  /**
   * Listado público / autenticado de planes activos para visualización
   */
  @Get('plans')
  async getPublicPlans() {
    const plans = await this.plansService.getPlans();
    return { success: true, plans: plans.filter((p) => p.isActive) };
  }

  /**
   * Consulta el uso de cuota y plan de la empresa actual (para el cliente / dashboard)
   */
  @UseGuards(JwtAuthGuard)
  @Get('company/plan-usage')
  async getCompanyPlanUsage(
    @CurrentUser() user: any,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(user, queryCompId, headerCompId);
    const usage = await this.plansService.getCompanyUsage(companyId);
    return { success: true, usage };
  }

  // =========================================================================
  // ENDPOINTS EXCLUSIVOS DE SUPERADMINISTRADOR
  // =========================================================================

  /**
   * Obtener todos los planes (incluyendo inactivos)
   */
  @UseGuards(JwtAuthGuard, SuperadminGuard)
  @Get('superadmin/plans')
  async getAllPlans() {
    const plans = await this.plansService.getPlans();
    return { success: true, plans };
  }

  /**
   * Crear un nuevo plan SaaS
   */
  @UseGuards(JwtAuthGuard, SuperadminGuard)
  @Post('superadmin/plans')
  async createPlan(@Body() body: any) {
    const plan = await this.plansService.createPlan(body);
    return { success: true, plan, message: `Plan "${plan.name}" creado con éxito.` };
  }

  /**
   * Modificar un plan SaaS existente
   */
  @UseGuards(JwtAuthGuard, SuperadminGuard)
  @Put('superadmin/plans/:id')
  async updatePlan(@Param('id') id: string, @Body() body: any) {
    const plan = await this.plansService.updatePlan(id, body);
    return { success: true, plan, message: `Plan "${plan.name}" actualizado con éxito.` };
  }

  /**
   * Eliminar un plan SaaS
   */
  @UseGuards(JwtAuthGuard, SuperadminGuard)
  @Delete('superadmin/plans/:id')
  async deletePlan(@Param('id') id: string) {
    const result = await this.plansService.deletePlan(id);
    return result;
  }

  /**
   * Asignar un plan a una empresa
   */
  @UseGuards(JwtAuthGuard, SuperadminGuard)
  @Post('superadmin/companies/:id/assign-plan')
  async assignPlan(
    @Param('id') companyId: string,
    @Body('planId') planId: string,
  ) {
    const updated = await this.plansService.assignPlanToCompany(companyId, planId);
    return {
      success: true,
      message: `Plan asignado a la empresa correctamente.`,
      company: updated,
    };
  }

  /**
   * Reiniciar la cuota consumida de una empresa a cero
   */
  @UseGuards(JwtAuthGuard, SuperadminGuard)
  @Post('superadmin/companies/:id/reset-quota')
  async resetQuota(@Param('id') companyId: string) {
    const result = await this.plansService.resetCompanyQuota(companyId);
    return result;
  }
}

