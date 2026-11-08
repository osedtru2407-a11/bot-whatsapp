import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('api/companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  async listCompanies(@CurrentUser() user: any) {
    return this.companiesService.listCompaniesForUser(user.id, user.isSuperadmin);
  }

  @Post()
  async createCompany(
    @CurrentUser() user: any,
    @Body() createCompanyDto: CreateCompanyDto,
  ) {
    const result = await this.companiesService.createCompany(user.id, createCompanyDto);
    return { success: true, ...result };
  }

  @Put(':id')
  async updateCompanyName(
    @Param('id') companyId: string,
    @CurrentUser() user: any,
    @Body('name') name: string,
  ) {
    const result = await this.companiesService.updateCompanyName(
      companyId,
      user.id,
      user.isSuperadmin,
      name,
    );
    return { success: true, ...result };
  }

  @Post(':id/select')
  @HttpCode(HttpStatus.OK)
  async selectCompany(
    @Param('id') companyId: string,
    @CurrentUser() user: any,
  ) {
    const result = await this.companiesService.selectCompany(
      companyId,
      user.id,
      user.isSuperadmin,
    );
    return { success: true, ...result };
  }

  @Delete(':id')
  async deleteCompany(
    @Param('id') companyId: string,
    @CurrentUser() user: any,
  ) {
    const result = await this.companiesService.deleteCompany(
      companyId,
      user.id,
      user.isSuperadmin,
    );
    return { success: true, ...result };
  }

  // =========================================================================
  // EQUIPO Y ROLES
  // =========================================================================

  @Get(':id/team')
  async getTeam(@Param('id') companyId: string) {
    const members = await this.companiesService.getTeamMembers(companyId);
    const roles = await this.companiesService.getCompanyRoles(companyId);
    return { success: true, members, roles };
  }

  @Post(':id/team/members')
  async addTeamMember(
    @Param('id') companyId: string,
    @CurrentUser() user: any,
    @Body() memberData: AddTeamMemberDto,
  ) {
    const result = await this.companiesService.addTeamMember(companyId, user.id, memberData);
    return { success: true, ...result };
  }

  @Put(':id/team/members/:userId')
  async updateTeamMemberRole(
    @Param('id') companyId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: any,
    @Body() updateDto: UpdateTeamMemberDto,
  ) {
    const result = await this.companiesService.updateTeamMemberRole(
      companyId,
      user.id,
      targetUserId,
      updateDto.roleId,
    );
    return { success: true, member: result };
  }

  @Delete(':id/team/members/:userId')
  async removeTeamMember(
    @Param('id') companyId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: any,
  ) {
    const result = await this.companiesService.removeTeamMember(companyId, user.id, targetUserId);
    return { success: true, ...result };
  }

  @Get(':id/roles')
  async getCompanyRoles(@Param('id') companyId: string) {
    const roles = await this.companiesService.getCompanyRoles(companyId);
    return { success: true, roles };
  }

  @Post(':id/roles')
  async createCustomRole(
    @Param('id') companyId: string,
    @Body() roleData: CreateRoleDto,
  ) {
    const role = await this.companiesService.createCustomRole(companyId, roleData);
    return { success: true, role };
  }

  @Delete(':id/roles/:roleId')
  async deleteCustomRole(
    @Param('id') companyId: string,
    @Param('roleId') roleId: string,
  ) {
    await this.companiesService.deleteCustomRole(companyId, roleId);
    return { success: true, message: 'Rol eliminado exitosamente' };
  }
}

