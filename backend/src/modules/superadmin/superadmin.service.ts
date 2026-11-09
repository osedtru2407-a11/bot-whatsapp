import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Company } from '../../entities/company.entity';
import { CompanySetting } from '../../entities/company-setting.entity';
import { CompanyUser } from '../../entities/company-user.entity';
import { User } from '../../entities/user.entity';
import { Role } from '../../entities/role.entity';
import { Lead } from '../../entities/lead.entity';
import { Message } from '../../entities/message.entity';
import { Plan } from '../../entities/plan.entity';
import { Rule } from '../../entities/rule.entity';
import { WhatsAppManagerService } from '../whatsapp/whatsapp-manager.service';
import { GeminiService } from '../ai-agent/gemini.service';

@Injectable()
export class SuperadminService {
  private readonly logger = new Logger('SuperadminService');

  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(CompanySetting)
    private readonly companySettingRepository: Repository<CompanySetting>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
    @InjectRepository(Rule)
    private readonly ruleRepository: Repository<Rule>,
    @Inject(forwardRef(() => WhatsAppManagerService))
    private readonly whatsAppManager: WhatsAppManagerService,
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
    private readonly dataSource: DataSource,
  ) {}

  async getStats() {
    const companiesCount = await this.companyRepository.count();
    const usersCount = await this.userRepository.count();
    const superadminsCount = await this.userRepository.count({ where: { isSuperadmin: true } });
    const leadsCount = await this.leadRepository.count();
    const messagesCount = await this.messageRepository.count();

    const companies = await this.companyRepository.find({ select: ['id'] });
    let activeBotsCount = 0;
    for (const c of companies) {
      const state = this.whatsAppManager.getClientState(c.id);
      if (state && state.status === 'ready') activeBotsCount++;
    }

    return {
      companiesCount,
      usersCount,
      superadminsCount,
      leadsCount,
      messagesCount,
      activeBotsCount,
    };
  }

  async getCompanies() {
    const rawCompanies = await this.dataSource.query(`
      SELECT c.id, c.name, c.created_at, c.created_by,
             c.plan_id, c.gemini_calls_count, c.gemini_calls_reset_at,
             c.auto_messages_count, c.auto_messages_reset_at, c.plan_started_at,
             p.name as plan_name, p.price as plan_price, p.currency as plan_currency,
             p.gemini_limit_type, p.gemini_limit, p.auto_messages_limit_type, p.auto_messages_limit,
             u.full_name as creator_name, u.email as creator_email,
             cs.gemini_api_key, cs.gemini_model, cs.bot_enabled,
             (SELECT count(*) FROM company_users cu WHERE cu.company_id = c.id) as members_count,
             (SELECT count(*) FROM rules r WHERE r.company_id = c.id) as rules_count,
             (SELECT count(*) FROM leads l WHERE l.company_id = c.id) as leads_count,
             (SELECT count(*) FROM messages m WHERE m.company_id = c.id) as messages_count
      FROM companies c
      LEFT JOIN plans p ON p.id = c.plan_id
      LEFT JOIN users u ON u.id = c.created_by
      LEFT JOIN company_settings cs ON cs.company_id = c.id
      ORDER BY c.created_at ASC;
    `);

    return rawCompanies.map((row: any) => {
      const clientState = this.whatsAppManager.getClientState(row.id);
      const customKey = row.gemini_api_key;
      const maskedKey = customKey
        ? customKey.length > 8
          ? `${customKey.slice(0, 6)}...${customKey.slice(-4)}`
          : '******'
        : null;

      const whatsappStatus = clientState ? clientState.status : 'disconnected';

      return {
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        createdBy: row.created_by,
        creatorName: row.creator_name || 'Sistema',
        creatorEmail: row.creator_email || null,
        planId: row.plan_id || 'plan_demo',
        planName: row.plan_name || 'Versión Gratuita / Demo',
        planPrice: Number(row.plan_price || 0),
        planCurrency: row.plan_currency || 'USD',
        geminiCallsCount: parseInt(row.gemini_calls_count || 0, 10),
        geminiLimit: row.gemini_limit !== null && row.gemini_limit !== undefined ? Number(row.gemini_limit) : 100,
        geminiLimitType: row.gemini_limit_type || 'monthly',
        autoMessagesCount: parseInt(row.auto_messages_count || 0, 10),
        autoMessagesLimit: row.auto_messages_limit !== null && row.auto_messages_limit !== undefined ? Number(row.auto_messages_limit) : 500,
        autoMessagesLimitType: row.auto_messages_limit_type || 'monthly',
        whatsappStatus,
        botStatus: whatsappStatus,
        botPhone: clientState?.clientInfo?.wid || null,
        botEnabled: row.bot_enabled !== false,
        memberCount: parseInt(row.members_count || 0, 10),
        membersCount: parseInt(row.members_count || 0, 10),
        rulesCount: parseInt(row.rules_count || 0, 10),
        leadsCount: parseInt(row.leads_count || 0, 10),
        messagesCount: parseInt(row.messages_count || 0, 10),
        geminiModel: row.gemini_model || 'gemini-3.5-flash-lite',
        isCustomGeminiKey: Boolean(customKey),
        hasCustomGeminiKey: Boolean(customKey),
        geminiApiKeyMasked: maskedKey,
        geminiKeyMasked: maskedKey,
        hasGlobalKey: this.geminiService.hasGlobalKey(),
        geminiConfigured: this.geminiService.isConfigured(customKey),
      };
    });
  }

  async createCompany(name: string, userId: string) {
    const cleanName = (name || '').trim();
    if (!cleanName) throw new BadRequestException('El nombre de la empresa es obligatorio');

    const companyId = 'comp_' + Date.now();
    const defaultPlan = (await this.planRepository.findOne({ where: { isDefault: true } })) ||
      (await this.planRepository.findOne({ order: { price: 'ASC' } }));

    const company = this.companyRepository.create({
      id: companyId,
      name: cleanName,
      createdBy: userId,
      planId: defaultPlan ? defaultPlan.id : 'plan_demo',
    });
    await this.companyRepository.save(company);

    const setting = this.companySettingRepository.create({
      companyId,
      businessName: cleanName,
      botEnabled: true,
      simulateTyping: true,
      typingDelaySeconds: 2,
      ignoreGroups: true,
      fallbackMessage: `¡Hola! Gracias por comunicarte con ${cleanName}. Escribe *menu* para ver las opciones disponibles.`,
      geminiEnabled: true,
    });
    await this.companySettingRepository.save(setting);

    return {
      companyId,
      message: `Empresa "${cleanName}" creada exitosamente`,
    };
  }

  async updateCompany(id: string, data: any) {
    const company = await this.companyRepository.findOne({ where: { id } });
    if (!company) throw new NotFoundException('Empresa no encontrada');

    if (data.name && data.name.trim()) {
      company.name = data.name.trim();
      await this.companyRepository.save(company);
    }

    let setting = await this.companySettingRepository.findOne({ where: { companyId: id } });
    if (!setting) {
      setting = this.companySettingRepository.create({ companyId: id });
    }

    if (data.name && data.name.trim()) setting.businessName = data.name.trim();
    if (data.botEnabled !== undefined) setting.botEnabled = Boolean(data.botEnabled);
    if (data.geminiEnabled !== undefined) setting.geminiEnabled = Boolean(data.geminiEnabled);

    await this.companySettingRepository.save(setting);

    return { success: true, message: 'Empresa actualizada correctamente' };
  }

  async deleteCompany(id: string) {
    const count = await this.companyRepository.count();
    if (count <= 1) {
      throw new BadRequestException('No puedes eliminar la única empresa existente en el sistema');
    }

    await this.whatsAppManager.unlinkCompanyWhatsApp(id);
    await this.companyRepository.delete({ id });

    return { success: true, message: 'Empresa eliminada exitosamente' };
  }

  async disconnectWhatsApp(id: string) {
    await this.whatsAppManager.unlinkCompanyWhatsApp(id);
    return {
      success: true,
      message: 'Sesión de WhatsApp desvinculada exitosamente. La empresa puede escanear un nuevo código QR.',
    };
  }

  async cleanCompanyData(id: string) {
    const comp = await this.companyRepository.findOne({ where: { id } });
    if (!comp) throw new NotFoundException('Empresa no encontrada');

    await this.messageRepository.delete({ companyId: id });
    await this.leadRepository.delete({ companyId: id });
    this.geminiService.clearCompanySessions(id);
    this.whatsAppManager.broadcastCompanyEvent(id, 'leads_reloaded', {});

    return {
      success: true,
      message: `Data de la empresa "${comp.name}" limpiada exitosamente. Se eliminaron mensajes y prospectos.`,
    };
  }

  async saveGeminiConfig(id: string, apiKey?: string, model?: string) {
    let setting = await this.companySettingRepository.findOne({ where: { companyId: id } });
    if (!setting) {
      setting = this.companySettingRepository.create({ companyId: id });
    }

    if (apiKey === null || apiKey === '') {
      setting.geminiApiKey = null;
    } else if (apiKey && !apiKey.includes('...')) {
      setting.geminiApiKey = apiKey.trim();
    }

    if (model) {
      setting.geminiModel = model.trim();
    }

    await this.companySettingRepository.save(setting);

    const customKey = setting.geminiApiKey || null;
    const maskedKey = customKey
      ? customKey.length > 8
        ? `${customKey.slice(0, 6)}...${customKey.slice(-4)}`
        : '******'
      : null;

    return {
      success: true,
      configured: this.geminiService.isConfigured(customKey),
      isCustom: Boolean(customKey),
      maskedKey,
      model: setting.geminiModel || 'gemini-3.5-flash-lite',
      hasGlobalKey: this.geminiService.hasGlobalKey(),
    };
  }

  async getUsers() {
    const rawUsers = await this.dataSource.query(`
      SELECT u.id, u.email, u.full_name, u.phone, u.is_active, u.is_superadmin, u.created_at,
             COALESCE(
               json_agg(
                 json_build_object(
                   'companyId', c.id,
                   'companyName', c.name,
                   'roleId', r.id,
                   'roleName', r.name,
                   'isOwner', cu.is_owner,
                   'status', cu.status
                 )
               ) FILTER (WHERE c.id IS NOT NULL),
               '[]'::json
             ) as memberships
      FROM users u
      LEFT JOIN company_users cu ON cu.user_id = u.id
      LEFT JOIN companies c ON c.id = cu.company_id
      LEFT JOIN roles r ON r.id = cu.role_id
      GROUP BY u.id, u.email, u.full_name, u.phone, u.is_active, u.is_superadmin, u.created_at
      ORDER BY u.created_at ASC;
    `);

    return rawUsers;
  }

  async createUser(userData: any) {
    const { fullName, email, password, phone, isSuperadmin, companyId, roleId } = userData;
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (fullName || '').trim();

    if (!cleanEmail || !password || !cleanName) {
      throw new BadRequestException('Nombre completo, correo y contraseña son obligatorios');
    }
    if (password.length < 6) {
      throw new BadRequestException('La contraseña debe tener al menos 6 caracteres');
    }

    const existing = await this.userRepository.findOne({ where: { email: cleanEmail } });
    if (existing) {
      throw new BadRequestException('El correo electrónico ya se encuentra registrado');
    }

    const userId = 'usr_' + Date.now();
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = this.userRepository.create({
      id: userId,
      email: cleanEmail,
      fullName: cleanName,
      passwordHash,
      phone: phone || null,
      isActive: true,
      mustChangePassword: false,
      isSuperadmin: Boolean(isSuperadmin),
    });
    await this.userRepository.save(user);

    if (companyId && roleId) {
      const cu = this.companyUserRepository.create({
        id: `cu_${companyId}_${userId}`,
        userId,
        companyId,
        roleId,
        isOwner: false,
        status: 'active',
      });
      await this.companyUserRepository.save(cu);
    }

    return {
      userId,
      message: 'Usuario creado exitosamente',
    };
  }

  async updateUser(id: string, userData: any) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const { fullName, email, phone, isActive } = userData;
    const cleanEmail = email ? email.trim().toLowerCase() : null;
    const cleanName = fullName ? fullName.trim() : null;

    if (cleanEmail && cleanEmail !== user.email) {
      const existing = await this.userRepository.findOne({ where: { email: cleanEmail } });
      if (existing && existing.id !== id) {
        throw new BadRequestException('El correo electrónico ya está en uso por otro usuario');
      }
      user.email = cleanEmail;
    }

    if (cleanName) user.fullName = cleanName;
    if (phone !== undefined) user.phone = phone || null;
    if (isActive !== undefined) user.isActive = Boolean(isActive);

    await this.userRepository.save(user);
    return { success: true, message: 'Usuario actualizado exitosamente' };
  }

  async deleteUser(id: string, currentUserId: string) {
    if (currentUserId === id) {
      throw new BadRequestException('No puedes eliminar tu propia cuenta de superusuario en uso');
    }

    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    await this.userRepository.remove(user);
    return { success: true, message: 'Usuario eliminado exitosamente' };
  }

  async resetPassword(id: string, newPassword: string, requireChangeOnLogin: boolean = false) {
    if (!newPassword || newPassword.trim().length < 6) {
      throw new BadRequestException('La nueva contraseña debe tener al menos 6 caracteres');
    }

    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword.trim(), salt);
    user.mustChangePassword = Boolean(requireChangeOnLogin);

    await this.userRepository.save(user);

    return {
      success: true,
      message: 'Contraseña restablecida exitosamente.',
      temporaryPassword: newPassword.trim(),
    };
  }

  async toggleSuperadmin(id: string, isSuperadmin: boolean) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    user.isSuperadmin = Boolean(isSuperadmin);
    await this.userRepository.save(user);

    return {
      success: true,
      message: `Privilegios de superusuario ${user.isSuperadmin ? 'otorgados' : 'revocados'} correctamente`,
    };
  }

  async assignUserToCompany(userId: string, companyId: string, roleId: string, isOwner: boolean = false) {
    const existing = await this.companyUserRepository.findOne({ where: { userId, companyId } });
    if (existing) {
      existing.roleId = roleId;
      existing.isOwner = Boolean(isOwner);
      existing.status = 'active';
      await this.companyUserRepository.save(existing);
    } else {
      const cu = this.companyUserRepository.create({
        id: `cu_${companyId}_${userId}`,
        userId,
        companyId,
        roleId,
        isOwner: Boolean(isOwner),
        status: 'active',
      });
      await this.companyUserRepository.save(cu);
    }

    return { success: true, message: 'Usuario vinculado a la empresa exitosamente' };
  }

  async removeUserFromCompany(userId: string, companyId: string) {
    const activeCount = await this.companyUserRepository.count({ where: { companyId, status: 'active' } });
    if (activeCount <= 1) {
      throw new BadRequestException('No es posible desvincular al único usuario activo de la empresa. La empresa no puede quedar sin miembros.');
    }

    await this.companyUserRepository.delete({ userId, companyId });
    return { success: true, message: 'Usuario desvinculado de la empresa exitosamente' };
  }
}
