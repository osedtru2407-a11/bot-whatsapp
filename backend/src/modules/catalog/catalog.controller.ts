import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  Res,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CatalogService } from './catalog.service';
import { Company } from '../../entities/company.entity';
import { GeminiService } from '../ai-agent/gemini.service';

@Controller('api/catalog')
export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly geminiService: GeminiService,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
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

    throw new NotFoundException('No se encontró ninguna empresa activa.');
  }

  @Get('template')
  async downloadTemplate(@Res() res: any) {
    const buffer = await this.catalogService.generateTemplateBuffer();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': 'attachment; filename="Plantilla_Catalogo_Productos.docx"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Post('validate')
  async validateCatalog(
    @Body() body: { filename: string; data: string },
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    if (!body.data) {
      throw new BadRequestException('No se ha proporcionado el contenido del archivo.');
    }

    const cleanBase64 = body.data.includes('base64,')
      ? body.data.split('base64,')[1]
      : body.data;

    const buffer = Buffer.from(cleanBase64, 'base64');
    const result = await this.catalogService.parseAndValidateDocx(buffer);

    let comparison = null;
    try {
      const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
      comparison = await this.catalogService.compareWithExisting(companyId, result.products);
    } catch (e) {
      // Si aún no hay empresa creada, no falla la validación
    }

    return {
      valid: true,
      filename: body.filename,
      total: result.total,
      headers: result.headers,
      products: result.products,
      comparison,
    };
  }

  @Post('sync')
  async syncCatalog(
    @Body() body: { filename?: string; data?: string; products?: any[] },
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);

    let productsToSync = body.products;

    if (!productsToSync && body.data) {
      const cleanBase64 = body.data.includes('base64,')
        ? body.data.split('base64,')[1]
        : body.data;
      const buffer = Buffer.from(cleanBase64, 'base64');
      const parsed = await this.catalogService.parseAndValidateDocx(buffer);
      productsToSync = parsed.products;
    }

    if (!productsToSync || productsToSync.length === 0) {
      throw new BadRequestException('No hay productos válidos para sincronizar.');
    }

    const result = await this.catalogService.syncProducts(companyId, productsToSync);
    this.geminiService.clearAllSessions();

    const missingNotice =
      result.missing.length > 0
        ? ` Se detectaron ${result.missing.length} productos ausentes para revisar.`
        : '';

    return {
      success: true,
      message: `Catálogo sincronizado exitosamente: ${result.added} agregados, ${result.updated} actualizados.${missingNotice}`,
      ...result,
    };
  }

  @Put('products/batch-availability')
  async batchUpdateAvailability(
    @Body('updates') updates: { id: string; isAvailable: boolean }[],
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    if (!Array.isArray(updates)) {
      throw new BadRequestException('Se requiere una lista de actualizaciones.');
    }
    const result = await this.catalogService.batchSetAvailability(companyId, updates);
    return {
      success: true,
      ...result,
    };
  }

  @Get('products')
  async getProducts(
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    const products = await this.catalogService.getProducts(companyId);
    return {
      total: products.length,
      products,
    };
  }

  @Put('products/:id/availability')
  async toggleProductAvailability(
    @Param('id') productId: string,
    @Body('isAvailable') isAvailable: boolean,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    const updated = await this.catalogService.toggleAvailability(
      companyId,
      productId,
      Boolean(isAvailable),
    );
    return {
      success: true,
      product: updated,
    };
  }

  @Post('products/:id/photos')
  async uploadProductPhoto(
    @Param('id') productId: string,
    @Body() body: { filename: string; data: string },
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    if (!body.data) {
      throw new BadRequestException('Se requiere la imagen en base64.');
    }
    const updated = await this.catalogService.addProductImage(
      companyId,
      productId,
      body.filename || 'foto.jpg',
      body.data,
    );
    return {
      success: true,
      product: updated,
    };
  }

  @Delete('products/:id/photos')
  async removeProductPhoto(
    @Param('id') productId: string,
    @Body('imageUrl') imageUrl: string,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    if (!imageUrl) {
      throw new BadRequestException('Se requiere la URL de la imagen a eliminar.');
    }
    const updated = await this.catalogService.removeProductImage(
      companyId,
      productId,
      imageUrl,
    );
    return {
      success: true,
      product: updated,
    };
  }

  @Delete('products/:id')
  async deleteProduct(
    @Param('id') productId: string,
    @Query('companyId') queryCompId?: string,
    @Headers('x-company-id') headerCompId?: string,
  ) {
    const companyId = await this.resolveCompanyId(queryCompId, headerCompId);
    await this.catalogService.deleteProduct(companyId, productId);
    this.geminiService.clearAllSessions();
    return {
      success: true,
      message: 'Producto eliminado correctamente del sistema.',
    };
  }
}

