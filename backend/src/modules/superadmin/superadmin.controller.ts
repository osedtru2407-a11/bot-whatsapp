import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { SuperadminService } from './superadmin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SuperadminGuard } from '../../common/guards/superadmin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, SuperadminGuard)
@Controller('api/superadmin')
export class SuperadminController {
  constructor(private readonly superadminService: SuperadminService) {}

  @Get('stats')
  async getStats() {
    const stats = await this.superadminService.getStats();
    return { success: true, stats };
  }

  @Get('companies')
  async getCompanies() {
    const companies = await this.superadminService.getCompanies();
    return { success: true, companies };
  }

  @Post('companies')
  async createCompany(@CurrentUser() user: any, @Body('name') name: string) {
    const result = await this.superadminService.createCompany(name, user.id);
    return { success: true, ...result };
  }

  @Put('companies/:id')
  async updateCompany(@Param('id') id: string, @Body() body: any) {
    const result = await this.superadminService.updateCompany(id, body);
    return result;
  }

  @Delete('companies/:id')
  async deleteCompany(@Param('id') id: string) {
    const result = await this.superadminService.deleteCompany(id);
    return result;
  }

  @Post('companies/:id/disconnect-whatsapp')
  async disconnectWhatsApp(@Param('id') id: string) {
    const result = await this.superadminService.disconnectWhatsApp(id);
    return result;
  }

  @Post('companies/:id/clean-data')
  async cleanData(@Param('id') id: string) {
    const result = await this.superadminService.cleanCompanyData(id);
    return result;
  }

  @Post('companies/:id/gemini-config')
  async saveGeminiConfig(
    @Param('id') id: string,
    @Body('apiKey') apiKey?: string,
    @Body('model') model?: string,
  ) {
    const result = await this.superadminService.saveGeminiConfig(id, apiKey, model);
    return result;
  }

  @Get('users')
  async getUsers() {
    const users = await this.superadminService.getUsers();
    return { success: true, users };
  }

  @Post('users')
  async createUser(@Body() body: any) {
    const result = await this.superadminService.createUser(body);
    return { success: true, ...result };
  }

  @Put('users/:id')
  async updateUser(@Param('id') id: string, @Body() body: any) {
    const result = await this.superadminService.updateUser(id, body);
    return result;
  }

  @Delete('users/:id')
  async deleteUser(@CurrentUser() user: any, @Param('id') id: string) {
    const result = await this.superadminService.deleteUser(id, user.id);
    return result;
  }

  @Post('users/:id/reset-password')
  async resetPassword(
    @Param('id') id: string,
    @Body('newPassword') newPassword: string,
    @Body('requireChangeOnLogin') requireChangeOnLogin?: boolean,
  ) {
    const result = await this.superadminService.resetPassword(id, newPassword, requireChangeOnLogin);
    return result;
  }

  @Post('users/:id/toggle-superadmin')
  async toggleSuperadmin(
    @Param('id') id: string,
    @Body('isSuperadmin') isSuperadmin: boolean,
  ) {
    const result = await this.superadminService.toggleSuperadmin(id, isSuperadmin);
    return result;
  }

  @Post('users/:id/companies')
  async assignUserToCompany(
    @Param('id') userId: string,
    @Body('companyId') companyId: string,
    @Body('roleId') roleId: string,
    @Body('isOwner') isOwner?: boolean,
  ) {
    const result = await this.superadminService.assignUserToCompany(
      userId,
      companyId,
      roleId,
      isOwner,
    );
    return result;
  }

  @Delete('users/:id/companies/:companyId')
  async removeUserFromCompany(
    @Param('id') userId: string,
    @Param('companyId') companyId: string,
  ) {
    const result = await this.superadminService.removeUserFromCompany(userId, companyId);
    return result;
  }
}

