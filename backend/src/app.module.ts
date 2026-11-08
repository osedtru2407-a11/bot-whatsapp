import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './modules/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { RulesModule } from './modules/rules/rules.module';
import { LeadsModule } from './modules/leads/leads.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { AiAgentModule } from './modules/ai-agent/ai-agent.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../.env', '.env'],
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    CompaniesModule,
    WhatsAppModule,
    RulesModule,
    LeadsModule,
    ContactsModule,
    AiAgentModule,
    SchedulerModule,
  ],
})
export class AppModule {}
