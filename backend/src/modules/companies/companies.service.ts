import {
    Injectable,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Company } from '../../entities/company.entity';
import { CompanyUser } from '../../entities/company-user.entity';
import { CompanySetting } from '../../entities/company-setting.entity';
import { Role } from '../../entities/role.entity';
import { User } from '../../entities/user.entity';
import { Rule } from '../../entities/rule.entity';
import { Lead } from '../../entities/lead.entity';
import { Schedule } from '../../entities/schedule.entity';
import { LibraryDocument } from '../../entities/library-document.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';
import { CreateRoleDto } from './dto/create-role.dto';

@Injectable()
export class CompaniesService {
    constructor(
        @InjectRepository(Company)
        private readonly companyRepository: Repository<Company>,
        @InjectRepository(CompanyUser)
        private readonly companyUserRepository: Repository<CompanyUser>,
        @InjectRepository(CompanySetting)
        private readonly companySettingRepository: Repository<CompanySetting>,
        @InjectRepository(Role)
        private readonly roleRepository: Repository<Role>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(Rule)
        private readonly ruleRepository: Repository<Rule>,
        @InjectRepository(Lead)
        private readonly leadRepository: Repository<Lead>,
        @InjectRepository(Schedule)
        private readonly scheduleRepository: Repository<Schedule>,
        @InjectRepository(LibraryDocument)
        private readonly libraryRepository: Repository<LibraryDocument>,
        private readonly dataSource: DataSource,
    ) {}

    async listCompaniesForUser(userId: string, isSuperadmin: boolean = false) {
        let companyIds: string[] = [];

        if (isSuperadmin) {
            const all = await this.companyRepository.find({ select: ['id'] });
            companyIds = all.map((c) => c.id);
        } else {
            const userComps = await this.companyUserRepository.find({
                where: { userId, status: 'active' },
                select: ['companyId'],
            });
            companyIds = userComps.map((uc) => uc.companyId);
        }

        if (companyIds.length === 0) {
            return { activeCompanyId: null, companies: [] };
        }

        const companies = await this.companyRepository
            .createQueryBuilder('company')
            .leftJoinAndSelect('company.settings', 'settings')
            .where('company.id IN (:...companyIds)', { companyIds })
            .orderBy('company.name', 'ASC')
            .getMany();

        const list = await Promise.all(
            companies.map(async (c) => {
                const [
                    rulesCount,
                    leadsCount,
                    libraryCount,
                    pendingSchedulesCount,
                ] = await Promise.all([
                    this.ruleRepository.count({ where: { companyId: c.id } }),
                    this.leadRepository.count({ where: { companyId: c.id } }),
                    this.libraryRepository.count({
                        where: { companyId: c.id },
                    }),
                    this.scheduleRepository.count({
                        where: { companyId: c.id, status: 'pending' },
                    }),
                ]);

                return {
                    id: c.id,
                    name: c.name,
                    isActive: false,
                    status: 'disconnected', // Será actualizado por el WhatsAppManagerService
                    phone: null,
                    pushname: null,
                    botEnabled: c.settings?.botEnabled !== false,
                    rulesCount,
                    leadsCount,
                    libraryCount,
                    pendingSchedulesCount,
                };
            }),
        );

        const activeCompanyId = list.length > 0 ? list[0].id : null;
        if (activeCompanyId) {
            const activeItem = list.find((item) => item.id === activeCompanyId);
            if (activeItem) activeItem.isActive = true;
        }

        return {
            activeCompanyId,
            companies: list,
        };
    }

    async createCompany(userId: string, createCompanyDto: CreateCompanyDto) {
        const cleanName = createCompanyDto.name.trim();
        const companyId = 'comp_' + Date.now();

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const newCompany = queryRunner.manager.create(Company, {
                id: companyId,
                name: cleanName,
                createdBy: userId,
            });
            await queryRunner.manager.save(newCompany);

            const membership = queryRunner.manager.create(CompanyUser, {
                id: `cu_${companyId}_${userId}`,
                userId,
                companyId,
                roleId: 'role_admin',
                isOwner: true,
                status: 'active',
            });
            await queryRunner.manager.save(membership);

            const settings = queryRunner.manager.create(CompanySetting, {
                companyId,
                businessName: cleanName,
                fallbackMessage: `¡Hola! Gracias por comunicarte con ${cleanName}. Escribe *menu* para ver las opciones disponibles.`,
            });
            await queryRunner.manager.save(settings);

            await queryRunner.commitTransaction();

            return {
                company: newCompany,
                activeCompanyId: companyId,
            };
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    }

    async updateCompanyName(
        companyId: string,
        userId: string,
        isSuperadmin: boolean,
        name: string,
    ) {
        const cleanName = (name || '').trim();
        if (!cleanName) {
            throw new BadRequestException(
                'El nombre de la empresa no puede estar vacío',
            );
        }

        if (!isSuperadmin) {
            const membership = await this.companyUserRepository.findOne({
                where: { companyId, userId, status: 'active' },
            });
            if (
                !membership ||
                (!membership.isOwner && membership.roleId !== 'role_admin')
            ) {
                throw new ForbiddenException(
                    'No tienes permisos de administrador para modificar esta empresa.',
                );
            }
        }

        const company = await this.companyRepository.findOne({
            where: { id: companyId },
        });
        if (!company) {
            throw new NotFoundException('Empresa no encontrada');
        }

        const oldName = company.name;
        company.name = cleanName;
        await this.companyRepository.save(company);

        const settings = await this.companySettingRepository.findOne({
            where: { companyId },
        });
        if (settings) {
            settings.businessName = cleanName;
            if (
                settings.fallbackMessage &&
                oldName &&
                settings.fallbackMessage.includes(oldName)
            ) {
                settings.fallbackMessage = settings.fallbackMessage
                    .split(oldName)
                    .join(cleanName);
            }
            await this.companySettingRepository.save(settings);
        }

        return { company };
    }

    async selectCompany(
        companyId: string,
        userId: string,
        isSuperadmin: boolean,
    ) {
        const company = await this.companyRepository.findOne({
            where: { id: companyId },
        });
        if (!company) {
            throw new NotFoundException('Empresa no encontrada');
        }

        if (!isSuperadmin) {
            const membership = await this.companyUserRepository.findOne({
                where: { companyId, userId, status: 'active' },
            });
            if (!membership) {
                throw new ForbiddenException(
                    'Acceso denegado: no estás vinculado a esta empresa.',
                );
            }
        }

        return { activeCompanyId: company.id, name: company.name };
    }

    async deleteCompany(
        companyId: string,
        userId: string,
        isSuperadmin: boolean,
    ) {
        const totalCompanies = await this.companyRepository.count();
        if (totalCompanies <= 1) {
            throw new BadRequestException(
                'No es posible eliminar la única empresa registrada en el sistema.',
            );
        }

        if (!isSuperadmin) {
            const membership = await this.companyUserRepository.findOne({
                where: { companyId, userId, status: 'active' },
            });
            if (!membership || !membership.isOwner) {
                throw new ForbiddenException(
                    'Solo el propietario de la empresa o un superadministrador pueden eliminarla.',
                );
            }
        }

        const company = await this.companyRepository.findOne({
            where: { id: companyId },
        });
        if (!company) {
            throw new NotFoundException('Empresa no encontrada');
        }

        await this.companyRepository.delete(companyId);

        const remaining = await this.companyRepository.find({
            select: ['id'],
            take: 1,
        });
        const nextActiveId = remaining.length > 0 ? remaining[0].id : null;

        return { activeCompanyId: nextActiveId };
    }

    // =========================================================================
    // GESTIÓN DE EQUIPO Y MIEMBROS
    // =========================================================================

    async getTeamMembers(companyId: string) {
        const members = await this.companyUserRepository
            .createQueryBuilder('cu')
            .innerJoinAndSelect('cu.user', 'u')
            .innerJoinAndSelect('cu.role', 'r')
            .where('cu.companyId = :companyId', { companyId })
            .orderBy('cu.isOwner', 'DESC')
            .addOrderBy('u.fullName', 'ASC')
            .getMany();

        return members.map((cu) => ({
            id: cu.user.id,
            userId: cu.user.id,
            email: cu.user.email,
            fullName: cu.user.fullName,
            phone: cu.phone || cu.user.phone || null,
            isActive: Boolean(cu.user.isActive),
            isOwner: Boolean(cu.isOwner),
            status: cu.status,
            joinedAt: cu.createdAt,
            roleId: cu.role.id,
            roleName: cu.role.name,
            roleDescription: cu.role.description,
        }));
    }

    async checkUserByEmail(companyId: string, email: string) {
        const cleanEmail = (email || '').trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes('@')) {
            return { exists: false, user: null, isAlreadyInCompany: false };
        }

        const user = await this.userRepository
            .createQueryBuilder('u')
            .where('LOWER(u.email) = :email', { email: cleanEmail })
            .getOne();

        if (!user) {
            return { exists: false, user: null, isAlreadyInCompany: false };
        }

        const membership = await this.companyUserRepository.findOne({
            where: { companyId, userId: user.id, status: 'active' },
            relations: ['role'],
        });

        return {
            exists: true,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
            },
            isAlreadyInCompany: Boolean(membership),
            companyPhone: membership?.phone || null,
            currentRole: membership?.role?.name || null,
        };
    }

    async addTeamMember(
        companyId: string,
        adminUserId: string,
        memberData: AddTeamMemberDto,
    ) {
        const cleanEmail = memberData.email.trim().toLowerCase();
        const cleanName = memberData.fullName.trim();
        const cleanRole = memberData.roleId.trim();
        const cleanPhone = (memberData.phone || '').trim();
        const passCandidate = (
            memberData.temporaryPassword ||
            memberData.password ||
            ''
        ).trim();

        // Validar permisos del administrador
        const adminMembership = await this.companyUserRepository.findOne({
            where: { companyId, userId: adminUserId, status: 'active' },
            relations: ['role'],
        });

        if (!adminMembership) {
            throw new ForbiddenException('No tienes permisos en esta empresa.');
        }

        const adminPerms = adminMembership.role?.permissions || [];
        if (
            !adminMembership.isOwner &&
            !adminPerms.includes('team:manage') &&
            !adminPerms.includes('*')
        ) {
            throw new ForbiddenException(
                'No tienes permisos para administrar miembros en esta empresa.',
            );
        }

        // Validar que el rol exista
        const role = await this.roleRepository
            .createQueryBuilder('r')
            .where(
                'r.id = :roleId AND (r.companyId IS NULL OR r.companyId = :companyId)',
                {
                    roleId: cleanRole,
                    companyId,
                },
            )
            .getOne();

        if (!role) {
            throw new BadRequestException('El rol seleccionado no es válido.');
        }

        // Buscar si el usuario ya existe en el sistema
        let user = await this.userRepository
            .createQueryBuilder('u')
            .where('LOWER(u.email) = :email', { email: cleanEmail })
            .getOne();
        let isExistingUser = false;

        if (user) {
            // REGLA CLAVE (Pendiente 5): Si el correo ya existe, NO se toca su contraseña.
            // Simplemente se le asigna a la empresa con el rol seleccionado.
            isExistingUser = true;
        } else {
            if (!passCandidate || passCandidate.length < 4) {
                throw new BadRequestException(
                    'La contraseña temporal debe tener al menos 4 caracteres.',
                );
            }

            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(passCandidate, salt);

            user = this.userRepository.create({
                id: 'usr_' + Date.now(),
                email: cleanEmail,
                passwordHash,
                fullName: cleanName,
                phone: cleanPhone || null,
                isActive: true,
                mustChangePassword: true,
                isSuperadmin: false,
            });
            await this.userRepository.save(user);
        }

        // Crear o actualizar la membresía en la empresa con el teléfono corporativo asignado
        let membership = await this.companyUserRepository.findOne({
            where: { companyId, userId: user.id },
        });

        if (membership) {
            membership.roleId = cleanRole;
            membership.status = 'active';
            if (cleanPhone) {
                membership.phone = cleanPhone;
            }
            await this.companyUserRepository.save(membership);
        } else {
            membership = this.companyUserRepository.create({
                id: `cu_${companyId}_${user.id}`,
                userId: user.id,
                companyId,
                roleId: cleanRole,
                phone: cleanPhone || null,
                isOwner: false,
                status: 'active',
            });
            await this.companyUserRepository.save(membership);
        }

        return {
            userId: user.id,
            email: user.email,
            fullName: user.fullName,
            phone: membership.phone || user.phone || null,
            roleId: cleanRole,
            roleName: role.name,
            alreadyExisted: isExistingUser,
            temporaryPassword: isExistingUser ? null : passCandidate,
        };
    }

    async updateTeamMemberRole(
        companyId: string,
        adminUserId: string,
        targetUserId: string,
        updateDto: UpdateTeamMemberDto,
    ) {
        if (adminUserId === targetUserId) {
            throw new BadRequestException(
                'No puedes cambiar tu propio rol en la empresa.',
            );
        }

        const membership = await this.companyUserRepository.findOne({
            where: { companyId, userId: targetUserId },
        });

        if (!membership) {
            throw new NotFoundException(
                'Miembro no encontrado en esta empresa.',
            );
        }

        if (updateDto.roleId) {
            membership.roleId = updateDto.roleId;
        }
        if (updateDto.phone !== undefined) {
            membership.phone = updateDto.phone ? updateDto.phone.trim() : null;
        }
        await this.companyUserRepository.save(membership);

        return membership;
    }

    async removeTeamMember(
        companyId: string,
        adminUserId: string,
        targetUserId: string,
    ) {
        // REGLA CLAVE (Pendiente 4): Si queda un único usuario en la empresa, no puede borrarse ni dejar la empresa sola
        const activeMembersCount = await this.companyUserRepository.count({
            where: { companyId, status: 'active' },
        });

        if (activeMembersCount <= 1) {
            throw new BadRequestException(
                'No es posible eliminar al único usuario de la empresa. La empresa no puede quedar sin miembros.',
            );
        }

        if (adminUserId === targetUserId) {
            throw new BadRequestException(
                'No puedes eliminarte a ti mismo de la empresa.',
            );
        }

        const membership = await this.companyUserRepository.findOne({
            where: { companyId, userId: targetUserId },
        });

        if (!membership) {
            throw new NotFoundException('Miembro no encontrado.');
        }

        if (membership.isOwner) {
            throw new BadRequestException(
                'No se puede eliminar al propietario original de la empresa.',
            );
        }

        await this.companyUserRepository.delete(membership.id);
        return { success: true };
    }

    // =========================================================================
    // GESTIÓN DE ROLES
    // =========================================================================

    async getCompanyRoles(companyId: string) {
        const roles = await this.roleRepository
            .createQueryBuilder('r')
            .where('r.companyId IS NULL OR r.companyId = :companyId', {
                companyId,
            })
            .orderBy('r.isSystemDefault', 'DESC')
            .addOrderBy('r.name', 'ASC')
            .getMany();

        return roles.map((r) => ({
            id: r.id,
            companyId: r.companyId,
            name: r.name,
            description: r.description,
            isSystemDefault: Boolean(r.isSystemDefault),
            permissions: Array.isArray(r.permissions)
                ? r.permissions
                : typeof r.permissions === 'string'
                  ? JSON.parse(r.permissions)
                  : [],
        }));
    }

    async createCustomRole(companyId: string, roleData: CreateRoleDto) {
        const cleanName = roleData.name.trim();
        const roleId = 'role_' + Date.now();

        const role = this.roleRepository.create({
            id: roleId,
            companyId,
            name: cleanName,
            description: roleData.description || '',
            isSystemDefault: false,
            permissions: roleData.permissions || [],
        });

        await this.roleRepository.save(role);
        return role;
    }

    async deleteCustomRole(companyId: string, roleId: string) {
        const role = await this.roleRepository.findOne({
            where: [
                { id: roleId, companyId },
                { id: roleId, companyId: IsNull() },
            ],
        });

        if (!role) {
            throw new NotFoundException('Rol no encontrado.');
        }

        if (role.isSystemDefault) {
            throw new BadRequestException(
                'No se pueden eliminar los roles predeterminados del sistema.',
            );
        }

        const count = await this.companyUserRepository.count({
            where: { companyId, roleId },
        });

        if (count > 0) {
            throw new BadRequestException(
                `Hay ${count} colaborador(es) asignados a este rol. Reasigna sus roles antes de eliminarlo.`,
            );
        }

        await this.roleRepository.delete(roleId);
        return { success: true };
    }
}
