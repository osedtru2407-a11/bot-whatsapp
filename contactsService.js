'use strict';

/**
 * contactsService.js
 * Servicio para parsear CSVs de Google Contacts, normalizar números telefónicos
 * y gestionar la importación y segmentación de prospectos.
 */

/**
 * Parsea un archivo CSV respetando comillas, saltos de línea y delimitadores (, o ;)
 */
function parseCsvRows(text) {
    if (!text) return [];
    // Eliminar BOM de UTF-8 si existe
    const cleanText = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Detectar si el delimitador principal es punto y coma o coma
    const firstLine = cleanText.split('\n')[0] || '';
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semiCount = (firstLine.match(/;/g) || []).length;
    const delimiter = semiCount > commaCount ? ';' : ',';

    const rows = [];
    let currentRow = [];
    let currentField = '';
    let insideQuotes = false;

    for (let i = 0; i < cleanText.length; i++) {
        const char = cleanText[i];
        const nextChar = cleanText[i + 1];

        if (char === '"') {
            if (insideQuotes && nextChar === '"') {
                currentField += '"';
                i++; // Saltear comilla escapada
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (char === delimiter && !insideQuotes) {
            currentRow.push(currentField.trim());
            currentField = '';
        } else if (char === '\n' && !insideQuotes) {
            currentRow.push(currentField.trim());
            if (currentRow.some(f => f.length > 0)) {
                rows.push(currentRow);
            }
            currentRow = [];
            currentField = '';
        } else {
            currentField += char;
        }
    }

    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.some(f => f.length > 0)) {
            rows.push(currentRow);
        }
    }

    return rows;
}

/**
 * Normaliza y limpia un número telefónico
 */
function normalizePhoneNumber(raw, defaultPrefix = '57') {
    if (!raw) return null;
    let digits = String(raw).replace(/\D/g, '');
    if (!digits) return null;

    // Si comienza con 00, reemplazar por nada
    if (digits.startsWith('00')) digits = digits.slice(2);

    // Si tiene 10 dígitos y empieza por 3 (celular en Colombia) y el prefijo es 57, agregar 57
    if (digits.length === 10 && digits.startsWith('3') && defaultPrefix === '57') {
        digits = '57' + digits;
    } else if (digits.length <= 10 && defaultPrefix && !digits.startsWith(defaultPrefix)) {
        digits = defaultPrefix + digits;
    }

    // Un número de WhatsApp válido tiene entre 9 y 15 dígitos
    if (digits.length < 9 || digits.length > 16) {
        return null;
    }

    return digits;
}

/**
 * Parsea el contenido CSV de Google Contacts o estándar
 */
function parseGoogleContactsCsv(csvContent, options = {}) {
    const { defaultPrefix = '57', defaultTag = 'Importado Google' } = options;
    const rows = parseCsvRows(csvContent);
    if (rows.length < 2) {
        throw new Error('El archivo CSV está vacío o no contiene filas de datos.');
    }

    const headers = rows[0].map(h => h.toLowerCase().trim());

    // Identificar índices de columnas clave
    const nameIdx = headers.findIndex(h => h === 'name' || h === 'nombre');
    const givenNameIdx = headers.findIndex(h => h === 'given name' || h === 'first name' || h === 'primer nombre');
    const familyNameIdx = headers.findIndex(h => h === 'family name' || h === 'last name' || h === 'apellidos' || h === 'apellido');
    const groupMembershipIdx = headers.findIndex(h => h === 'group membership' || h === 'grupos' || h === 'grupo');

    // Identificar todas las columnas que puedan contener teléfonos
    const phoneIndices = [];
    headers.forEach((h, idx) => {
        if (
            h.includes('phone') ||
            h.includes('teléfono') ||
            h.includes('telefono') ||
            h.includes('celular') ||
            h.includes('móvil') ||
            h.includes('movil')
        ) {
            // Evitar columnas como "Phone 1 - Type" si hay una con Value
            if (!h.includes('type') && !h.includes('tipo')) {
                phoneIndices.push(idx);
            }
        }
    });

    // Si no encontró columnas con palabra phone o teléfono, buscar columnas con números en las primeras filas
    if (phoneIndices.length === 0) {
        for (let col = 0; col < headers.length; col++) {
            const sampleVal = (rows[1] && rows[1][col]) || '';
            const digitsOnly = sampleVal.replace(/\D/g, '');
            if (digitsOnly.length >= 8 && digitsOnly.length <= 15) {
                phoneIndices.push(col);
                break;
            }
        }
    }

    if (phoneIndices.length === 0) {
        throw new Error('No se encontró ninguna columna de teléfono en el archivo CSV. Asegúrate de exportar tus contactos de Google con números de teléfono.');
    }

    const contacts = [];
    const seenPhones = new Set();
    let invalidCount = 0;

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        // Determinar nombre
        let fullName = '';
        if (nameIdx !== -1 && row[nameIdx]) {
            fullName = row[nameIdx];
        } else {
            const given = givenNameIdx !== -1 ? (row[givenNameIdx] || '') : '';
            const family = familyNameIdx !== -1 ? (row[familyNameIdx] || '') : '';
            fullName = `${given} ${family}`.trim();
        }

        // Determinar grupos / etiquetas
        let rowTags = [];
        if (groupMembershipIdx !== -1 && row[groupMembershipIdx]) {
            const rawGroups = row[groupMembershipIdx]
                .split(/:::|;|,/)
                .map(g => g.replace(/^\*/, '').trim())
                .filter(g => g && g !== 'myContacts' && g !== 'Importado');
            rowTags.push(...rawGroups);
        }
        if (defaultTag && !rowTags.includes(defaultTag)) {
            rowTags.unshift(defaultTag);
        }

        // Extraer teléfonos
        let primaryPhone = null;
        for (const pIdx of phoneIndices) {
            const rawVal = row[pIdx];
            if (rawVal) {
                // Podría haber múltiples teléfonos separados por ::: o comas
                const parts = String(rawVal).split(/:::|;/);
                for (const part of parts) {
                    const clean = normalizePhoneNumber(part, defaultPrefix);
                    if (clean && !seenPhones.has(clean)) {
                        primaryPhone = clean;
                        break;
                    }
                }
            }
            if (primaryPhone) break;
        }

        if (primaryPhone) {
            seenPhones.add(primaryPhone);
            contacts.push({
                phone: primaryPhone,
                name: fullName || primaryPhone,
                tag: rowTags[0] || defaultTag || 'Nuevo',
                groups: rowTags
            });
        } else {
            invalidCount++;
        }
    }

    return {
        contacts,
        totalParsed: contacts.length,
        invalidCount
    };
}

module.exports = {
    parseCsvRows,
    normalizePhoneNumber,
    parseGoogleContactsCsv
};

