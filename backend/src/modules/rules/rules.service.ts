import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rule } from '../../entities/rule.entity';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

@Injectable()
export class RulesService {
  private readonly simulatorLastSentRuleId = new Map<string, string | null>();

  constructor(
    @InjectRepository(Rule)
    private readonly ruleRepository: Repository<Rule>,
  ) {}

  async getRules(companyId: string): Promise<Rule[]> {
    return this.ruleRepository.find({
      where: { companyId },
      order: { createdAt: 'ASC' },
    });
  }

  async createRule(companyId: string, dto: CreateRuleDto): Promise<Rule> {
    const id = 'rule_' + Date.now();
    const rule = this.ruleRepository.create({
      id,
      companyId,
      name: dto.name,
      enabled: dto.enabled !== false,
      parentRuleId: dto.parentRuleId || null,
      triggerType: dto.triggerType || 'text',
      matchType: dto.matchType,
      triggers: dto.triggers || [],
      response: dto.response,
      media: dto.media || null,
      leadTag: dto.leadTag || null,
      pauseBot: Boolean(dto.pauseBot),
      mediaTypeFilter: dto.mediaTypeFilter || 'any',
    });

    return this.ruleRepository.save(rule);
  }

  async updateRule(companyId: string, ruleId: string, dto: UpdateRuleDto): Promise<Rule> {
    const rule = await this.ruleRepository.findOne({ where: { id: ruleId, companyId } });
    if (!rule) {
      throw new NotFoundException('Regla no encontrada');
    }

    Object.assign(rule, dto);
    return this.ruleRepository.save(rule);
  }

  async deleteRule(companyId: string, ruleId: string): Promise<{ success: boolean }> {
    const rule = await this.ruleRepository.findOne({ where: { id: ruleId, companyId } });
    if (!rule) {
      throw new NotFoundException('Regla no encontrada');
    }

    await this.ruleRepository.delete(ruleId);
    return { success: true };
  }

  // =========================================================================
  // MOTOR DE COINCIDENCIA DE REGLAS (ALGORITMO OPTIMIZADO)
  // =========================================================================

  escapeRegExp(str: string): string {
    return (str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  normalizeAccents(str: string): string {
    return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  checkTriggerMatch(text: string, trigger: string, matchType: string = 'contains_any', context: any = {}, rule: any = {}): boolean {
    const rawText = (text || '').trim();
    const rawTrigger = (trigger || '').trim();
    if (!rawText || !rawTrigger) return false;

    const lowerText = rawText.toLowerCase().replace(/\s+/g, ' ');
    const lowerTrigger = rawTrigger.toLowerCase().replace(/\s+/g, ' ');

    // Caso 1: El trigger es un número puro (ej: '1', '2', '3') en un menú de opciones
    const isNumericTrigger = /^\d+$/.test(lowerTrigger);
    if (isNumericTrigger) {
      const requiredParentId = rule.parentRuleId || 'rule-welcome';
      if (!context || context.lastSentRuleId !== requiredParentId) {
        return false;
      }

      const cleanNoEmojis = lowerText.replace(/[\uFE0F\u20E3]/g, '');
      const cleanNoPunct = cleanNoEmojis.replace(/^[#\s([<]+|[.\s!?:)\]>]+$/g, '');
      if (cleanNoPunct === lowerTrigger) return true;

      const escaped = this.escapeRegExp(lowerTrigger);
      const menuOptionRegex = new RegExp(
        '^(?:(?:hola|buenas|por\\s+favor)?\\s*(?:opci[oó]n|n[uú]mero|num|n°|no\\.?|item|el|la)?\\s*#?\\s*)' +
          escaped +
          '[.\\s!?:)]*$',
        'iu',
      );
      if (menuOptionRegex.test(cleanNoEmojis)) return true;
      return false;
    }

    // Caso 2: Palabras clave de texto
    const normText = this.normalizeAccents(lowerText);
    const normTrigger = this.normalizeAccents(lowerTrigger);

    if (matchType === 'exact') {
      const cleanNoPunct = normText.replace(/^[¿¡!?,.:;\s]+|[¿¡!?,.:;\s]+$/g, '');
      return cleanNoPunct === normTrigger;
    }

    if (matchType === 'starts_with') {
      const escaped = this.escapeRegExp(normTrigger);
      const startsRegex = new RegExp('^(?:[¿¡!?,.:;\\s]*)(?:' + escaped + ')(?:(?![\\p{L}\\p{N}])|$)', 'iu');
      return startsRegex.test(normText);
    }

    // Match contiene palabra (contains_any)
    const escaped = this.escapeRegExp(normTrigger);
    const wordBoundaryRegex = new RegExp('(?<![\\p{L}\\p{N}])' + escaped + '(?![\\p{L}\\p{N}])', 'iu');
    return wordBoundaryRegex.test(normText);
  }

  matchRule(
    text: string,
    rules: Rule[],
    hasMedia: boolean = false,
    mediaMimetype: string = '',
    context: any = {},
  ): Rule | null {
    const activeRules = rules.filter((r) => r.enabled !== false);
    const isAudioMedia = mediaMimetype.startsWith('audio/') || mediaMimetype.includes('ogg');
    const lastSentRuleId = context.lastSentRuleId || null;

    // Prioridad 1: Submenús contextuales cuyo parentRuleId coincide con el último menú enviado
    // Prioridad 2: Reglas globales
    const sortedRules = [...activeRules].sort((a, b) => {
      const aMatches = Boolean(a.parentRuleId && a.parentRuleId === lastSentRuleId);
      const bMatches = Boolean(b.parentRuleId && b.parentRuleId === lastSentRuleId);
      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;
      return 0;
    });

    for (const rule of sortedRules) {
      const triggerType = rule.triggerType || 'text';

      // A. Coincidencia por archivo adjunto
      if (hasMedia && (triggerType === 'media' || triggerType === 'both' || rule.matchType === 'on_media')) {
        const filter = rule.mediaTypeFilter || 'any';
        let mediaMatches = false;

        if (filter === 'any') {
          if (!isAudioMedia) mediaMatches = true;
        } else if (filter === 'image' && mediaMimetype.startsWith('image/')) {
          mediaMatches = true;
        } else if (
          filter === 'document' &&
          (mediaMimetype.includes('pdf') ||
            mediaMimetype.includes('document') ||
            mediaMimetype.includes('sheet') ||
            mediaMimetype.includes('msword') ||
            mediaMimetype.includes('text') ||
            mediaMimetype.includes('octet-stream'))
        ) {
          mediaMatches = true;
        } else if (filter === 'audio' && isAudioMedia) {
          mediaMatches = true;
        }

        if (mediaMatches) {
          const triggers = (rule.triggers || []).map((t) => t.trim().toLowerCase()).filter(Boolean);
          if (!triggers.length || !text) return rule;
          const matchType = rule.matchType || 'contains_any';
          if (triggers.some((t) => this.checkTriggerMatch(text, t, matchType, context, rule))) {
            return rule;
          }
          if (triggerType === 'media' || rule.matchType === 'on_media') {
            return rule;
          }
        }
      }

      // B. Coincidencia por texto / palabras clave
      if (text && (triggerType === 'text' || triggerType === 'both' || !rule.triggerType)) {
        const triggers = (rule.triggers || []).map((t) => t.trim().toLowerCase()).filter(Boolean);
        if (!triggers.length) continue;

        const matchType = rule.matchType || 'contains_any';
        if (triggers.some((t) => this.checkTriggerMatch(text, t, matchType, context, rule))) {
          return rule;
        }
      }
    }

    return null;
  }

  async simulate(
    companyId: string,
    rawText: string,
    hasMedia: boolean = false,
    mediaMimetype: string = '',
    audio?: any,
  ) {
    const text = (rawText || '').trim().toLowerCase();
    const isAudioSim = Boolean(
      audio || (mediaMimetype && (mediaMimetype.startsWith('audio/') || mediaMimetype.includes('ogg'))),
    );

    const rules = await this.getRules(companyId);
    const currentLastSent = this.simulatorLastSentRuleId.get(companyId) || null;
    const context = { lastSentRuleId: currentLastSent };

    const matched = this.matchRule(
      text,
      rules,
      hasMedia || isAudioSim,
      mediaMimetype || (isAudioSim ? 'audio/ogg' : ''),
      context,
    );

    if (matched) {
      this.simulatorLastSentRuleId.set(companyId, matched.id);
      return {
        matched: true,
        ruleName: matched.name,
        response: matched.response,
        media: matched.media,
        leadTag: matched.leadTag,
        pauseBot: matched.pauseBot,
      };
    }

    return {
      matched: false,
      response: 'Sin coincidencia. El bot enviaría el mensaje de fallback o consultaría con Gemini IA.',
    };
  }
}

