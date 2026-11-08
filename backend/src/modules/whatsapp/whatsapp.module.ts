import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsAppManagerService } from './whatsapp-manager.service';
import { WhatsAppController } from './whatsapp.controller';
import { Company } from '../../entities/company.entity';
import { CompanySetting } from '../../entities/company-setting.entity';
import { Rule } from '../../entities/rule.entity';
import { Lead } from '../../entities/lead.entity';
import { Schedule } from '../../entities/schedule.entity';
import { Message } from '../../entities/message.entity';
import { LibraryDocument } from '../../entities/library-document.entity';
import { RulesModule } from '../rules/rules.module';
import { AiAgentModule } from '../ai-agent/ai-agent.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      CompanySetting,
      Rule,
      Lead,
      Schedule,
      Message,
      LibraryDocument,
    ]),
    forwardRef(() => RulesModule),
    forwardRef(() => AiAgentModule),
  ],
  providers: [WhatsAppManagerService],
  controllers: [WhatsAppController],
  exports: [WhatsAppManagerService],
})
export class WhatsAppModule {}
