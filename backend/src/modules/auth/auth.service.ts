import {
    Injectable,
    UnauthorizedException,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User } from '../../entities/user.entity';
import { Company } from '../../entities/company.entity';
import { CompanyUser } from '../../entities/company-user.entity';
import { CompanySetting } from '../../entities/company-setting.entity';
import { Role } from '../../entities/role.entity';
import { PasswordReset } from '../../entities/password-reset.entity';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(Company)
        private readonly companyRepository: Repository<Company>,
        @InjectRepository(CompanyUser)
        private readonly companyUserRepository: Repository<CompanyUser>,
        @InjectRepository(CompanySetting)
        private readonly companySettingRepository: Repository<CompanySetting>,
        @InjectRepository(Role)
        private readonly roleRepository: Repository<Role>,
        @InjectRepository(PasswordReset)
        private readonly passwordResetRepository: Repository<PasswordReset>,
        private readonly mailService: MailService,
        private readonly jwtService: JwtService,
        private readonly dataSource: DataSource,
    ) {}

    async hashPassword(password: string): Promise<string> {
        const salt = await bcrypt.genSalt(10);
        return bcrypt.hash(password, salt);
    }

    async comparePassword(password: string, hash: string): Promise<boolean> {
        return bcrypt.compare(password, hash);
    }

    generateToken(user: {
        id: string;
        email: string;
        fullName: string;
        isSuperadmin?: boolean;
    }): string {
        return this.jwtService.sign({
            id: user.id,
            userId: user.id,
            email: user.email,
            fullName: user.fullName,
            isSuperadmin: Boolean(user.isSuperadmin),
        });
    }

    async login(
        emailOrUsername: string,
        password: string,
        targetCompanyId?: string,
    ) {
        const cleanIdentifier = (emailOrUsername || '').trim().toLowerCase();
        if (!cleanIdentifier || !password) {
            throw new BadRequestException(
                'Debes ingresar tu usuario o correo y contraseña.',
            );
        }

        // Buscar por email, prefijo de email o nombre
        const user = await this.userRepository
            .createQueryBuilder('user')
            .where(
                "(LOWER(user.email) = :id OR LOWER(split_part(user.email, '@', 1)) = :id OR LOWER(user.fullName) = :id)",
                {
                    id: cleanIdentifier,
                },
            )
            .andWhere('user.isActive = :isActive', { isActive: true })
            .getOne();

        if (!user) {
            throw new UnauthorizedException(
                'Credenciales inválidas. Usuario/correo o contraseña incorrectos.',
            );
        }

        const passwordMatches = await this.comparePassword(
            password,
            user.passwordHash,
        );
        if (!passwordMatches) {
            throw new UnauthorizedException(
                'Credenciales inválidas. Correo o contraseña incorrectos.',
            );
        }

        const companies = await this.getUserCompanies(user.id);
        const token = this.generateToken(user);

        let activeCompany = targetCompanyId
            ? companies.find((c) => c.id === targetCompanyId)
            : null;
        if (!activeCompany && companies.length > 0) {
            activeCompany = companies[0];
        }

        const membership = activeCompany
            ? {
                  companyId: activeCompany.id,
                  roleId: activeCompany.roleId,
                  roleName: activeCompany.roleName,
                  isOwner: activeCompany.isOwner,
                  permissions: activeCompany.permissions,
              }
            : null;

        return {
            user: {
                id: user.id,
                email: user.email,
                username: user.email
                    ? user.email.split('@')[0]
                    : cleanIdentifier,
                fullName: user.fullName,
                phone: user.phone,
                mustChangePassword: Boolean(user.mustChangePassword),
                isSuperadmin: Boolean(user.isSuperadmin),
            },
            token,
            companies,
            activeCompany: activeCompany || null,
            membership,
            permissions: activeCompany ? activeCompany.permissions : [],
        };
    }

    async register(registerDto: RegisterDto) {
        const cleanEmail = registerDto.email.trim().toLowerCase();
        const cleanName = registerDto.fullName.trim();
        const cleanCompName =
            (registerDto.companyName || '').trim() || 'Mi Empresa';

        const existing = await this.userRepository.findOne({
            where: { email: cleanEmail },
        });
        if (existing) {
            throw new BadRequestException(
                'El correo electrónico ya está registrado.',
            );
        }

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const userId = 'usr_' + Date.now();
            const passwordHash = await this.hashPassword(registerDto.password);

            // 1. Crear usuario
            const newUser = queryRunner.manager.create(User, {
                id: userId,
                email: cleanEmail,
                passwordHash,
                fullName: cleanName,
                isActive: true,
                mustChangePassword: false,
                isSuperadmin: false,
            });
            await queryRunner.manager.save(newUser);

            // 2. Crear empresa inicial
            const companyId = 'comp_' + Date.now();
            const newCompany = queryRunner.manager.create(Company, {
                id: companyId,
                name: cleanCompName,
                createdBy: userId,
            });
            await queryRunner.manager.save(newCompany);

            // 3. Crear membresía como Owner y Administrador
            const membershipId = `cu_${companyId}_${userId}`;
            const membership = queryRunner.manager.create(CompanyUser, {
                id: membershipId,
                userId,
                companyId,
                roleId: 'role_admin',
                isOwner: true,
                status: 'active',
            });
            await queryRunner.manager.save(membership);

            // 4. Crear configuración inicial de la empresa
            const newSettings = queryRunner.manager.create(CompanySetting, {
                companyId,
                businessName: cleanCompName,
                fallbackMessage: `¡Hola! Gracias por comunicarte con ${cleanCompName}. Escribe *menu* para ver las opciones disponibles.`,
            });
            await queryRunner.manager.save(newSettings);

            await queryRunner.commitTransaction();

            const token = this.generateToken(newUser);
            const companies = await this.getUserCompanies(userId);

            return {
                user: {
                    id: userId,
                    email: cleanEmail,
                    fullName: cleanName,
                    mustChangePassword: false,
                    isSuperadmin: false,
                },
                token,
                companies,
                activeCompanyId: companyId,
                company: {
                    id: companyId,
                    name: cleanCompName,
                },
            };
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    }

    async getUserCompanies(userId: string) {
        const list = await this.companyUserRepository
            .createQueryBuilder('cu')
            .innerJoinAndSelect('cu.company', 'c')
            .innerJoinAndSelect('cu.role', 'r')
            .where('cu.userId = :userId AND cu.status = :status', {
                userId,
                status: 'active',
            })
            .orderBy('cu.isOwner', 'DESC')
            .addOrderBy('c.name', 'ASC')
            .getMany();

        return list.map((cu) => ({
            id: cu.company.id,
            name: cu.company.name,
            isOwner: Boolean(cu.isOwner),
            roleId: cu.role.id,
            roleName: cu.role.name,
            permissions: Array.isArray(cu.role.permissions)
                ? cu.role.permissions
                : typeof cu.role.permissions === 'string'
                  ? JSON.parse(cu.role.permissions)
                  : [],
        }));
    }

    async getUserContext(userId: string, targetCompanyId?: string) {
        const user = await this.userRepository.findOne({
            where: { id: userId },
        });
        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        const companies = await this.getUserCompanies(userId);
        let activeCompany = companies.find((c) => c.id === targetCompanyId);
        if (!activeCompany && companies.length > 0) {
            activeCompany = companies[0];
        }

        return {
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                phone: user.phone,
                mustChangePassword: Boolean(user.mustChangePassword),
                isSuperadmin: Boolean(user.isSuperadmin),
            },
            companies,
            activeCompany: activeCompany || null,
            membership: activeCompany
                ? {
                      roleId: activeCompany.roleId,
                      roleName: activeCompany.roleName,
                      isOwner: activeCompany.isOwner,
                      permissions: activeCompany.permissions,
                  }
                : null,
            permissions: activeCompany ? activeCompany.permissions : [],
        };
    }

    async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
        const user = await this.userRepository.findOne({
            where: { id: userId },
        });
        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        if (!user.mustChangePassword || changePasswordDto.currentPassword) {
            if (!changePasswordDto.currentPassword) {
                throw new BadRequestException(
                    'Debes ingresar tu contraseña actual.',
                );
            }
            const matches = await this.comparePassword(
                changePasswordDto.currentPassword,
                user.passwordHash,
            );
            if (!matches) {
                throw new BadRequestException(
                    'La contraseña actual es incorrecta.',
                );
            }
        }

        const newHash = await this.hashPassword(changePasswordDto.newPassword);
        user.passwordHash = newHash;
        user.mustChangePassword = false;
        await this.userRepository.save(user);

        return { success: true };
    }

    async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
        const user = await this.userRepository.findOne({
            where: { id: userId },
        });
        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        if (updateProfileDto.fullName !== undefined) {
            const cleanName = updateProfileDto.fullName.trim();
            if (!cleanName) {
                throw new BadRequestException(
                    'El nombre completo no puede estar vacío.',
                );
            }
            user.fullName = cleanName;
        }

        if (updateProfileDto.phone !== undefined) {
            user.phone = updateProfileDto.phone
                ? updateProfileDto.phone.trim()
                : null;
        }

        await this.userRepository.save(user);

        return {
            success: true,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                phone: user.phone,
                mustChangePassword: Boolean(user.mustChangePassword),
                isSuperadmin: Boolean(user.isSuperadmin),
            },
        };
    }

    async forgotPassword(email: string) {
        const cleanEmail = (email || '').trim().toLowerCase();
        if (!cleanEmail) {
            throw new BadRequestException(
                'El correo electrónico es requerido.',
            );
        }

        const user = await this.userRepository.findOne({
            where: { email: cleanEmail },
        });

        // Por seguridad, si el usuario no existe respondemos con éxito para evitar enumeración de usuarios
        if (!user) {
            return {
                success: true,
                message:
                    'Si el correo electrónico está registrado, recibirás un enlace y código de recuperación.',
            };
        }

        // Invalidar solicitudes activas anteriores de este correo
        await this.passwordResetRepository.update(
            { email: cleanEmail, used: false },
            { used: true },
        );

        // Generar token seguro y código de 6 dígitos
        const token = crypto.randomBytes(32).toString('hex');
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

        const resetRecord = this.passwordResetRepository.create({
            id: `pr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
            email: cleanEmail,
            token,
            code,
            expiresAt,
            used: false,
        });
        await this.passwordResetRepository.save(resetRecord);

        await this.mailService.sendPasswordResetEmail(
            cleanEmail,
            user.fullName,
            token,
            code,
        );

        return {
            success: true,
            message:
                'Se ha enviado un código y enlace de recuperación a tu correo electrónico.',
        };
    }

    async resetPassword(resetDto: ResetPasswordDto) {
        const { token, email, code, newPassword } = resetDto;

        if (!newPassword || newPassword.length < 6) {
            throw new BadRequestException(
                'La nueva contraseña debe tener al menos 6 caracteres.',
            );
        }

        let record: PasswordReset | null = null;

        if (token) {
            record = await this.passwordResetRepository.findOne({
                where: { token: token.trim(), used: false },
            });
        } else if (email && code) {
            record = await this.passwordResetRepository.findOne({
                where: {
                    email: email.trim().toLowerCase(),
                    code: code.trim(),
                    used: false,
                },
            });
        } else {
            throw new BadRequestException(
                'Debes proporcionar un token de restablecimiento o el correo junto al código de 6 dígitos.',
            );
        }

        if (!record) {
            throw new BadRequestException(
                'El código o token de recuperación es inválido o ya ha sido utilizado.',
            );
        }

        if (new Date() > new Date(record.expiresAt)) {
            throw new BadRequestException(
                'El código o enlace de recuperación ha expirado. Por favor solicita uno nuevo.',
            );
        }

        const user = await this.userRepository.findOne({
            where: { email: record.email },
        });
        if (!user) {
            throw new NotFoundException(
                'El usuario asociado a esta solicitud no existe.',
            );
        }

        const salt = await bcrypt.genSalt(10);
        user.passwordHash = await bcrypt.hash(newPassword, salt);
        user.mustChangePassword = false;
        await this.userRepository.save(user);

        // Marcar token como utilizado
        record.used = true;
        await this.passwordResetRepository.save(record);

        return {
            success: true,
            message:
                '¡Contraseña restablecida con éxito! Ya puedes iniciar sesión con tu nueva contraseña.',
        };
    }
}
