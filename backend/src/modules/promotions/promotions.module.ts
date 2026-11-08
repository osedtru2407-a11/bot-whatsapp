import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Promotion } from '../../entities/promotion.entity';
import { Company } from '../../entities/company.entity';
import { PromotionsService } from './promotions.service';
import { PromotionsController } from './promotions.controller';
import { AiAgentModule } from '../ai-agent/ai-agent.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Promotion, Company]),
    AiAgentModule,
  ],
  providers: [PromotionsService],
  controllers: [PromotionsController],
  exports: [PromotionsService],
})
export class PromotionsModule {}

