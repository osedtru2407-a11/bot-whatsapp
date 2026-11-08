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
import { SchedulerService } from './scheduler.service';
import { Company } from '../../entities/company.entity';

@Controller('api/schedules')
export class SchedulerController {
  constructor(
    private readonly schedulerService: SchedulerService,
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
  async getSchedules(
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.schedulerService.getSchedules(companyId);
  }

  @Post()
  async createSchedule(
    @Body() body: any,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.schedulerService.createSchedule(companyId, body);
  }

  @Put(':id')
  async updateSchedule(
    @Param('id') id: string,
    @Body() body: any,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.schedulerService.updateSchedule(companyId, id, body);
  }

  @Delete(':id')
  async deleteSchedule(
    @Param('id') id: string,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.schedulerService.deleteSchedule(companyId, id);
  }

  @Post(':id/send-now')
  async sendNow(
    @Param('id') id: string,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.schedulerService.sendNow(companyId, id);
  }

  @Post(':id/cancel')
  async cancelSchedule(
    @Param('id') id: string,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.schedulerService.cancelSchedule(companyId, id);
  }
}

