import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { DatabaseModule } from './modules/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { RulesModule } from './modules/rules/rules.module';
import { LeadsModule } from './modules/leads/leads.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { AiAgentModule } from './modules/ai-agent/ai-agent.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { MailModule } from './modules/mail/mail.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { PlansModule } from './modules/plans/plans.module';
import { SuperadminModule } from './modules/superadmin/superadmin.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['../.env', '.env'],
        }),
        ScheduleModule.forRoot(),
        DatabaseModule,
        MailModule,
        AuthModule,
        CompaniesModule,
        WhatsAppModule,
        RulesModule,
        LeadsModule,
        ContactsModule,
        AiAgentModule,
        SchedulerModule,
        CatalogModule,
        PromotionsModule,
        PlansModule,
        SuperadminModule,
    ],
    controllers: [AppController],
})
export class AppModule {}
