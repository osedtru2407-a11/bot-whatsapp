'use strict';

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    host: process.env.PG_HOST || process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(
        process.env.PG_PORT || process.env.POSTGRES_PORT || '5432',
        10,
    ),
    user: process.env.PG_USER || process.env.POSTGRES_USER || 'postgres',
    password:
        process.env.PG_PASSWORD ||
        process.env.POSTGRES_PASSWORD ||
        process.env.POSTGRES_PW,
    database:
        process.env.PG_DATABASE ||
        process.env.POSTGRES_DB ||
        'whatsapp_sales_bot',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
    console.error('❌ Error imprevisto en el pool de PostgreSQL:', err.message);
});

// Roles preestablecidos del sistema y sus permisos por defecto
const DEFAULT_SYSTEM_ROLES = [
    {
        id: 'role_admin',
        name: '👑 Administrador',
        description:
            'Acceso total y control absoluto de todas las funciones, vinculación de WhatsApp, roles y usuarios.',
        is_system_default: true,
        permissions: [
            'rules:view',
            'rules:create',
            'rules:edit',
            'rules:delete',
            'schedules:view',
            'schedules:create',
            'schedules:delete',
            'simulator:use',
            'quick_send:use',
            'leads:view',
            'leads:pause',
            'leads:delete',
            'library:view',
            'library:upload',
            'library:edit',
            'library:toggle',
            'library:delete',
            'settings:view',
            'settings:edit',
            'whatsapp:connect',
            'whatsapp:disconnect',
            'whatsapp:toggle',
            'team:view',
            'team:manage',
            'roles:manage',
        ],
    },
    {
        id: 'role_sales_agent',
        name: '💼 Asesor / Agente de Ventas',
        description:
            'Atiende clientes, consulta prospectos (CRM), realiza envíos rápidos y prueba el simulador.',
        is_system_default: true,
        permissions: [
            'leads:view',
            'leads:pause',
            'quick_send:use',
            'simulator:use',
        ],
    },
    {
        id: 'role_content_manager',
        name: '✍️ Gestor de Contenidos y Flujos',
        description:
            'Diseña rutas de respuesta, gestiona la biblioteca de conocimiento y programa envíos masivos.',
        is_system_default: true,
        permissions: [
            'rules:view',
            'rules:create',
            'rules:edit',
            'rules:delete',
            'library:view',
            'library:upload',
            'library:edit',
            'library:toggle',
            'library:delete',
            'schedules:view',
            'schedules:create',
            'schedules:delete',
            'simulator:use',
        ],
    },
    {
        id: 'role_viewer',
        name: '👀 Supervisor / Auditor (Solo Lectura)',
        description:
            'Visualiza métricas, prospectos, flujos y programación sin poder editar ni eliminar.',
        is_system_default: true,
        permissions: [
            'rules:view',
            'schedules:view',
            'leads:view',
            'library:view',
            'settings:view',
        ],
    },
];

/**
 * Inicializa el esquema completo de la base de datos si no existe
 */
async function initDb() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Tabla de Usuarios
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(100) PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                is_active BOOLEAN DEFAULT TRUE,
                must_change_password BOOLEAN DEFAULT FALSE,
                is_superadmin BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // 2. Tabla de Empresas
        await client.query(`
            CREATE TABLE IF NOT EXISTS companies (
                id VARCHAR(100) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                created_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // 3. Tabla de Roles
        await client.query(`
            CREATE TABLE IF NOT EXISTS roles (
                id VARCHAR(100) PRIMARY KEY,
                company_id VARCHAR(100) REFERENCES companies(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                is_system_default BOOLEAN DEFAULT FALSE,
                permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // 4. Tabla Intermedia Usuario-Empresa (Membresía Many-to-Many con Roles)
        await client.query(`
            CREATE TABLE IF NOT EXISTS company_users (
                id VARCHAR(100) PRIMARY KEY,
                user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                company_id VARCHAR(100) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                role_id VARCHAR(100) NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
                is_owner BOOLEAN DEFAULT FALSE,
                status VARCHAR(50) DEFAULT 'active',
                phone VARCHAR(50),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(user_id, company_id)
            );
            ALTER TABLE company_users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
        `);

        // 5. Configuración de Empresa
        await client.query(`
            CREATE TABLE IF NOT EXISTS company_settings (
                company_id VARCHAR(100) PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
                business_name VARCHAR(255),
                bot_enabled BOOLEAN DEFAULT TRUE,
                simulate_typing BOOLEAN DEFAULT TRUE,
                typing_delay_seconds INT DEFAULT 2,
                ignore_groups BOOLEAN DEFAULT TRUE,
                phone_usage_type VARCHAR(50) DEFAULT 'business_only',
                fallback_message TEXT,
                gemini_enabled BOOLEAN DEFAULT TRUE,
                gemini_api_key TEXT,
                gemini_model VARCHAR(100) DEFAULT 'gemini-3.5-flash-lite',
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS phone_usage_type VARCHAR(50) DEFAULT 'business_only';
        `);

        // 6. Rutas de Venta (Rules)
        await client.query(`
            CREATE TABLE IF NOT EXISTS rules (
                id VARCHAR(100) PRIMARY KEY,
                company_id VARCHAR(100) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                enabled BOOLEAN DEFAULT TRUE,
                parent_rule_id VARCHAR(100),
                trigger_type VARCHAR(50) DEFAULT 'text',
                match_type VARCHAR(50) NOT NULL,
                triggers JSONB NOT NULL DEFAULT '[]'::jsonb,
                response TEXT NOT NULL,
                media JSONB,
                lead_tag VARCHAR(100),
                pause_bot BOOLEAN DEFAULT FALSE,
                media_type_filter VARCHAR(50) DEFAULT 'any',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // 7. Prospectos (Leads)
        await client.query(`
            CREATE TABLE IF NOT EXISTS leads (
                id VARCHAR(100) PRIMARY KEY,
                company_id VARCHAR(100) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                phone VARCHAR(100) NOT NULL,
                name VARCHAR(255),
                tag VARCHAR(100) DEFAULT 'Nuevo',
                last_message TEXT,
                last_sent_rule_id VARCHAR(100),
                human_paused BOOLEAN DEFAULT FALSE,
                human_paused_until TIMESTAMP WITH TIME ZONE,
                received_files JSONB DEFAULT '[]'::jsonb,
                last_interaction TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                conversation_summary TEXT,
                last_summary_at TIMESTAMP WITH TIME ZONE,
                is_personal BOOLEAN DEFAULT FALSE,
                personal_reason VARCHAR(255),
                UNIQUE(company_id, phone)
            );
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS human_paused_until TIMESTAMP WITH TIME ZONE;
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversation_summary TEXT;
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_summary_at TIMESTAMP WITH TIME ZONE;
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_personal BOOLEAN DEFAULT FALSE;
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS personal_reason VARCHAR(255);
        `);

        // 8. Envíos Programados (Schedules)
        await client.query(`
            CREATE TABLE IF NOT EXISTS schedules (
                id VARCHAR(100) PRIMARY KEY,
                company_id VARCHAR(100) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                name VARCHAR(255),
                recipient VARCHAR(100) NOT NULL,
                message TEXT NOT NULL,
                media JSONB,
                scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                sent_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // 9. Documentos de la Biblioteca
        await client.query(`
            CREATE TABLE IF NOT EXISTS library_documents (
                id VARCHAR(100) PRIMARY KEY,
                company_id VARCHAR(100) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                original_filename VARCHAR(255) NOT NULL,
                word_count INT DEFAULT 0,
                char_count INT DEFAULT 0,
                size INT DEFAULT 0,
                active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // 10. Tabla de Historial de Mensajes de Chat
        await client.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id VARCHAR(150) PRIMARY KEY,
                company_id VARCHAR(100) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                phone VARCHAR(100) NOT NULL,
                from_me BOOLEAN DEFAULT FALSE,
                body TEXT,
                media_url TEXT,
                media_mimetype VARCHAR(100),
                message_type VARCHAR(50) DEFAULT 'chat',
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // 10.1 Tabla de Productos del Catálogo
        await client.query(`
            CREATE TABLE IF NOT EXISTS products (
                id VARCHAR(100) PRIMARY KEY,
                company_id VARCHAR(100) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                code VARCHAR(100) NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                price VARCHAR(100),
                observations TEXT,
                is_available BOOLEAN DEFAULT TRUE,
                images JSONB DEFAULT '[]'::jsonb,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                CONSTRAINT uq_company_product_code UNIQUE (company_id, code)
            );
        `);

        // 10.2 Tabla de Campañas y Promociones Temporales (Tarea 5)
        await client.query(`
            CREATE TABLE IF NOT EXISTS promotions (
                id VARCHAR(100) PRIMARY KEY,
                company_id VARCHAR(100) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                original_filename VARCHAR(255),
                content TEXT NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_promotions_company ON promotions(company_id);
            CREATE INDEX IF NOT EXISTS idx_promotions_dates ON promotions(company_id, start_date, end_date);
        `);

        // 11. Grupos Personalizados de Difusión
        await client.query(`
            CREATE TABLE IF NOT EXISTS contact_groups (
                id VARCHAR(100) PRIMARY KEY,
                company_id VARCHAR(100) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                color VARCHAR(50) DEFAULT '#38bdf8',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // 12. Miembros de Grupos Personalizados
        await client.query(`
            CREATE TABLE IF NOT EXISTS lead_group_members (
                id VARCHAR(100) PRIMARY KEY,
                company_id VARCHAR(100) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                group_id VARCHAR(100) NOT NULL REFERENCES contact_groups(id) ON DELETE CASCADE,
                lead_phone VARCHAR(100) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(group_id, lead_phone)
            );
        `);

        // 13. Migraciones y ampliación de schedules para campañas y grupos de difusión
        await client.query(`
            ALTER TABLE schedules ADD COLUMN IF NOT EXISTS target_type VARCHAR(50) DEFAULT 'single';
            ALTER TABLE schedules ADD COLUMN IF NOT EXISTS target_value VARCHAR(255);
            ALTER TABLE schedules ADD COLUMN IF NOT EXISTS total_recipients INT DEFAULT 1;
            ALTER TABLE schedules ADD COLUMN IF NOT EXISTS sent_recipients INT DEFAULT 0;
            ALTER TABLE schedules ADD COLUMN IF NOT EXISTS failed_recipients INT DEFAULT 0;
            ALTER TABLE schedules ADD COLUMN IF NOT EXISTS delay_seconds INT DEFAULT 10;
            ALTER TABLE schedules ADD COLUMN IF NOT EXISTS execution_logs JSONB DEFAULT '[]'::jsonb;
            ALTER TABLE schedules ADD COLUMN IF NOT EXISTS recurrence VARCHAR(50) DEFAULT 'none';
            ALTER TABLE schedules ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMP WITH TIME ZONE;
        `);

        // 14. Agenda de Contactos (Directorio general separado del embudo de ventas CRM)
        await client.query(`
            CREATE TABLE IF NOT EXISTS contacts (
                id VARCHAR(100) PRIMARY KEY,
                company_id VARCHAR(100) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                phone VARCHAR(100) NOT NULL,
                name VARCHAR(255),
                source VARCHAR(50) DEFAULT 'manual',
                tags VARCHAR(255) DEFAULT '',
                notes TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(company_id, phone)
            );
        `);

        // Migración automática: separar contactos importados que no hayan iniciado interacción en el embudo
        await client.query(`
            INSERT INTO contacts (id, company_id, phone, name, source, tags, created_at, updated_at)
            SELECT 'cnt_' || id, company_id, phone, COALESCE(name, phone),
                   CASE 
                     WHEN tag ILIKE '%whatsapp%' THEN 'whatsapp'
                     ELSE 'google_csv'
                   END,
                   tag, 
                   last_interaction, 
                   NOW()
            FROM leads
            WHERE (tag IN ('Importado Google', 'Importado WhatsApp', 'Agenda WhatsApp') OR tag ILIKE 'Importado%')
            ON CONFLICT (company_id, phone) DO UPDATE SET
                name = EXCLUDED.name,
                source = EXCLUDED.source,
                tags = EXCLUDED.tags;

            DELETE FROM leads 
            WHERE (tag IN ('Importado Google', 'Importado WhatsApp', 'Agenda WhatsApp') OR tag ILIKE 'Importado%')
              AND (last_message IS NULL OR last_message = '')
              AND (received_files IS NULL OR jsonb_array_length(received_files) = 0);
        `);

        // 15. Configuración de API Key individual de Gemini por empresa
        await client.query(`
            ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;
            ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS gemini_model VARCHAR(100) DEFAULT 'gemini-3.5-flash-lite';
            ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS bot_tone TEXT;
            ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS business_info TEXT;
            ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS faq_text TEXT;
            ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS never_do TEXT;
            UPDATE company_settings SET gemini_model = 'gemini-3.5-flash-lite' WHERE gemini_model = 'gemini-2.5-flash' OR gemini_model IS NULL;
        `);

        // 16. Rol de Superusuario del sistema
        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN DEFAULT FALSE;
        `);
        if (process.env.INITIAL_ADMIN_EMAIL || process.env.SUPERADMIN_EMAIL) {
            const superEmail = (
                process.env.INITIAL_ADMIN_EMAIL || process.env.SUPERADMIN_EMAIL
            )
                .trim()
                .toLowerCase();
            await client.query(
                `UPDATE users SET is_superadmin = TRUE WHERE LOWER(email) = $1`,
                [superEmail],
            );
        }

        // 17. Tabla de Solicitudes y Tokens de Recuperación de Contraseña
        await client.query(`
            CREATE TABLE IF NOT EXISTS password_resets (
                id VARCHAR(100) PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                token VARCHAR(255) NOT NULL,
                code VARCHAR(10),
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_password_resets_email ON password_resets(email);
            CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);
        `);

        // 10. Sembrar roles preestablecidos del sistema si no existen
        for (const role of DEFAULT_SYSTEM_ROLES) {
            await client.query(
                `
                INSERT INTO roles (id, company_id, name, description, is_system_default, permissions)
                VALUES ($1, NULL, $2, $3, $4, $5)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    permissions = EXCLUDED.permissions;
            `,
                [
                    role.id,
                    role.name,
                    role.description,
                    role.is_system_default,
                    JSON.stringify(role.permissions),
                ],
            );
        }

        // Índices para optimizar velocidad de consultas frecuentes
        await client.query(
            `CREATE INDEX IF NOT EXISTS idx_rules_company ON rules(company_id);`,
        );
        await client.query(
            `CREATE INDEX IF NOT EXISTS idx_leads_company ON leads(company_id);`,
        );
        await client.query(
            `CREATE INDEX IF NOT EXISTS idx_leads_company_phone ON leads(company_id, phone);`,
        );
        await client.query(
            `CREATE INDEX IF NOT EXISTS idx_schedules_company_status ON schedules(company_id, status);`,
        );
        await client.query(
            `CREATE INDEX IF NOT EXISTS idx_library_company ON library_documents(company_id);`,
        );
        await client.query(
            `CREATE INDEX IF NOT EXISTS idx_company_users_user ON company_users(user_id);`,
        );
        await client.query(
            `CREATE INDEX IF NOT EXISTS idx_company_users_company ON company_users(company_id);`,
        );
        await client.query(
            `CREATE INDEX IF NOT EXISTS idx_messages_company_phone ON messages(company_id, phone);`,
        );
        await client.query(
            `CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);`,
        );
        await client.query(
            `CREATE INDEX IF NOT EXISTS idx_contact_groups_company ON contact_groups(company_id);`,
        );
        await client.query(
            `CREATE INDEX IF NOT EXISTS idx_group_members_group ON lead_group_members(group_id);`,
        );
        await client.query(
            `CREATE INDEX IF NOT EXISTS idx_group_members_phone ON lead_group_members(lead_phone);`,
        );
        await client.query(
            `CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id);`,
        );
        await client.query(
            `CREATE INDEX IF NOT EXISTS idx_contacts_company_phone ON contacts(company_id, phone);`,
        );

        // Limpiar registros espurios de estados de WhatsApp (Stories) guardados por error
        await client.query(
            `DELETE FROM leads WHERE phone = 'status@broadcast' OR phone LIKE '%@broadcast%';`,
        );

        // 11. Asegurar que existe al menos un usuario administrador inicial si la base está vacía
        const userCountRes = await client.query(
            'SELECT count(*) as count FROM users',
        );
        if (parseInt(userCountRes.rows[0].count, 10) === 0) {
            const crypto = require('crypto');
            const adminEmail = (
                process.env.INITIAL_ADMIN_EMAIL || 'admin@admin.com'
            )
                .trim()
                .toLowerCase();
            const adminName = (
                process.env.INITIAL_ADMIN_NAME || 'Administrador'
            ).trim();

            let adminPass = process.env.INITIAL_ADMIN_PASSWORD;
            let mustChange = false;

            if (!adminPass) {
                // Generar contraseña temporal segura aleatoria si no se especificó en las variables de entorno
                adminPass = crypto.randomBytes(8).toString('hex') + 'A1!';
                mustChange = true;
            }

            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(adminPass, salt);
            const adminId = 'usr_' + Date.now();

            await client.query(
                `
                INSERT INTO users (id, email, password_hash, full_name, is_active, must_change_password, is_superadmin)
                VALUES ($1, $2, $3, $4, TRUE, $5, TRUE)
                ON CONFLICT (email) DO NOTHING;
            `,
                [adminId, adminEmail, passwordHash, adminName, mustChange],
            );

            console.log(
                '\n========================================================================',
            );
            console.log(
                '🛡️  USUARIO ADMINISTRADOR INICIAL GENERADO AUTOMÁTICAMENTE',
            );
            console.log(`   Email:        ${adminEmail}`);
            if (mustChange) {
                console.log(`   Contraseña:   ${adminPass}`);
                console.log(
                    '   ⚠️  Guarde esta contraseña temporal. Se le exigirá cambiarla al iniciar sesión.',
                );
            } else {
                console.log(
                    '   Contraseña:   [Configurada en .env vía INITIAL_ADMIN_PASSWORD]',
                );
            }
            console.log(
                '========================================================================\n',
            );

            // Asegurar membresía de admin en la empresa por defecto 'default'
            const defaultCompRes = await client.query(
                "SELECT id FROM companies WHERE id = 'default'",
            );
            if (defaultCompRes.rows.length > 0) {
                await client.query(
                    `
                    INSERT INTO company_users (id, user_id, company_id, role_id, is_owner, status)
                    VALUES ($1, $2, 'default', 'role_admin', TRUE, 'active')
                    ON CONFLICT (user_id, company_id) DO NOTHING;
                `,
                    [`cu_default_${adminId}`, adminId],
                );
            }
        }

        await client.query('COMMIT');
        console.log(
            '✅ Esquema relacional PostgreSQL inicializado exitosamente.',
        );
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error inicializando esquema PostgreSQL:', err);
        throw err;
    } finally {
        client.release();
    }
}

async function getCompanyProducts(companyId) {
    try {
        const res = await pool.query(
            'SELECT * FROM products WHERE company_id = $1 ORDER BY code ASC',
            [companyId]
        );
        return res.rows || [];
    } catch (err) {
        console.warn(`Aviso consultando productos de empresa ${companyId}: ${err.message}`);
        return [];
    }
}

async function getCompanyActivePromotions(companyId) {
    try {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const localDate = `${y}-${m}-${d}`;
        const utcDate = now.toISOString().split('T')[0];
        let bogotaDate = localDate;
        try {
            bogotaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(now);
        } catch (e) {}

        const res = await pool.query(
            `SELECT * FROM promotions 
             WHERE company_id = $1 AND is_active = true 
               AND (
                 (start_date <= $2 AND end_date >= $2)
                 OR (start_date <= $3 AND end_date >= $3)
                 OR (start_date <= $4 AND end_date >= $4)
               )
             ORDER BY start_date ASC LIMIT 2`,
            [companyId, localDate, utcDate, bogotaDate]
        );
        return res.rows || [];
    } catch (err) {
        return [];
    }
}

module.exports = {
    pool,
    query: (text, params) => pool.query(text, params),
    initDb,
    getCompanyProducts,
    getCompanyActivePromotions,
    DEFAULT_SYSTEM_ROLES,
};
