import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { Company } from '../../entities/company.entity';
import { CompanyUser } from '../../entities/company-user.entity';
import { CompanySetting } from '../../entities/company-setting.entity';
import { Role } from '../../entities/role.entity';
import { User } from '../../entities/user.entity';
import { Rule } from '../../entities/rule.entity';
import { Lead } from '../../entities/lead.entity';
import { Schedule } from '../../entities/schedule.entity';
import { LibraryDocument } from '../../entities/library-document.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      CompanyUser,
      CompanySetting,
      Role,
      User,
      Rule,
      Lead,
      Schedule,
      LibraryDocument,
    ]),
    AuthModule,
  ],
  providers: [CompaniesService],
  controllers: [CompaniesController],
  exports: [CompaniesService],
})
export class CompaniesModule {}

