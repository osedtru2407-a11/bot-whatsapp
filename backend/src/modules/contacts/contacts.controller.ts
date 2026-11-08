import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactsService } from './contacts.service';
import { Company } from '../../entities/company.entity';

@Controller('api')
export class ContactsController {
  constructor(
    private readonly contactsService: ContactsService,
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

  // =========================================================================
  // GRUPOS
  // =========================================================================

  @Get('groups')
  async getGroups(
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.contactsService.getGroups(companyId);
  }

  @Post('groups')
  async createGroup(
    @Body() body: any,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.contactsService.createGroup(companyId, body);
  }

  @Delete('groups/:id')
  async deleteGroup(
    @Param('id') groupId: string,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.contactsService.deleteGroup(companyId, groupId);
  }

  @Get('groups/:id/members')
  async getGroupMembers(
    @Param('id') groupId: string,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.contactsService.getGroupMembers(companyId, groupId);
  }

  @Post('groups/:id/members')
  async addGroupMembers(
    @Param('id') groupId: string,
    @Body('phones') phones: string[],
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.contactsService.addGroupMembers(companyId, groupId, phones);
  }

  @Delete('groups/:id/members/:phone')
  async removeGroupMember(
    @Param('id') groupId: string,
    @Param('phone') phone: string,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.contactsService.removeGroupMember(companyId, groupId, phone);
  }

  // =========================================================================
  // CONTACTOS
  // =========================================================================

  @Get('contacts')
  async getContacts(
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.contactsService.getContacts(companyId);
  }

  @Post('contacts')
  async saveContact(
    @Body() body: any,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    const contact = await this.contactsService.saveContact(companyId, body);
    return { success: true, contact };
  }

  @Delete('contacts/:phone')
  async deleteContact(
    @Param('phone') phone: string,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.contactsService.deleteContact(companyId, phone);
  }

  @Post('contacts/import-csv')
  async importCsv(
    @Body() body: any,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.contactsService.importCsv(
      companyId,
      body.csv,
      body.defaultTag,
      body.defaultPrefix,
      body.groupId,
    );
  }

  @Post('contacts/sync-whatsapp')
  async syncWhatsApp(
    @Body() body: any,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    return this.contactsService.syncWhatsAppContacts(
      companyId,
      body.defaultTag,
      body.groupId,
    );
  }
}

