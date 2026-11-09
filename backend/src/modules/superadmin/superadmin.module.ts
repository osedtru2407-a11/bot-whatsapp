import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuperadminController } from './superadmin.controller';
import { SuperadminService } from './superadmin.service';
import { Company } from '../../entities/company.entity';
import { CompanySetting } from '../../entities/company-setting.entity';
import { CompanyUser } from '../../entities/company-user.entity';
import { User } from '../../entities/user.entity';
import { Role } from '../../entities/role.entity';
import { Lead } from '../../entities/lead.entity';
import { Message } from '../../entities/message.entity';
import { Plan } from '../../entities/plan.entity';
import { Rule } from '../../entities/rule.entity';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { AiAgentModule } from '../ai-agent/ai-agent.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      CompanySetting,
      CompanyUser,
      User,
      Role,
      Lead,
      Message,
      Plan,
      Rule,
    ]),
    forwardRef(() => WhatsAppModule),
    forwardRef(() => AiAgentModule),
  ],
  controllers: [SuperadminController],
  providers: [SuperadminService],
  exports: [SuperadminService],
})
export class SuperadminModule {}

