import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RulesService } from './rules.service';
import { RulesController } from './rules.controller';
import { Rule } from '../../entities/rule.entity';
import { Company } from '../../entities/company.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Rule, Company])],
  providers: [RulesService],
  controllers: [RulesController],
  exports: [RulesService],
})
export class RulesModule {}

