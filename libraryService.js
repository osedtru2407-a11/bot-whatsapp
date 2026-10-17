'use strict';

const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const TurndownService = require('turndown');

const KNOWLEDGE_DIR = path.join(__dirname, 'knowledge');

// Asegurar directorio de conocimiento
if (!fs.existsSync(KNOWLEDGE_DIR)) {
    fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
}

// Configurar Turndown para generar un Markdown limpio y estructurado
const turndownService = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '_'
});

// Reglas adicionales para limpiar etiquetas vacías o ruido de Word
turndownService.remove(['script', 'style', 'title']);

/**
 * Convierte un buffer de archivo Word (.docx) o texto a Markdown limpio
 * @param {Buffer} buffer - Buffer del archivo
 * @param {string} originalFilename - Nombre original del archivo
 * @returns {Promise<string>}
 */
async function convertToMarkdown(buffer, originalFilename) {
    const ext = path.extname(originalFilename || '').toLowerCase();

    if (ext === '.docx') {
        const result = await mammoth.convertToHtml({ buffer });
        let html = result.value || '';
        
        // Convertir HTML limpio a Markdown
        let markdown = turndownService.turndown(html);

        // Limpiar saltos de línea excesivos y espacios residuales
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

/**
 * Guarda el contenido Markdown en disco y genera la metadata
 */
function saveMarkdownFile(id, markdownContent) {
    const filePath = path.join(KNOWLEDGE_DIR, `${id}.md`);
    fs.writeFileSync(filePath, markdownContent, 'utf8');
}

/**
 * Obtiene el contenido Markdown de un documento
 */
function getMarkdownContent(id) {
    const filePath = path.join(KNOWLEDGE_DIR, `${id}.md`);
    if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8');
    }
    return '';
}

/**
 * Elimina el archivo Markdown de disco
 */
function deleteMarkdownFile(id) {
    const filePath = path.join(KNOWLEDGE_DIR, `${id}.md`);
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch (e) {
            console.error(`Error eliminando archivo ${filePath}:`, e);
        }
    }
}

/**
 * Calcula palabras y caracteres de un texto
 */
function calculateStats(text) {
    const clean = (text || '').trim();
    const words = clean ? clean.split(/\s+/).filter(Boolean).length : 0;
    return {
        wordCount: words,
        charCount: clean.length
    };
}

/**
 * Construye el bloque consolidado de contexto para Gemini con todos los documentos activos
 * @param {Array} libraryList - Lista de documentos en appData.library
 * @returns {{ contextText: string, activeCount: number, totalWords: number }}
 */
function getActiveLibraryContext(libraryList = []) {
    const activeDocs = libraryList.filter(doc => doc.active !== false);
    if (!activeDocs.length) {
        return { contextText: '', activeCount: 0, totalWords: 0 };
    }

    let combined = [];
    let totalWords = 0;

    for (const doc of activeDocs) {
        const content = getMarkdownContent(doc.id);
        if (content && content.trim()) {
            const stats = calculateStats(content);
            totalWords += stats.wordCount;
            combined.push(`### DOCUMENTO: ${doc.name || doc.originalFilename}\n${content}`);
        }
    }

    return {
        contextText: combined.join('\n\n---\n\n'),
        activeCount: activeDocs.length,
        totalWords
    };
}

module.exports = {
    convertToMarkdown,
    saveMarkdownFile,
    getMarkdownContent,
    deleteMarkdownFile,
    calculateStats,
    getActiveLibraryContext
};
