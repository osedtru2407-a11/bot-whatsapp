import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RulesService } from './rules.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { Company } from '../../entities/company.entity';

@Controller('api')
export class RulesController {
  constructor(
    private readonly rulesService: RulesService,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  private async resolveCompanyId(
    queryCompId?: string,
    headerCompId?: string,
    bodyCompId?: string,
  ): Promise<string> {
    const candidate = queryCompId || headerCompId || bodyCompId;
    if (candidate && candidate !== 'undefined' && candidate !== 'null' && candidate.trim()) {
      const exists = await this.companyRepository.findOne({ where: { id: candidate.trim() } });
      if (exists) return exists.id;
    }

    const first = await this.companyRepository.find({ take: 1, order: { createdAt: 'ASC' } });
    if (first.length > 0) return first[0].id;

    throw new NotFoundException('No se encontró ninguna empresa registrada.');
  }

  @Get('rules')
  async getRules(
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.rulesService.getRules(companyId);
  }

  @Post('rules')
  async createRule(
    @Body() dto: CreateRuleDto,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.rulesService.createRule(companyId, dto);
  }

  @Put('rules/:id')
  async updateRule(
    @Param('id') ruleId: string,
    @Body() dto: UpdateRuleDto,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.rulesService.updateRule(companyId, ruleId, dto);
  }

  @Delete('rules/:id')
  async deleteRule(
    @Param('id') ruleId: string,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.rulesService.deleteRule(companyId, ruleId);
  }

  @Post('simulate')
  async simulate(
    @Body() body: any,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.rulesService.simulate(
      companyId,
      body.text,
      body.hasMedia,
      body.mediaMimetype,
      body.audio,
    );
  }
}

