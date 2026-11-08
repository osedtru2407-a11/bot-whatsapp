import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';
import { Contact } from '../../entities/contact.entity';
import { ContactGroup } from '../../entities/contact-group.entity';
import { LeadGroupMember } from '../../entities/lead-group-member.entity';
import { Lead } from '../../entities/lead.entity';
import { Company } from '../../entities/company.entity';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Contact,
      ContactGroup,
      LeadGroupMember,
      Lead,
      Company,
    ]),
    WhatsAppModule,
  ],
  providers: [ContactsService],
  controllers: [ContactsController],
  exports: [ContactsService],
})
export class ContactsModule {}

