import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Headers,
  Param,
  Res,
  Req,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';
import * as mime from 'mime';
import { WhatsAppManagerService } from './whatsapp-manager.service';
import { SendMessageDto } from './dto/send-message.dto';
import { UploadFileDto } from './dto/upload-file.dto';
import { Company } from '../../entities/company.entity';
import { CompanySetting } from '../../entities/company-setting.entity';
import { Rule } from '../../entities/rule.entity';
import { Lead } from '../../entities/lead.entity';
import { Schedule } from '../../entities/schedule.entity';

@Controller('api')
export class WhatsAppController {
  constructor(
    private readonly whatsappManager: WhatsAppManagerService,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(CompanySetting)
    private readonly companySettingRepository: Repository<CompanySetting>,
    @InjectRepository(Rule)
    private readonly ruleRepository: Repository<Rule>,
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(Schedule)
    private readonly scheduleRepository: Repository<Schedule>,
  ) {}

  private async resolveCompanyId(
    queryCompId?: string,
    headerCompId?: string,
    bodyCompId?: string,
  ): Promise<string> {
    const candidate = queryCompId || headerCompId || bodyCompId;
    if (candidate && candidate !== 'undefined' && candidate !== 'null' && candidate.trim()) {
      const exists = await this.companyRepository.findOne({ where: { id: candidate.trim() } });
      if (exists) return exists.id;
    }

    const first = await this.companyRepository.find({ take: 1, order: { createdAt: 'ASC' } });
    if (first.length > 0) return first[0].id;

    throw new NotFoundException('No se encontró ninguna empresa registrada en el sistema.');
  }

  // 1. Estado del bot de WhatsApp para la empresa
  @Get('status')
  async getStatus(
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    const settings = await this.companySettingRepository.findOne({ where: { companyId } });
    const holder = this.whatsappManager.getClientState(companyId);

    const [rulesCount, leadsCount, pendingSchedulesCount] = await Promise.all([
      this.ruleRepository.count({ where: { companyId } }),
      this.leadRepository.count({ where: { companyId } }),
      this.scheduleRepository.count({ where: { companyId, status: 'pending' } }),
    ]);

    return {
      companyId,
      companyName: company?.name || 'Empresa',
      status: holder ? holder.status : 'disconnected',
      qrCode: holder ? holder.qrCode : null,
      clientInfo: holder ? holder.clientInfo : null,
      botEnabled: settings ? settings.botEnabled : true,
      rulesCount,
      leadsCount,
      lastLeadUpdate: Date.now(),
      pendingSchedulesCount,
    };
  }

  // 2. Reiniciar bot de WhatsApp
  @Post('bot/restart')
  async restartBot(
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
    @Query('clean') queryClean?: string,
    @Body('clean') bodyClean?: boolean,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    const shouldClean = queryClean === 'true' || bodyClean === true;

    if (shouldClean) {
      await this.whatsappManager.unlinkCompanyWhatsApp(companyId);
    } else {
      await this.whatsappManager.stopCompanyClient(companyId);
    }

    await this.whatsappManager.initCompanyClient(companyId);
    return { success: true, message: `Iniciando cliente de WhatsApp para la empresa ${companyId}...` };
  }

  // 3. Desvincular sesión de WhatsApp
  @Post('bot/disconnect')
  async disconnectBot(
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    await this.whatsappManager.unlinkCompanyWhatsApp(companyId);
    return { success: true, message: `Sesión de WhatsApp desvinculada.` };
  }

  // 4. Activar / Desactivar respuestas automáticas del bot
  @Post('bot/toggle')
  async toggleBot(
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    let settings = await this.companySettingRepository.findOne({ where: { companyId } });
    if (!settings) {
      settings = this.companySettingRepository.create({ companyId, botEnabled: false });
    } else {
      settings.botEnabled = !settings.botEnabled;
    }
    await this.companySettingRepository.save(settings);
    return { botEnabled: settings.botEnabled };
  }

  // 5. Enviar mensaje directo / prueba
  @Post('send')
  async sendMessage(
    @Body() sendDto: SendMessageDto,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId, sendDto.companyId);
    return this.whatsappManager.sendMessage(companyId, sendDto.phone, sendDto.message, sendDto.media);
  }

  // 6. Subida de archivos (Base64)
  @Post('upload')
  async uploadFile(@Body() uploadDto: UploadFileDto) {
    const filename = uploadDto.filename || uploadDto.name;
    const mimetype = uploadDto.mimetype || uploadDto.type;
    const data = uploadDto.data || uploadDto.base64;
    const folder = uploadDto.folder || uploadDto.category || 'rules';

    if (!filename || !data) {
      throw new BadRequestException('Faltan parámetros: filename y data (base64) son requeridos');
    }

    const targetFolder = ['rules', 'quick', 'received', 'library'].includes(folder) ? folder : 'rules';
    const dirPath = path.join(this.whatsappManager.uploadsDir, targetFolder);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const cleanName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueFilename = `${Date.now()}_${cleanName}`;
    const savePath = path.join(dirPath, uniqueFilename);

    const cleanBase64 = data.includes(';base64,') ? data.split(';base64,').pop()! : data;
    const buffer = Buffer.from(cleanBase64, 'base64');
    fs.writeFileSync(savePath, buffer);

    const detectedMime =
      mimetype ||
      (mime && typeof (mime as any).getType === 'function' ? (mime as any).getType(savePath) : null) ||
      'application/octet-stream';
    const fileUrl = `/uploads/${targetFolder}/${uniqueFilename}`;

    const fileObj = {
      url: fileUrl,
      filename: cleanName,
      mimetype: detectedMime,
      size: buffer.length,
    };

    return {
      success: true,
      file: fileObj,
      ...fileObj,
    };
  }

  // 7. Eventos SSE generales de la empresa (CRM en vivo)
  @Get('events')
  async streamEvents(
    @Res() res: Response,
    @Req() req: Request,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    const leadsCount = await this.leadRepository.count({ where: { companyId } });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const cleanup = this.whatsappManager.registerCompanyStream(companyId, res, leadsCount);
    req.on('close', cleanup);
  }

  // 8. Eventos SSE del chat para un contacto específico
  @Get('leads/:phone/stream')
  async streamChat(
    @Param('phone') phone: string,
    @Res() res: Response,
    @Req() req: Request,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const cleanup = this.whatsappManager.registerChatStream(companyId, phone, res);
    req.on('close', cleanup);
  }
}

