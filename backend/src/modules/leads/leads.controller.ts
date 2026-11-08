import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Headers,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeadsService } from './leads.service';
import { Company } from '../../entities/company.entity';

@Controller('api/leads')
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
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

    throw new NotFoundException('No se encontró ninguna empresa registrada.');
  }

  @Get()
  async getLeads(
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.leadsService.getLeads(companyId);
  }

  @Post(':phone/toggle-pause')
  async togglePause(
    @Param('phone') phone: string,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.leadsService.togglePause(companyId, phone);
  }

  @Get(':phone/messages')
  async getMessages(
    @Param('phone') phone: string,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.leadsService.getLeadMessages(companyId, phone);
  }

  @Post(':phone/messages')
  async sendMessage(
    @Param('phone') phone: string,
    @Body('message') message: string,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.leadsService.sendLeadMessage(companyId, phone, message);
  }
}

