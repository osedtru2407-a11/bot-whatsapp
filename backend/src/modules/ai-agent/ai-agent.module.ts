import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LibraryService } from './library.service';
import { GeminiService } from './gemini.service';
import { AiAgentController } from './ai-agent.controller';
import { LibraryDocument } from '../../entities/library-document.entity';
import { Company } from '../../entities/company.entity';
import { CompanySetting } from '../../entities/company-setting.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([LibraryDocument, Company, CompanySetting]),
  ],
  providers: [LibraryService, GeminiService],
  controllers: [AiAgentController],
  exports: [LibraryService, GeminiService],
})
export class AiAgentModule {}

