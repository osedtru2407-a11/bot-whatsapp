'use strict';

const { pool } = require('./db');

/**
 * Carga todo el conjunto de datos multi-empresa desde PostgreSQL
 */
async function loadAllAppData() {
    // 1. Obtener empresas
    const compRes = await pool.query('SELECT * FROM companies ORDER BY created_at ASC');
    if (compRes.rows.length === 0) {
        return {
            activeCompanyId: 'default',
            companies: []
        };
    }

    const companies = [];

    for (const c of compRes.rows) {
        // Settings
        const setRes = await pool.query('SELECT * FROM company_settings WHERE company_id = $1', [c.id]);
        const s = setRes.rows[0] || {};
        const settings = {
            businessName: s.business_name || c.name,
            botEnabled: s.bot_enabled !== false,
            simulateTyping: s.simulate_typing !== false,
            typingDelaySeconds: s.typing_delay_seconds || 2,
            ignoreGroups: s.ignore_groups !== false,
            fallbackMessage: s.fallback_message || `¡Hola! Gracias por comunicarte con ${c.name}.`,
            geminiEnabled: s.gemini_enabled !== false
        };

        // Rules
        const rulesRes = await pool.query('SELECT * FROM rules WHERE company_id = $1 ORDER BY created_at ASC', [c.id]);
        const rules = rulesRes.rows.map(r => ({
            id: r.id,
            name: r.name,
            enabled: r.enabled !== false,
            parentRuleId: r.parent_rule_id || null,
            triggerType: r.trigger_type || 'text',
            matchType: r.match_type,
            triggers: Array.isArray(r.triggers) ? r.triggers : [],
            response: r.response,
            media: r.media || null,
            leadTag: r.lead_tag || 'Interesado',
            pauseBot: Boolean(r.pause_bot),
            mediaTypeFilter: r.media_type_filter || 'any'
        }));

        // Leads
        const leadsRes = await pool.query('SELECT * FROM leads WHERE company_id = $1 ORDER BY last_interaction DESC', [c.id]);
        const leads = leadsRes.rows.map(l => ({
            phone: l.phone,
            name: l.name || l.phone,
            tag: l.tag || 'Nuevo',
            lastMessage: l.last_message || '',
            lastInteraction: l.last_interaction ? new Date(l.last_interaction).toISOString() : new Date().toISOString(),
            lastSentRuleId: l.last_sent_rule_id || null,
            humanPaused: Boolean(l.human_paused),
            receivedFiles: Array.isArray(l.received_files) ? l.received_files : []
        }));

        // Schedules
        const schedRes = await pool.query('SELECT * FROM schedules WHERE company_id = $1 ORDER BY created_at DESC', [c.id]);
        const schedules = schedRes.rows.map(sc => ({
            id: sc.id,
            name: sc.name || 'Campaña sin título',
            recipient: sc.recipient,
            message: sc.message,
            media: sc.media || null,
            scheduledTime: sc.scheduled_time ? new Date(sc.scheduled_time).toISOString() : null,
            status: sc.status || 'pending',
            sentAt: sc.sent_at ? new Date(sc.sent_at).toISOString() : null,
            createdAt: sc.created_at ? new Date(sc.created_at).toISOString() : new Date().toISOString()
        }));

        // Library Documents
        const libRes = await pool.query('SELECT * FROM library_documents WHERE company_id = $1 ORDER BY created_at DESC', [c.id]);
        const library = libRes.rows.map(ld => ({
            id: ld.id,
            name: ld.name,
            originalFilename: ld.original_filename,
            wordCount: ld.word_count || 0,
            charCount: ld.char_count || 0,
            size: ld.size || 0,
            active: ld.active !== false,
            createdAt: ld.created_at ? new Date(ld.created_at).toISOString() : new Date().toISOString()
        }));

        companies.push({
            id: c.id,
            name: c.name,
            createdBy: c.created_by,
            settings,
            rules,
            leads,
            schedules,
            library
        });
    }

    return {
        activeCompanyId: companies[0] ? companies[0].id : 'default',
        companies
    };
}

/**
 * Crear empresa en PostgreSQL
 */
async function createCompanyInDb(id, name, createdBy = null) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            INSERT INTO companies (id, name, created_by)
            VALUES ($1, $2, $3)
        `, [id, name, createdBy]);

        await client.query(`
            INSERT INTO company_settings (company_id, business_name, bot_enabled, simulate_typing, typing_delay_seconds, ignore_groups, fallback_message, gemini_enabled)
            VALUES ($1, $2, TRUE, TRUE, 2, TRUE, $3, TRUE)
            ON CONFLICT (company_id) DO NOTHING
        `, [id, name, `¡Hola! Gracias por comunicarte con ${name}. Escribe *menu* para ver las opciones disponibles.`]);

        if (createdBy) {
            await client.query(`
                INSERT INTO company_users (id, user_id, company_id, role_id, is_owner, status)
                VALUES ($1, $2, $3, 'role_admin', TRUE, 'active')
                ON CONFLICT (user_id, company_id) DO NOTHING
            `, [`cu_${id}_${createdBy}`, createdBy, id]);
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Actualizar nombre de empresa
 */
async function updateCompanyNameInDb(companyId, name) {
    await pool.query('UPDATE companies SET name = $1, updated_at = NOW() WHERE id = $2', [name, companyId]);
    await pool.query('UPDATE company_settings SET business_name = $1 WHERE company_id = $2', [name, companyId]);
}

/**
 * Eliminar empresa y todos sus datos asociados
 */
async function deleteCompanyFromDb(companyId) {
    await pool.query('DELETE FROM companies WHERE id = $1', [companyId]);
}

/**
 * Guardar o actualizar configuración de empresa
 */
async function saveCompanySettingsInDb(companyId, settings) {
    await pool.query(`
        INSERT INTO company_settings (company_id, business_name, bot_enabled, simulate_typing, typing_delay_seconds, ignore_groups, fallback_message, gemini_enabled, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (company_id) DO UPDATE SET
            business_name = EXCLUDED.business_name,
            bot_enabled = EXCLUDED.bot_enabled,
            simulate_typing = EXCLUDED.simulate_typing,
            typing_delay_seconds = EXCLUDED.typing_delay_seconds,
            ignore_groups = EXCLUDED.ignore_groups,
            fallback_message = EXCLUDED.fallback_message,
            gemini_enabled = EXCLUDED.gemini_enabled,
            updated_at = NOW();
    `, [
        companyId,
        settings.businessName,
        settings.botEnabled !== false,
        settings.simulateTyping !== false,
        settings.typingDelaySeconds || 2,
        settings.ignoreGroups !== false,
        settings.fallbackMessage || '',
        settings.geminiEnabled !== false
    ]);
}

/**
 * Guardar o actualizar una regla
 */
async function saveRuleInDb(companyId, rule) {
    await pool.query(`
        INSERT INTO rules (id, company_id, name, enabled, parent_rule_id, trigger_type, match_type, triggers, response, media, lead_tag, pause_bot, media_type_filter)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            enabled = EXCLUDED.enabled,
            parent_rule_id = EXCLUDED.parent_rule_id,
            trigger_type = EXCLUDED.trigger_type,
            match_type = EXCLUDED.match_type,
            triggers = EXCLUDED.triggers,
            response = EXCLUDED.response,
            media = EXCLUDED.media,
            lead_tag = EXCLUDED.lead_tag,
            pause_bot = EXCLUDED.pause_bot,
            media_type_filter = EXCLUDED.media_type_filter;
    `, [
        rule.id,
        companyId,
        rule.name,
        rule.enabled !== false,
        rule.parentRuleId || null,
        rule.triggerType || 'text',
        rule.matchType || 'contains_any',
        JSON.stringify(rule.triggers || []),
        rule.response || '',
        rule.media ? JSON.stringify(rule.media) : null,
        rule.leadTag || 'Interesado',
        Boolean(rule.pauseBot),
        rule.mediaTypeFilter || 'any'
    ]);
}

/**
 * Eliminar una regla
 */
async function deleteRuleFromDb(companyId, ruleId) {
    await pool.query('DELETE FROM rules WHERE company_id = $1 AND id = $2', [companyId, ruleId]);
}

/**
 * Upsert Lead (contacto)
 */
async function upsertLeadInDb(companyId, lead) {
    const leadId = lead.id || `lead_${companyId}_${lead.phone}`;
    await pool.query(`
        INSERT INTO leads (id, company_id, phone, name, tag, last_message, last_sent_rule_id, human_paused, received_files, last_interaction)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (company_id, phone) DO UPDATE SET
            name = EXCLUDED.name,
            tag = EXCLUDED.tag,
            last_message = EXCLUDED.last_message,
            last_sent_rule_id = EXCLUDED.last_sent_rule_id,
            human_paused = EXCLUDED.human_paused,
            received_files = EXCLUDED.received_files,
            last_interaction = EXCLUDED.last_interaction;
    `, [
        leadId,
        companyId,
        lead.phone,
        lead.name || lead.phone,
        lead.tag || 'Nuevo',
        lead.lastMessage || '',
        lead.lastSentRuleId || null,
        Boolean(lead.humanPaused),
        JSON.stringify(lead.receivedFiles || []),
        lead.lastInteraction || new Date().toISOString()
    ]);
}

/**
 * Eliminar Lead
 */
async function deleteLeadFromDb(companyId, phone) {
    await pool.query('DELETE FROM leads WHERE company_id = $1 AND phone = $2', [companyId, phone]);
}

/**
 * Guardar o actualizar envío programado
 */
async function saveScheduleInDb(companyId, schedule) {
    await pool.query(`
        INSERT INTO schedules (id, company_id, name, recipient, message, media, scheduled_time, status, sent_at, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            recipient = EXCLUDED.recipient,
            message = EXCLUDED.message,
            media = EXCLUDED.media,
            scheduled_time = EXCLUDED.scheduled_time,
            status = EXCLUDED.status,
            sent_at = EXCLUDED.sent_at;
    `, [
        schedule.id,
        companyId,
        schedule.name || 'Campaña sin título',
        schedule.recipient,
        schedule.message || '',
        schedule.media ? JSON.stringify(schedule.media) : null,
        schedule.scheduledTime,
        schedule.status || 'pending',
        schedule.sentAt || null,
        schedule.createdAt || new Date().toISOString()
    ]);
}

/**
 * Eliminar envío programado
 */
async function deleteScheduleFromDb(companyId, scheduleId) {
    await pool.query('DELETE FROM schedules WHERE company_id = $1 AND id = $2', [companyId, scheduleId]);
}

/**
 * Guardar o actualizar documento de biblioteca
 */
async function saveLibraryDocInDb(companyId, doc) {
    await pool.query(`
        INSERT INTO library_documents (id, company_id, name, original_filename, word_count, char_count, size, active, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            word_count = EXCLUDED.word_count,
            char_count = EXCLUDED.char_count,
            size = EXCLUDED.size,
            active = EXCLUDED.active;
    `, [
        doc.id,
        companyId,
        doc.name,
        doc.originalFilename || doc.name,
        doc.wordCount || 0,
        doc.charCount || 0,
        doc.size || 0,
        doc.active !== false,
        doc.createdAt || new Date().toISOString()
    ]);
}

/**
 * Eliminar documento de biblioteca
 */
async function deleteLibraryDocFromDb(companyId, docId) {
    await pool.query('DELETE FROM library_documents WHERE company_id = $1 AND id = $2', [companyId, docId]);
}

/**
 * Guardar mensaje en el historial
 */
async function saveMessageInDb(companyId, phone, fromMe, body, mediaUrl = null, mediaMimetype = null, messageType = 'chat', customId = null) {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (!cleanPhone || (!body && !mediaUrl)) return;
    const msgId = customId || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    try {
        await pool.query(`
            INSERT INTO messages (id, company_id, phone, from_me, body, media_url, media_mimetype, message_type, timestamp)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT (id) DO NOTHING;
        `, [msgId, companyId, cleanPhone, Boolean(fromMe), body || '', mediaUrl, mediaMimetype, messageType]);
    } catch (e) {
        console.error('Error guardando mensaje en DB:', e.message);
    }
}

/**
 * Obtener historial de mensajes de un prospecto desde la DB
 */
async function getMessagesFromDb(companyId, phone, limit = 100) {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (!cleanPhone) return [];
    try {
        const res = await pool.query(`
            SELECT id, from_me as "fromMe", body, media_url as "mediaUrl", media_mimetype as "mediaMimetype", message_type as "type", timestamp
            FROM messages
            WHERE company_id = $1 AND phone = $2
            ORDER BY timestamp ASC
            LIMIT $3;
        `, [companyId, cleanPhone, limit]);
        return res.rows.map(r => ({
            id: r.id,
            fromMe: Boolean(r.fromMe),
            body: r.body,
            mediaUrl: r.mediaUrl,
            mediaMimetype: r.mediaMimetype,
            type: r.type || 'chat',
            hasMedia: Boolean(r.mediaUrl),
            timestamp: r.timestamp ? new Date(r.timestamp).getTime() : Date.now()
        }));
    } catch (e) {
        console.error('Error obteniendo mensajes de DB:', e.message);
        return [];
    }
}

module.exports = {
    loadAllAppData,
    createCompanyInDb,
    updateCompanyNameInDb,
    deleteCompanyFromDb,
    saveCompanySettingsInDb,
    saveRuleInDb,
    deleteRuleFromDb,
    upsertLeadInDb,
    deleteLeadFromDb,
    saveScheduleInDb,
    deleteScheduleFromDb,
    saveLibraryDocInDb,
    deleteLibraryDocFromDb,
    saveMessageInDb,
    getMessagesFromDb
};
