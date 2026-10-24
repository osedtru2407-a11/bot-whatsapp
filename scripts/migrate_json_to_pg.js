'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool, initDb } = require('../db');

const DATA_FILE = path.join(__dirname, '..', 'sales_bot_data.json');
const BACKUP_FILE = path.join(__dirname, '..', 'sales_bot_data.json.bak');

async function migrate() {
    console.log('🚀 Iniciando proceso de migración de datos hacia PostgreSQL...');

    if (!fs.existsSync(DATA_FILE)) {
        throw new Error(`No se encontró el archivo de datos: ${DATA_FILE}`);
    }

    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);

    // 1. Limpiar tablas preliminares sin datos para aplicar nueva estructura
    const prepClient = await pool.connect();
    try {
        await prepClient.query(`
            DROP TABLE IF EXISTS rules CASCADE;
            DROP TABLE IF EXISTS leads CASCADE;
            DROP TABLE IF EXISTS schedules CASCADE;
            DROP TABLE IF EXISTS library_documents CASCADE;
        `);
    } finally {
        prepClient.release();
    }

    // 2. Inicializar esquema relacional completo
    await initDb();

    // 3. Conexión para transacción de datos
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Crear el primer Usuario Administrador (Oscar)
        const userPassword = process.env.POSTGRES_PW || 'Lajama18*..';
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(userPassword, salt);
        const userId = 'usr_' + Date.now();
        const userEmail = (process.env.POSTGRES_USER || 'oscar') + '@admin.com';
        const userName = 'Oscar';

        console.log(`👤 Creando usuario inicial: ${userName} (${userEmail})...`);
        const userRes = await client.query(`
            INSERT INTO users (id, email, password_hash, full_name, is_active, must_change_password)
            VALUES ($1, $2, $3, $4, TRUE, FALSE)
            ON CONFLICT (email) DO UPDATE SET
                password_hash = EXCLUDED.password_hash,
                full_name = EXCLUDED.full_name
            RETURNING id, email, full_name;
        `, [userId, userEmail, passwordHash, userName]);

        const adminUser = userRes.rows[0];
        console.log(`✅ Usuario Administrador listo: ID=${adminUser.id}, Email=${adminUser.email}`);

        // 2. Migrar cada empresa
        const companies = data.companies || [];
        console.log(`🏢 Migrando ${companies.length} empresa(s)...`);

        let totalRules = 0;
        let totalLeads = 0;
        let totalSchedules = 0;
        let totalDocs = 0;

        for (const comp of companies) {
            console.log(`\n📌 Procesando empresa: "${comp.name}" (ID: ${comp.id})...`);

            // Insertar empresa
            await client.query(`
                INSERT INTO companies (id, name, created_by)
                VALUES ($1, $2, $3)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name;
            `, [comp.id, comp.name, adminUser.id]);

            // Asignar al usuario Oscar como Owner y Administrador en esta empresa
            const membershipId = `cu_${comp.id}_${adminUser.id}`;
            await client.query(`
                INSERT INTO company_users (id, user_id, company_id, role_id, is_owner, status)
                VALUES ($1, $2, $3, 'role_admin', TRUE, 'active')
                ON CONFLICT (user_id, company_id) DO UPDATE SET
                    role_id = 'role_admin',
                    is_owner = TRUE,
                    status = 'active';
            `, [membershipId, adminUser.id, comp.id]);

            // Insertar configuración de la empresa
            const settings = comp.settings || {};
            await client.query(`
                INSERT INTO company_settings (
                    company_id, business_name, bot_enabled, simulate_typing,
                    typing_delay_seconds, ignore_groups, fallback_message, gemini_enabled
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (company_id) DO UPDATE SET
                    business_name = EXCLUDED.business_name,
                    bot_enabled = EXCLUDED.bot_enabled,
                    simulate_typing = EXCLUDED.simulate_typing,
                    typing_delay_seconds = EXCLUDED.typing_delay_seconds,
                    ignore_groups = EXCLUDED.ignore_groups,
                    fallback_message = EXCLUDED.fallback_message,
                    gemini_enabled = EXCLUDED.gemini_enabled;
            `, [
                comp.id,
                settings.businessName || comp.name,
                settings.botEnabled !== false,
                settings.simulateTyping !== false,
                settings.typingDelaySeconds || 2,
                settings.ignoreGroups !== false,
                settings.fallbackMessage || `¡Hola! Gracias por comunicarte con ${comp.name}.`,
                settings.geminiEnabled !== false
            ]);

            // Migrar Reglas (Rules)
            const rules = comp.rules || [];
            for (const r of rules) {
                await client.query(`
                    INSERT INTO rules (
                        id, company_id, name, enabled, parent_rule_id,
                        trigger_type, match_type, triggers, response,
                        media, lead_tag, pause_bot, media_type_filter
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
                    r.id,
                    comp.id,
                    r.name,
                    r.enabled !== false,
                    r.parentRuleId || null,
                    r.triggerType || 'text',
                    r.matchType || 'contains_any',
                    JSON.stringify(r.triggers || []),
                    r.response || '',
                    r.media ? JSON.stringify(r.media) : null,
                    r.leadTag || null,
                    Boolean(r.pauseBot),
                    r.mediaTypeFilter || 'any'
                ]);
                totalRules++;
            }

            // Migrar Prospectos (Leads)
            const leads = comp.leads || [];
            for (const l of leads) {
                const leadId = `lead_${comp.id}_${l.phone.replace(/[^a-zA-Z0-9]/g, '_')}`;
                await client.query(`
                    INSERT INTO leads (
                        id, company_id, phone, name, tag,
                        last_message, last_sent_rule_id, human_paused,
                        received_files, last_interaction
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
                    comp.id,
                    l.phone,
                    l.name || null,
                    l.tag || 'Nuevo',
                    l.lastMessage || null,
                    l.lastSentRuleId || null,
                    Boolean(l.humanPaused),
                    JSON.stringify(l.receivedFiles || []),
                    l.lastInteraction ? new Date(l.lastInteraction) : new Date()
                ]);
                totalLeads++;
            }

            // Migrar Envíos Programados (Schedules)
            const schedules = comp.schedules || [];
            for (const s of schedules) {
                const recipientPhone = s.recipient || s.phone || '0000000000';
                await client.query(`
                    INSERT INTO schedules (
                        id, company_id, name, recipient, message,
                        media, scheduled_time, status, sent_at, created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        recipient = EXCLUDED.recipient,
                        message = EXCLUDED.message,
                        media = EXCLUDED.media,
                        scheduled_time = EXCLUDED.scheduled_time,
                        status = EXCLUDED.status,
                        sent_at = EXCLUDED.sent_at;
                `, [
                    s.id,
                    comp.id,
                    s.name || s.customerName || 'Envío Programado',
                    recipientPhone,
                    s.message,
                    s.media ? JSON.stringify(s.media) : null,
                    s.scheduledTime ? new Date(s.scheduledTime) : new Date(),
                    s.status || 'pending',
                    s.sentAt ? new Date(s.sentAt) : null,
                    s.createdAt ? new Date(s.createdAt) : new Date()
                ]);
                totalSchedules++;
            }

            // Migrar Documentos de la Biblioteca
            const library = comp.library || [];
            for (const doc of library) {
                await client.query(`
                    INSERT INTO library_documents (
                        id, company_id, name, original_filename,
                        word_count, char_count, size, active, created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        original_filename = EXCLUDED.original_filename,
                        word_count = EXCLUDED.word_count,
                        char_count = EXCLUDED.char_count,
                        size = EXCLUDED.size,
                        active = EXCLUDED.active;
                `, [
                    doc.id,
                    comp.id,
                    doc.name,
                    doc.originalFilename,
                    doc.wordCount || 0,
                    doc.charCount || 0,
                    doc.size || 0,
                    doc.active !== false,
                    doc.createdAt ? new Date(doc.createdAt) : new Date()
                ]);
                totalDocs++;
            }

            console.log(`   ✔️ ${rules.length} rutas migradas`);
            console.log(`   ✔️ ${leads.length} prospectos migrados`);
            console.log(`   ✔️ ${schedules.length} envíos programados migrados`);
            console.log(`   ✔️ ${library.length} documentos de biblioteca migrados`);
        }

        await client.query('COMMIT');

        // Crear copia de respaldo del JSON
        fs.copyFileSync(DATA_FILE, BACKUP_FILE);
        console.log(`\n💾 Respaldo de seguridad creado en: ${BACKUP_FILE}`);

        console.log('\n======================================================');
        console.log('🎉 ¡MIGRACIÓN COMPLETADA EXITOSAMENTE EN POSTGRESQL! 🎉');
        console.log('======================================================');
        console.log(`👤 Usuario Administrador: ${adminUser.email}`);
        console.log(`🔑 Contraseña: (La misma definida en tu .env: ${userPassword})`);
        console.log(`🏢 Empresas migradas: ${companies.length}`);
        console.log(`📜 Total Rutas de Venta: ${totalRules}`);
        console.log(`👥 Total Prospectos (CRM): ${totalLeads}`);
        console.log(`⏰ Total Envíos Programados: ${totalSchedules}`);
        console.log(`📚 Total Documentos en Biblioteca: ${totalDocs}`);
        console.log('======================================================\n');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error fatal durante la migración:', err);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

migrate().catch(e => {
    console.error(e);
    process.exit(1);
});
