import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Headers,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LibraryService } from './library.service';
import { GeminiService } from './gemini.service';
import { LibraryDocument } from '../../entities/library-document.entity';
import { Company } from '../../entities/company.entity';
import { CompanySetting } from '../../entities/company-setting.entity';

@Controller('api')
export class AiAgentController {
  constructor(
    private readonly libraryService: LibraryService,
    private readonly geminiService: GeminiService,
    @InjectRepository(LibraryDocument)
    private readonly libraryRepository: Repository<LibraryDocument>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(CompanySetting)
    private readonly companySettingRepository: Repository<CompanySetting>,
  ) {}

  private async resolveCompanyId(
    queryCompId?: string,
    headerCompId?: string,
  ): Promise<string> {
    const candidate = queryCompId || headerCompId;
    if (candidate && candidate !== 'undefined' && candidate !== 'null' && candidate.trim()) {
      const exists = await this.companyRepository.findOne({ where: { id: candidate.trim() } });
      if (exists) return exists.id;
    }

    const first = await this.companyRepository.find({ take: 1, order: { createdAt: 'ASC' } });
    if (first.length > 0) return first[0].id;

    throw new NotFoundException('No se encontró ninguna empresa registrada.');
  }

  // =========================================================================
  // BIBLIOTECA DE CONOCIMIENTO
  // =========================================================================

  @Get('library')
  async getLibrary(
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    const documents = await this.libraryRepository.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
    });

    const stats = this.libraryService.getActiveLibraryContext(documents);
    return {
      documents,
      hasActiveKnowledge: stats.activeCount > 0,
      stats: {
        totalDocuments: documents.length,
        activeDocuments: stats.activeCount,
        totalWords: stats.totalWords,
      },
    };
  }

  @Post('library/upload')
  async uploadDocument(
    @Body() body: any,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    const { filename, data, name } = body;
    if (!filename || !data) {
      throw new BadRequestException('Faltan parámetros filename o data (base64)');
    }

    const rawBase64 = data.includes('base64,') ? data.split('base64,')[1] : data;
    const buffer = Buffer.from(rawBase64, 'base64');
    const customTitle = (name || '').trim();

    const markdown = await this.libraryService.convertToMarkdown(buffer, filename);
    const stats = this.libraryService.calculateStats(markdown);

    const docId = 'doc_' + Date.now();
    this.libraryService.saveMarkdownFile(docId, markdown);

    const doc = this.libraryRepository.create({
      id: docId,
      companyId,
      name: customTitle || filename.replace(/\.[^/.]+$/, ''),
      originalFilename: filename,
      wordCount: stats.wordCount,
      charCount: stats.charCount,
      size: buffer.length,
      active: true,
    });

    await this.libraryRepository.save(doc);
    this.geminiService.clearAllSessions();

    return {
      success: true,
      document: doc,
      preview: markdown.slice(0, 500),
    };
  }

  @Get('library/:id')
  async getDocument(
    @Param('id') docId: string,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    const doc = await this.libraryRepository.findOne({ where: { id: docId, companyId } });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    const content = this.libraryService.getMarkdownContent(doc.id);
    return { document: doc, content };
  }

  @Put('library/:id')
  async updateDocument(
    @Param('id') docId: string,
    @Body() body: any,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    const doc = await this.libraryRepository.findOne({ where: { id: docId, companyId } });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    const { content, name, active } = body;
    if (content !== undefined) {
      this.libraryService.saveMarkdownFile(doc.id, content);
      const stats = this.libraryService.calculateStats(content);
      doc.wordCount = stats.wordCount;
      doc.charCount = stats.charCount;
    }
    if (name !== undefined) doc.name = name;
    if (active !== undefined) doc.active = Boolean(active);

    await this.libraryRepository.save(doc);
    this.geminiService.clearAllSessions();

    return { success: true, document: doc };
  }

  @Post('library/:id/toggle')
  async toggleDocument(
    @Param('id') docId: string,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    const doc = await this.libraryRepository.findOne({ where: { id: docId, companyId } });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    doc.active = !doc.active;
    await this.libraryRepository.save(doc);
    this.geminiService.clearAllSessions();

    return { success: true, active: doc.active };
  }

  @Delete('library/:id')
  async deleteDocument(
    @Param('id') docId: string,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    const doc = await this.libraryRepository.findOne({ where: { id: docId, companyId } });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    this.libraryService.deleteMarkdownFile(doc.id);
    await this.libraryRepository.delete(doc.id);
    this.geminiService.clearAllSessions();

    return { success: true };
  }

  // =========================================================================
  // CONFIGURACIÓN DE EMPRESA Y GEMINI IA
  // =========================================================================

  @Get('settings')
  async getSettings(
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    let s = await this.companySettingRepository.findOne({ where: { companyId } });
    if (!s) {
      s = this.companySettingRepository.create({ companyId });
      await this.companySettingRepository.save(s);
    }

    const maskedKey = s.geminiApiKey
      ? s.geminiApiKey.length > 8
        ? `${s.geminiApiKey.slice(0, 6)}...${s.geminiApiKey.slice(-4)}`
        : '******'
      : null;

    return {
      ...s,
      geminiApiKeyMasked: maskedKey,
      isCustomGeminiKey: Boolean(s.geminiApiKey),
      canConfigureGemini: true,
    };
  }

  @Post('settings')
  async updateSettings(
    @Body() body: any,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    let s = await this.companySettingRepository.findOne({ where: { companyId } });
    if (!s) {
      s = this.companySettingRepository.create({ companyId });
    }

    if (body.geminiApiKey && !body.geminiApiKey.includes('...')) {
      s.geminiApiKey = body.geminiApiKey;
    }
    if (body.geminiModel) s.geminiModel = body.geminiModel;
    if (body.geminiEnabled !== undefined) s.geminiEnabled = Boolean(body.geminiEnabled);
    if (body.botEnabled !== undefined) s.botEnabled = Boolean(body.botEnabled);
    if (body.simulateTyping !== undefined) s.simulateTyping = Boolean(body.simulateTyping);
    if (body.typingDelaySeconds !== undefined) s.typingDelaySeconds = parseInt(body.typingDelaySeconds, 10) || 2;
    if (body.ignoreGroups !== undefined) s.ignoreGroups = Boolean(body.ignoreGroups);
    if (body.fallbackMessage !== undefined) s.fallbackMessage = body.fallbackMessage;
    if (body.businessName !== undefined) {
      s.businessName = body.businessName;
      await this.companyRepository.update(companyId, { name: body.businessName });
    }

    await this.companySettingRepository.save(s);
    this.geminiService.clearAllSessions();

    const maskedKey = s.geminiApiKey
      ? s.geminiApiKey.length > 8
        ? `${s.geminiApiKey.slice(0, 6)}...${s.geminiApiKey.slice(-4)}`
        : '******'
      : null;

    return {
      ...s,
      geminiApiKeyMasked: maskedKey,
      isCustomGeminiKey: Boolean(s.geminiApiKey),
      canConfigureGemini: true,
    };
  }

  @Post('settings/test-gemini')
  async testGemini(
    @Body('apiKey') apiKey?: string,
    @Body('model') model?: string,
  ) {
    return this.geminiService.testApiKey(apiKey, model);
  }
}

