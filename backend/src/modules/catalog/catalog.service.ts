import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';
// @ts-ignore
import * as mammoth from 'mammoth';
import { Product } from '../../entities/product.entity';

export interface ParsedProduct {
  code: string;
  name: string;
  description: string;
  price: string;
  observations: string;
  rowNumber: number;
}

@Injectable()
export class CatalogService {
  private readonly logger = new Logger('CatalogService');
  public readonly uploadsDir: string;
  public readonly productUploadsDir: string;

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {
    const candidateRoots = [
      process.cwd(),
      path.resolve(process.cwd(), '..'),
      path.resolve(__dirname, '..', '..', '..'),
      path.resolve(__dirname, '..', '..'),
    ];
    const rootDir =
      candidateRoots.find(
        (dir) =>
          fs.existsSync(path.join(dir, 'server.js')) ||
          fs.existsSync(path.join(dir, 'pendientes.txt')) ||
          fs.existsSync(path.join(dir, 'public')),
      ) || process.cwd();

    this.uploadsDir = path.resolve(rootDir, 'public', 'uploads');
    this.productUploadsDir = path.resolve(this.uploadsDir, 'products');

    if (!fs.existsSync(this.productUploadsDir)) {
      try {
        fs.mkdirSync(this.productUploadsDir, { recursive: true });
      } catch (err: any) {
        this.logger.error(`Error creando carpeta de fotos de productos: ${err?.message}`);
      }
    }
  }

  async parseAndValidateDocx(buffer: Buffer): Promise<{
    products: ParsedProduct[];
    total: number;
    headers: string[];
  }> {
    let html = '';
    try {
      const result = await mammoth.convertToHtml({ buffer });
      html = result.value || '';
    } catch (err: any) {
      throw new BadRequestException(
        `No fue posible leer el archivo Word (.docx). Asegúrate de que no esté dañado o protegido con contraseña. Detalle: ${err?.message}`,
      );
    }

    const tables = this.extractTablesFromHtml(html);
    if (!tables || tables.length === 0) {
      throw new BadRequestException(
        'El archivo Word no contiene ninguna tabla. El catálogo de productos debe estar organizado dentro de una tabla en el documento.',
      );
    }

    let matchedTable: string[][] | null = null;
    let columnMap: {
      codeIndex: number;
      nameIndex: number;
      descIndex: number;
      priceIndex: number;
      obsIndex: number;
    } | null = null;
    let foundHeaders: string[] = [];

    for (const table of tables) {
      if (table.length < 1) continue;
      for (let r = 0; r < Math.min(3, table.length); r++) {
        const headerRow = table[r];
        const map = this.matchColumns(headerRow);
        if (map) {
          matchedTable = table.slice(r + 1);
          columnMap = map;
          foundHeaders = headerRow;
          break;
        }
      }
      if (matchedTable) break;
    }

    if (!matchedTable || !columnMap) {
      const firstHeaders = tables[0]?.[0] || [];
      throw new BadRequestException(
        `El archivo no contiene la tabla con las 5 columnas requeridas: "Código", "Nombre / Producto", "Descripción", "Precio" y "Observaciones". ` +
        `(Columnas encontradas en tu archivo: [${firstHeaders.join(', ') || 'Ninguna'}])`,
      );
    }

    if (matchedTable.length === 0) {
      throw new BadRequestException(
        'La tabla del catálogo no contiene filas con productos. Debes registrar al menos un producto debajo de los encabezados.',
      );
    }

    const products: ParsedProduct[] = [];
    const seenCodes = new Map<string, number>();

    for (let i = 0; i < matchedTable.length; i++) {
      const row = matchedTable[i];
      const rowNum = i + 2;

      const isCompletelyEmpty = row.every((c) => !c || !c.trim());
      if (isCompletelyEmpty) continue;

      const code = (row[columnMap.codeIndex] || '').trim();
      const name = (row[columnMap.nameIndex] || '').trim();
      const description = (row[columnMap.descIndex] || '').trim();
      const price = (row[columnMap.priceIndex] || '').trim();
      const observations = (row[columnMap.obsIndex] || '').trim();

      if (!code) {
        throw new BadRequestException(
          `Fila ${rowNum} rechazada: El campo "Código" está vacío. Todos los productos deben tener obligatoriamente un código asignado. (Nombre: "${name || 'Sin nombre'}")`,
        );
      }

      const normalizedCode = code.toUpperCase();
      if (seenCodes.has(normalizedCode)) {
        const previousRow = seenCodes.get(normalizedCode);
        throw new BadRequestException(
          `Código duplicado detectado: El código "${code}" se repite en la fila ${rowNum} (ya fue definido previamente en la fila ${previousRow}). Cada producto debe tener un código único.`,
        );
      }

      seenCodes.set(normalizedCode, rowNum);

      products.push({
        code,
        name: name || code,
        description,
        price,
        observations,
        rowNumber: rowNum,
      });
    }

    if (products.length === 0) {
      throw new BadRequestException(
        'No se encontraron productos con datos válidos en la tabla del catálogo.',
      );
    }

    return {
      products,
      total: products.length,
      headers: foundHeaders,
    };
  }

  async getProducts(companyId: string): Promise<Product[]> {
    return this.productRepository.find({
      where: { companyId },
      order: { code: 'ASC' },
    });
  }

  async generateTemplateBuffer(): Promise<Buffer> {
    // @ts-ignore
    const JSZip = require('jszip');
    const zip = new JSZip();

    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    );

    zip.file(
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    );

    zip.folder('word').folder('_rels').file(
      'document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`,
    );

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
        <w:t>PLANTILLA OFICIAL DE CATÁLOGO DE PRODUCTOS</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:rPr><w:i/><w:color w:val="666666"/></w:rPr>
        <w:t>Instrucciones: Escribe tus productos en las filas vacías de la tabla. No modifiques los nombres de las 5 columnas en la primera fila. El campo "Código" es obligatorio y debe ser único para cada producto.</w:t>
      </w:r>
    </w:p>
    <w:p/>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="5000" w:type="pct"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="6" w:space="0" w:color="CCCCCC"/>
          <w:left w:val="single" w:sz="6" w:space="0" w:color="CCCCCC"/>
          <w:bottom w:val="single" w:sz="6" w:space="0" w:color="CCCCCC"/>
          <w:right w:val="single" w:sz="6" w:space="0" w:color="CCCCCC"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E0E0E0"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E0E0E0"/>
        </w:tblBorders>
      </w:tblPr>
      
      <!-- Fila de Encabezados Obligatorios -->
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Código</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Nombre / Producto</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Descripción</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Precio</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Observaciones</w:t></w:r></w:p></w:tc>
      </w:tr>

      <!-- Filas vacías con espacio listo para llenar -->
      <w:tr>
        <w:tc><w:p/></w:tc>
        <w:tc><w:p/></w:tc>
        <w:tc><w:p/></w:tc>
        <w:tc><w:p/></w:tc>
        <w:tc><w:p/></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p/></w:tc>
        <w:tc><w:p/></w:tc>
        <w:tc><w:p/></w:tc>
        <w:tc><w:p/></w:tc>
        <w:tc><w:p/></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p/></w:tc>
        <w:tc><w:p/></w:tc>
        <w:tc><w:p/></w:tc>
        <w:tc><w:p/></w:tc>
        <w:tc><w:p/></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p/></w:tc>
        <w:tc><w:p/></w:tc>
        <w:tc><w:p/></w:tc>
        <w:tc><w:p/></w:tc>
        <w:tc><w:p/></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p/></w:tc>
        <w:tc><w:p/></w:tc>
        <w:tc><w:p/></w:tc>
        <w:tc><w:p/></w:tc>
        <w:tc><w:p/></w:tc>
      </w:tr>
    </w:tbl>
    <w:p/>
  </w:body>
</w:document>`;

    zip.folder('word').file('document.xml', documentXml);
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }

  async compareWithExisting(
    companyId: string,
    parsedProducts: ParsedProduct[],
  ): Promise<{
    toAdd: number;
    toUpdate: number;
    missing: Product[];
    existingCodes: string[];
  }> {
    const existingProducts = await this.productRepository.find({
      where: { companyId },
      order: { code: 'ASC' },
    });

    const existingByCode = new Map<string, Product>();
    for (const p of existingProducts) {
      existingByCode.set(p.code.trim().toUpperCase(), p);
    }

    let toAdd = 0;
    let toUpdate = 0;
    const seenIds = new Set<string>();
    const existingCodesList: string[] = [];

    for (const p of parsedProducts) {
      const codeUpper = p.code.trim().toUpperCase();
      const existing = existingByCode.get(codeUpper);
      if (existing) {
        toUpdate++;
        seenIds.add(existing.id);
        existingCodesList.push(existing.code);
      } else {
        toAdd++;
      }
    }

    const missing = existingProducts.filter((p) => !seenIds.has(p.id));

    return {
      toAdd,
      toUpdate,
      missing,
      existingCodes: existingCodesList,
    };
  }

  async syncProducts(
    companyId: string,
    parsedProducts: ParsedProduct[],
  ): Promise<{
    added: number;
    updated: number;
    missing: Product[];
    total: number;
    products: Product[];
  }> {
    const existingProducts = await this.productRepository.find({
      where: { companyId },
    });

    const existingByCode = new Map<string, Product>();
    for (const p of existingProducts) {
      existingByCode.set(p.code.trim().toUpperCase(), p);
    }

    let added = 0;
    let updated = 0;
    const seenIds = new Set<string>();

    for (const item of parsedProducts) {
      const codeUpper = item.code.trim().toUpperCase();
      let product = existingByCode.get(codeUpper);

      if (product) {
        // Tarea 4: Si el código ya existe, actualiza precios, nombres o descripciones modificadas,
        // manteniendo intactas las fotos y el estado que ya tenía ese producto.
        product.name = item.name;
        product.description = item.description;
        product.price = item.price;
        product.observations = item.observations;
        // isAvailable e images se conservan exactamente como están
        await this.productRepository.save(product);
        seenIds.add(product.id);
        updated++;
      } else {
        // Tarea 4: Si el código es nuevo, crea la tarjeta del producto lista para fotos
        product = this.productRepository.create({
          companyId,
          code: item.code.trim(),
          name: item.name,
          description: item.description,
          price: item.price,
          observations: item.observations,
          isAvailable: true,
          images: [],
        });
        await this.productRepository.save(product);
        added++;
      }
    }

    // Tarea 4: Si un producto que existía previamente NO viene en el nuevo Word, el sistema NO lo borra.
    // Lo identificamos para que el usuario decida si ya no está disponible o sigue disponible.
    const missingProducts = existingProducts.filter((p) => !seenIds.has(p.id));

    const all = await this.getProducts(companyId);
    return {
      added,
      updated,
      missing: missingProducts,
      total: all.length,
      products: all,
    };
  }

  async batchSetAvailability(
    companyId: string,
    updates: { id: string; isAvailable: boolean }[],
  ): Promise<{ updatedCount: number }> {
    let updatedCount = 0;
    for (const item of updates) {
      const product = await this.productRepository.findOne({
        where: { id: item.id, companyId },
      });
      if (product) {
        product.isAvailable = Boolean(item.isAvailable);
        await this.productRepository.save(product);
        updatedCount++;
      }
    }
    return { updatedCount };
  }

  async toggleAvailability(
    companyId: string,
    productId: string,
    isAvailable: boolean,
  ): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id: productId, companyId },
    });
    if (!product) {
      throw new BadRequestException('Producto no encontrado.');
    }
    product.isAvailable = isAvailable;
    return this.productRepository.save(product);
  }

  private extractTablesFromHtml(html: string): string[][][] {
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;

    const tables: string[][][] = [];
    let tableMatch;

    while ((tableMatch = tableRegex.exec(html)) !== null) {
      const tableContent = tableMatch[1];
      const rows: string[][] = [];
      let trMatch;

      while ((trMatch = trRegex.exec(tableContent)) !== null) {
        const rowContent = trMatch[1];
        const cells: string[] = [];
        let cellMatch;

        while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
          let cellText = cellMatch[1]
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, ' ')
            .trim();
          cells.push(cellText);
        }

        if (cells.length > 0) {
          rows.push(cells);
        }
      }

      if (rows.length > 0) {
        tables.push(rows);
      }
    }

    return tables;
  }

  private matchColumns(headerRow: string[]) {
    let codeIndex = -1;
    let nameIndex = -1;
    let descIndex = -1;
    let priceIndex = -1;
    let obsIndex = -1;

    headerRow.forEach((col, index) => {
      const norm = col
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');

      if (norm.startsWith('cod') || norm === 'codigo' || norm === 'id') {
        if (codeIndex === -1) codeIndex = index;
      } else if (norm.includes('nom') || norm.includes('prod') || norm === 'articulo') {
        if (nameIndex === -1) nameIndex = index;
      } else if (norm.includes('desc') || norm.includes('detalle')) {
        if (descIndex === -1) descIndex = index;
      } else if (norm.includes('prec') || norm.includes('valor') || norm.includes('costo')) {
        if (priceIndex === -1) priceIndex = index;
      } else if (norm.includes('obs') || norm.includes('nota')) {
        if (obsIndex === -1) obsIndex = index;
      }
    });

    if (
      codeIndex !== -1 &&
      nameIndex !== -1 &&
      descIndex !== -1 &&
      priceIndex !== -1 &&
      obsIndex !== -1
    ) {
      return { codeIndex, nameIndex, descIndex, priceIndex, obsIndex };
    }

    return null;
  }

  async addProductImage(
    companyId: string,
    productId: string,
    filename: string,
    base64Data: string,
  ): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id: productId, companyId },
    });
    if (!product) {
      throw new BadRequestException('Producto no encontrado.');
    }

    const currentImages = Array.isArray(product.images) ? product.images : [];
    if (currentImages.length >= 4) {
      throw new BadRequestException('Cada producto puede tener un máximo de 4 fotografías.');
    }

    const ext = path.extname(filename || '').toLowerCase() || '.jpg';
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      throw new BadRequestException('Formato no compatible. Por favor sube imágenes en formato JPG, PNG o WEBP.');
    }

    const cleanBase64 = base64Data.includes(';base64,')
      ? base64Data.split(';base64,').pop()!
      : base64Data;
    const buffer = Buffer.from(cleanBase64, 'base64');

    const uniqueName = `prod_${product.code}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`;
    const filePath = path.join(this.productUploadsDir, uniqueName);
    fs.writeFileSync(filePath, buffer);

    const imageUrl = `/uploads/products/${uniqueName}`;
    product.images = [...currentImages, imageUrl];
    return this.productRepository.save(product);
  }

  async removeProductImage(
    companyId: string,
    productId: string,
    imageUrl: string,
  ): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id: productId, companyId },
    });
    if (!product) {
      throw new BadRequestException('Producto no encontrado.');
    }

    const currentImages = Array.isArray(product.images) ? product.images : [];
    product.images = currentImages.filter((img) => img !== imageUrl);

    try {
      const filename = path.basename(imageUrl);
      const filePath = path.join(this.productUploadsDir, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e: any) {
      this.logger.warn(`No se pudo eliminar el archivo físico: ${e?.message}`);
    }

    return this.productRepository.save(product);
  }

  async deleteProduct(companyId: string, productId: string): Promise<void> {
    const product = await this.productRepository.findOne({
      where: { id: productId, companyId },
    });
    if (!product) {
      throw new BadRequestException('Producto no encontrado.');
    }

    if (Array.isArray(product.images)) {
      for (const imgUrl of product.images) {
        try {
          const filename = path.basename(imgUrl);
          const filePath = path.join(this.productUploadsDir, filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (e: any) {}
      }
    }

    await this.productRepository.delete({ id: productId, companyId });
  }
}

