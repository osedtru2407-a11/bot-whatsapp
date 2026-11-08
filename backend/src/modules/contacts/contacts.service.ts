import { Injectable, BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact } from '../../entities/contact.entity';
import { ContactGroup } from '../../entities/contact-group.entity';
import { LeadGroupMember } from '../../entities/lead-group-member.entity';
import { Lead } from '../../entities/lead.entity';
import { WhatsAppManagerService } from '../whatsapp/whatsapp-manager.service';

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(ContactGroup)
    private readonly groupRepository: Repository<ContactGroup>,
    @InjectRepository(LeadGroupMember)
    private readonly groupMemberRepository: Repository<LeadGroupMember>,
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    private readonly whatsappManager: WhatsAppManagerService,
  ) {}

  // =========================================================================
  // PARSER DE CSV Y NORMALIZADOR DE TELÉFONOS
  // =========================================================================

  parseCsvRows(text: string): string[][] {
    if (!text) return [];
    const cleanText = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const firstLine = cleanText.split('\n')[0] || '';
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semiCount = (firstLine.match(/;/g) || []).length;
    const delimiter = semiCount > commaCount ? ';' : ',';

    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let insideQuotes = false;

    for (let i = 0; i < cleanText.length; i++) {
      const char = cleanText[i];
      const nextChar = cleanText[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          currentField += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === delimiter && !insideQuotes) {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n' && !insideQuotes) {
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) {
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
      if (currentRow.some((f) => f.length > 0)) {
        rows.push(currentRow);
      }
    }

    return rows;
  }

  normalizePhoneNumber(raw: string, defaultPrefix: string = '57'): string | null {
    if (!raw) return null;
    let digits = String(raw).replace(/\D/g, '');
    if (!digits) return null;

    if (digits.startsWith('00')) digits = digits.slice(2);

    if (digits.length === 10 && digits.startsWith('3') && defaultPrefix === '57') {
      digits = '57' + digits;
    } else if (digits.length <= 10 && defaultPrefix && !digits.startsWith(defaultPrefix)) {
      digits = defaultPrefix + digits;
    }

    if (digits.length < 9 || digits.length > 16) {
      return null;
    }

    return digits;
  }

  parseGoogleContactsCsv(csvContent: string, options: { defaultPrefix?: string; defaultTag?: string } = {}) {
    const defaultPrefix = options.defaultPrefix || '57';
    const defaultTag = options.defaultTag || 'Importado Google';
    const rows = this.parseCsvRows(csvContent);
    if (rows.length < 2) {
      throw new BadRequestException('El archivo CSV está vacío o no contiene filas de datos.');
    }

    const headers = rows[0].map((h) => h.toLowerCase().trim());
    const nameIdx = headers.findIndex((h) => h === 'name' || h === 'nombre');
    const givenNameIdx = headers.findIndex((h) => h === 'given name' || h === 'first name' || h === 'primer nombre');
    const familyNameIdx = headers.findIndex((h) => h === 'family name' || h === 'last name' || h === 'apellidos');
    const groupMembershipIdx = headers.findIndex((h) => h === 'group membership' || h === 'grupos' || h === 'grupo');

    const phoneIndices: number[] = [];
    headers.forEach((h, idx) => {
      if (
        (h.includes('phone') || h.includes('teléfono') || h.includes('telefono') || h.includes('celular') || h.includes('móvil')) &&
        !h.includes('type') &&
        !h.includes('tipo')
      ) {
        phoneIndices.push(idx);
      }
    });

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
      throw new BadRequestException('No se encontró ninguna columna de teléfono en el archivo CSV.');
    }

    const contacts: any[] = [];
    const seenPhones = new Set<string>();
    let invalidCount = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      let fullName = '';
      if (nameIdx !== -1 && row[nameIdx]) {
        fullName = row[nameIdx];
      } else {
        const given = givenNameIdx !== -1 ? row[givenNameIdx] || '' : '';
        const family = familyNameIdx !== -1 ? row[familyNameIdx] || '' : '';
        fullName = `${given} ${family}`.trim();
      }

      let rowTags: string[] = [];
      if (groupMembershipIdx !== -1 && row[groupMembershipIdx]) {
        const rawGroups = row[groupMembershipIdx]
          .split(/:::|;|,/)
          .map((g) => g.replace(/^\*/, '').trim())
          .filter((g) => g && g !== 'myContacts' && g !== 'Importado');
        rowTags.push(...rawGroups);
      }
      if (defaultTag && !rowTags.includes(defaultTag)) {
        rowTags.unshift(defaultTag);
      }

      let primaryPhone: string | null = null;
      for (const pIdx of phoneIndices) {
        const rawVal = row[pIdx];
        if (rawVal) {
          const parts = String(rawVal).split(/:::|;/);
          for (const part of parts) {
            const clean = this.normalizePhoneNumber(part, defaultPrefix);
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
          groups: rowTags,
        });
      } else {
        invalidCount++;
      }
    }

    return { contacts, totalParsed: contacts.length, invalidCount };
  }

  // =========================================================================
  // AGENDA DE CONTACTOS
  // =========================================================================

  async getContacts(companyId: string): Promise<Contact[]> {
    return this.contactRepository.find({
      where: { companyId },
      order: { name: 'ASC' },
    });
  }

  async saveContact(companyId: string, contactData: any): Promise<Contact> {
    const rawPhone = String(contactData.phone || '').trim();
    if (!rawPhone) {
      throw new BadRequestException('El teléfono es obligatorio');
    }

    const cleanPhone = rawPhone.replace(/\D/g, '') || rawPhone;
    let contact = await this.contactRepository.findOne({
      where: { companyId, phone: cleanPhone },
    });

    if (contact) {
      contact.name = contactData.name || contact.name;
      contact.source = contactData.source || contact.source;
      contact.tags = contactData.tags !== undefined ? contactData.tags : contact.tags;
      contact.notes = contactData.notes !== undefined ? contactData.notes : contact.notes;
    } else {
      contact = this.contactRepository.create({
        id: 'cnt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        companyId,
        phone: cleanPhone,
        name: contactData.name || cleanPhone,
        source: contactData.source || 'manual',
        tags: contactData.tags || '',
        notes: contactData.notes || '',
      });
    }

    return this.contactRepository.save(contact);
  }

  async deleteContact(companyId: string, phone: string): Promise<{ success: boolean }> {
    const cleanPhone = phone.replace(/\D/g, '') || phone;
    await this.contactRepository.delete({ companyId, phone: cleanPhone });
    return { success: true };
  }

  async importCsv(companyId: string, csv: string, defaultTag: string = 'Importado Google', defaultPrefix: string = '57', groupId?: string) {
    const parsed = this.parseGoogleContactsCsv(csv, { defaultPrefix, defaultTag });
    if (parsed.contacts.length === 0) {
      throw new BadRequestException('No se encontraron contactos válidos en el archivo.');
    }

    for (const c of parsed.contacts) {
      await this.saveContact(companyId, {
        phone: c.phone,
        name: c.name,
        source: 'google_csv',
        tags: defaultTag,
      });
    }

    if (groupId) {
      const phones = parsed.contacts.map((c) => c.phone);
      await this.addGroupMembers(companyId, groupId, phones);
    }

    return {
      success: true,
      importedCount: parsed.contacts.length,
      invalidCount: parsed.invalidCount,
    };
  }

  async syncWhatsAppContacts(companyId: string, defaultTag: string = 'Agenda WhatsApp', groupId?: string) {
    const holder = this.whatsappManager.getClientState(companyId);
    if (!holder || holder.status !== 'ready' || !holder.client) {
      throw new ServiceUnavailableException('El WhatsApp de la empresa no está conectado todavía. Escanea el código QR.');
    }

    const rawContacts = await holder.client.getContacts();
    const valid = (rawContacts || []).filter(
      (c: any) => c && c.isMyContact && c.isUser && !c.isGroup && c.number && c.number !== 'status' && !String(c.number).includes('@'),
    );

    if (valid.length === 0) {
      return { success: true, syncedCount: 0, message: 'No se encontraron contactos en la agenda.' };
    }

    for (const c of valid) {
      await this.saveContact(companyId, {
        phone: c.number,
        name: c.name || c.pushname || c.number,
        source: 'whatsapp',
        tags: defaultTag,
      });
    }

    if (groupId) {
      const phones = valid.map((c: any) => c.number);
      await this.addGroupMembers(companyId, groupId, phones);
    }

    return { success: true, syncedCount: valid.length };
  }

  // =========================================================================
  // GRUPOS PERSONALIZADOS DE DIFUSIÓN
  // =========================================================================

  async getGroups(companyId: string) {
    const groups = await this.groupRepository.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
    });

    return Promise.all(
      groups.map(async (g) => {
        const memberCount = await this.groupMemberRepository.count({
          where: { companyId, groupId: g.id },
        });
        return {
          id: g.id,
          name: g.name,
          description: g.description,
          color: g.color,
          memberCount,
          createdAt: g.createdAt,
        };
      }),
    );
  }

  async createGroup(companyId: string, groupData: { name: string; description?: string; color?: string }) {
    if (!groupData.name || !groupData.name.trim()) {
      throw new BadRequestException('El nombre del grupo es obligatorio.');
    }

    const group = this.groupRepository.create({
      id: 'grp_' + Date.now(),
      companyId,
      name: groupData.name.trim(),
      description: groupData.description ? groupData.description.trim() : '',
      color: groupData.color || '#38bdf8',
    });

    const saved = await this.groupRepository.save(group);
    return { ...saved, memberCount: 0 };
  }

  async deleteGroup(companyId: string, groupId: string) {
    await this.groupRepository.delete({ companyId, id: groupId });
    return { success: true };
  }

  async getGroupMembers(companyId: string, groupId: string) {
    const members = await this.groupMemberRepository.find({
      where: { companyId, groupId },
    });

    const phones = members.map((m) => m.leadPhone);
    const contacts = await this.contactRepository.find({ where: { companyId } });
    const leads = await this.leadRepository.find({ where: { companyId } });

    const memberDetails = phones.map((ph) => {
      const cleanDigits = ph.replace(/\D/g, '');
      const ct = contacts.find((c) => c.phone === ph || (cleanDigits && c.phone.replace(/\D/g, '') === cleanDigits));
      const ld = leads.find((l) => l.phone === ph || (cleanDigits && l.phone.replace(/\D/g, '') === cleanDigits));

      return {
        phone: ph,
        name: ct?.name || ld?.name || ph,
        tag: ct?.tags || ld?.tag || 'Sin etiqueta',
        source: ct ? (ct.source === 'whatsapp' ? 'WhatsApp' : 'Google CSV') : ld ? 'CRM Lead' : 'Directo',
      };
    });

    return { members: memberDetails, phones };
  }

  async addGroupMembers(companyId: string, groupId: string, phones: string[]) {
    if (!phones || !Array.isArray(phones) || phones.length === 0) {
      throw new BadRequestException('Lista de teléfonos requerida');
    }

    for (const ph of phones) {
      const clean = ph.replace(/\D/g, '') || ph;
      const exists = await this.groupMemberRepository.findOne({
        where: { companyId, groupId, leadPhone: clean },
      });
      if (!exists) {
        const item = this.groupMemberRepository.create({
          id: 'gm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          companyId,
          groupId,
          leadPhone: clean,
        });
        await this.groupMemberRepository.save(item);
      }
    }

    return { success: true, count: phones.length };
  }

  async removeGroupMember(companyId: string, groupId: string, phone: string) {
    const clean = phone.replace(/\D/g, '') || phone;
    await this.groupMemberRepository.delete({ companyId, groupId, leadPhone: clean });
    return { success: true };
  }
}

