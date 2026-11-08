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
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PromotionsService } from './promotions.service';
import { Company } from '../../entities/company.entity';

@Controller('api/promotions')
export class PromotionsController {
  constructor(
    private readonly promotionsService: PromotionsService,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  private async resolveCompanyId(
    queryCompId?: string,
    headerCompId?: string,
  ): Promise<string> {
    const candidate = queryCompId || headerCompId;
    if (candidate && candidate !== 'undefined' && candidate !== 'null' && candidate.trim()) {
      const exists = await this.companyRepository.findOne({ where: { id: candidate.trim() } });
      if (exists) return exists.id;
    }

    const first = await this.companyRepository.find({ take: 1, order: { createdAt: 'ASC' } });
    if (first.length > 0) return first[0].id;

    throw new NotFoundException('No se encontró ninguna empresa activa.');
  }

  @Get()
  async getPromotions(
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.promotionsService.getPromotions(companyId);
  }

  @Post()
  async createPromotion(
    @Body() body: any,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.promotionsService.createPromotion(companyId, body);
  }

  @Put(':id/toggle')
  async togglePromotion(
    @Param('id') id: string,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.promotionsService.togglePromotion(companyId, id);
  }

  @Put(':id')
  async updatePromotion(
    @Param('id') id: string,
    @Body() body: any,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.promotionsService.updatePromotion(companyId, id, body);
  }

  @Delete(':id')
  async deletePromotion(
    @Param('id') id: string,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.promotionsService.deletePromotion(companyId, id);
  }
}

