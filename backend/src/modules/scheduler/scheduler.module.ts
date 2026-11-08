import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { Schedule } from '../../entities/schedule.entity';
import { Company } from '../../entities/company.entity';
import { Lead } from '../../entities/lead.entity';
import { Contact } from '../../entities/contact.entity';
import { LeadGroupMember } from '../../entities/lead-group-member.entity';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Schedule,
      Company,
      Lead,
      Contact,
      LeadGroupMember,
    ]),
    WhatsAppModule,
  ],
  providers: [SchedulerService],
  controllers: [SchedulerController],
  exports: [SchedulerService],
})
export class SchedulerModule {}

