import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
// @ts-ignore
import * as mammoth from 'mammoth';
// @ts-ignore
import * as TurndownService from 'turndown';

@Injectable()
export class LibraryService {
  private readonly logger = new Logger('LibraryService');
  public readonly knowledgeDir: string;
  private readonly turndownService: any;

  constructor() {
    this.knowledgeDir = process.env.KNOWLEDGE_DIR
      ? path.resolve(process.env.KNOWLEDGE_DIR)
      : path.resolve(process.cwd(), '..', 'knowledge');

    if (!fs.existsSync(this.knowledgeDir)) {
      fs.mkdirSync(this.knowledgeDir, { recursive: true });
    }

    this.turndownService = new (TurndownService as any)({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '_',
    });

    this.turndownService.remove(['script', 'style', 'title']);
  }

  async convertToMarkdown(buffer: Buffer, originalFilename: string): Promise<string> {
    const ext = path.extname(originalFilename || '').toLowerCase();

    if (ext === '.docx') {
      const result = await mammoth.convertToHtml({ buffer });
      const html = result.value || '';
      let markdown = this.turndownService.turndown(html);

      markdown = markdown
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      return markdown;
    } else if (ext === '.txt' || ext === '.md') {
      return buffer.toString('utf8').replace(/\r\n/g, '\n').trim();
    } else {
      throw new Error(`El formato "${ext}" no es compatible. Por favor sube archivos Word (.docx), Markdown (.md) o texto (.txt)`);
    }
  }

  saveMarkdownFile(id: string, markdownContent: string) {
    const filePath = path.join(this.knowledgeDir, `${id}.md`);
    fs.writeFileSync(filePath, markdownContent, 'utf8');
  }

  getMarkdownContent(id: string): string {
    const filePath = path.join(this.knowledgeDir, `${id}.md`);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8');
    }
    return '';
  }

  deleteMarkdownFile(id: string) {
    const filePath = path.join(this.knowledgeDir, `${id}.md`);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e: any) {
        this.logger.error(`Error eliminando archivo ${filePath}: ${e?.message}`);
      }
    }
  }

  calculateStats(text: string) {
    const clean = (text || '').trim();
    const words = clean ? clean.split(/\s+/).filter(Boolean).length : 0;
    return {
      wordCount: words,
      charCount: clean.length,
    };
  }

  getActiveLibraryContext(documents: any[] = []) {
    const activeDocs = documents.filter((d) => d.active !== false);
    if (!activeDocs.length) {
      return { contextText: '', activeCount: 0, totalWords: 0 };
    }

    let combinedText = '';
    let totalWords = 0;

    for (const doc of activeDocs) {
      const content = this.getMarkdownContent(doc.id);
      if (content.trim()) {
        combinedText += `\n\n--- DOCUMENTO: ${doc.name || doc.originalFilename} ---\n${content.trim()}`;
        totalWords += doc.wordCount || 0;
      }
    }

    return {
      contextText: combinedText.trim(),
      activeCount: activeDocs.length,
      totalWords,
    };
  }
}

