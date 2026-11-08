import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';
import { Product } from '../../entities/product.entity';
import { Company } from '../../entities/company.entity';
import { AiAgentModule } from '../ai-agent/ai-agent.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, Company]),
    AiAgentModule,
  ],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}

