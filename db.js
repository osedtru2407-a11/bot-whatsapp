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

        // 18. Tabla de Planes SaaS y Cuotas (Tarea 9)
        await client.query(`
            CREATE TABLE IF NOT EXISTS plans (
                id VARCHAR(100) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                price NUMERIC(10, 2) DEFAULT 0.00,
                currency VARCHAR(10) DEFAULT 'USD',
                gemini_limit_type VARCHAR(20) DEFAULT 'monthly',
                gemini_limit INT DEFAULT 100,
                auto_messages_limit_type VARCHAR(20) DEFAULT 'monthly',
                auto_messages_limit INT DEFAULT 500,
                custom_warning_message TEXT,
                is_default BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan_id VARCHAR(100) REFERENCES plans(id) ON DELETE SET NULL;
            ALTER TABLE companies ADD COLUMN IF NOT EXISTS gemini_calls_count INT DEFAULT 0;
            ALTER TABLE companies ADD COLUMN IF NOT EXISTS gemini_calls_reset_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
            ALTER TABLE companies ADD COLUMN IF NOT EXISTS auto_messages_count INT DEFAULT 0;
            ALTER TABLE companies ADD COLUMN IF NOT EXISTS auto_messages_reset_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
            ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan_started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        `);

        // Sembrar planes predeterminados en db.js
        const defaultPlans = [
            {
                id: 'plan_demo',
                name: 'Versión Gratuita / Demo',
                description: '100 llamados de IA totales para probar el sistema sin costo.',
                price: 0.00,
                currency: 'USD',
                geminiLimitType: 'total',
                geminiLimit: 100,
                autoMessagesLimitType: 'monthly',
                autoMessagesLimit: 200,
                customWarningMessage: 'Has completado el límite de 100 consultas de inteligencia artificial de la versión demo. Un asesor humano continuará la atención.',
                isDefault: true,
                isActive: true
            },
            {
                id: 'plan_standard',
                name: 'Plan Estándar ($5 USD/mes)',
                description: '2.500 respuestas de IA Gemini mensuales y 5.000 mensajes automáticos.',
                price: 5.00,
                currency: 'USD',
                geminiLimitType: 'monthly',
                geminiLimit: 2500,
                autoMessagesLimitType: 'monthly',
                autoMessagesLimit: 5000,
                customWarningMessage: 'Hemos completado el límite mensual de respuestas automáticas de nuestro plan. En breve un asesor continuará la atención personalmente.',
                isDefault: false,
                isActive: true
            },
            {
                id: 'plan_pro',
                name: 'Plan Pro Ilimitado',
                description: 'Consultas de IA y mensajes automáticos sin límite de cuota.',
                price: 15.00,
                currency: 'USD',
                geminiLimitType: 'monthly',
                geminiLimit: -1,
                autoMessagesLimitType: 'unlimited',
                autoMessagesLimit: -1,
                customWarningMessage: null,
                isDefault: false,
                isActive: true
            }
        ];

        for (const p of defaultPlans) {
            await client.query(`
                INSERT INTO plans (id, name, description, price, currency, gemini_limit_type, gemini_limit, auto_messages_limit_type, auto_messages_limit, custom_warning_message, is_default, is_active)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (id) DO NOTHING;
            `, [
                p.id, p.name, p.description, p.price, p.currency,
                p.geminiLimitType, p.geminiLimit, p.autoMessagesLimitType,
                p.autoMessagesLimit, p.customWarningMessage, p.isDefault, p.isActive
            ]);
        }

        // Asignar el plan demo a empresas existentes sin plan
        await client.query(`
            UPDATE companies SET plan_id = 'plan_demo' WHERE plan_id IS NULL;
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
        } catch (e) { }

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

// =========================================================================
// MÉTODOS DE GESTIÓN DE PLANES SAAS Y CONSUMO DE CUOTA (TAREA 9)
// =========================================================================

async function getPlans() {
    try {
        const res = await pool.query('SELECT * FROM plans ORDER BY price ASC, created_at ASC');
        return res.rows || [];
    } catch (err) {
        console.error('Error obteniendo planes:', err);
        return [];
    }
}

async function getPlanById(id) {
    const res = await pool.query('SELECT * FROM plans WHERE id = $1', [id]);
    return res.rows[0] || null;
}

async function createPlan(data) {
    const id = data.id || 'plan_' + Date.now();
    if (data.isDefault) {
        await pool.query('UPDATE plans SET is_default = FALSE');
    }
    const res = await pool.query(`
        INSERT INTO plans (
            id, name, description, price, currency,
            gemini_limit_type, gemini_limit, auto_messages_limit_type,
            auto_messages_limit, custom_warning_message, is_default, is_active,
            updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        RETURNING *;
    `, [
        id,
        (data.name || 'Nuevo Plan').trim(),
        data.description || null,
        data.price !== undefined ? Number(data.price) : 0,
        data.currency || 'USD',
        data.geminiLimitType === 'total' ? 'total' : 'monthly',
        data.geminiLimit !== undefined ? Number(data.geminiLimit) : 100,
        data.autoMessagesLimitType || 'monthly',
        data.autoMessagesLimit !== undefined ? Number(data.autoMessagesLimit) : 500,
        data.customWarningMessage || null,
        Boolean(data.isDefault),
        data.isActive !== false
    ]);
    return res.rows[0];
}

async function updatePlan(id, data) {
    if (data.isDefault) {
        await pool.query('UPDATE plans SET is_default = FALSE WHERE id != $1', [id]);
    }
    const current = await getPlanById(id);
    if (!current) throw new Error('Plan no encontrado');

    const name = data.name !== undefined ? data.name.trim() : current.name;
    const description = data.description !== undefined ? data.description : current.description;
    const price = data.price !== undefined ? Number(data.price) : current.price;
    const currency = data.currency !== undefined ? data.currency : current.currency;
    const geminiLimitType = data.geminiLimitType !== undefined ? data.geminiLimitType : current.gemini_limit_type;
    const geminiLimit = data.geminiLimit !== undefined ? Number(data.geminiLimit) : current.gemini_limit;
    const autoMessagesLimitType = data.autoMessagesLimitType !== undefined ? data.autoMessagesLimitType : current.auto_messages_limit_type;
    const autoMessagesLimit = data.autoMessagesLimit !== undefined ? Number(data.autoMessagesLimit) : current.auto_messages_limit;
    const customWarningMessage = data.customWarningMessage !== undefined ? data.customWarningMessage : current.custom_warning_message;
    const isDefault = data.isDefault !== undefined ? Boolean(data.isDefault) : current.is_default;
    const isActive = data.isActive !== undefined ? Boolean(data.isActive) : current.is_active;

    const res = await pool.query(`
        UPDATE plans SET
            name = $2, description = $3, price = $4, currency = $5,
            gemini_limit_type = $6, gemini_limit = $7,
            auto_messages_limit_type = $8, auto_messages_limit = $9,
            custom_warning_message = $10, is_default = $11, is_active = $12,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *;
    `, [
        id, name, description, price, currency,
        geminiLimitType, geminiLimit, autoMessagesLimitType,
        autoMessagesLimit, customWarningMessage, isDefault, isActive
    ]);
    return res.rows[0];
}

async function deletePlan(id) {
    const plan = await getPlanById(id);
    if (!plan) throw new Error('Plan no encontrado');
    if (plan.is_default) {
        throw new Error('No puedes eliminar el plan predeterminado del sistema');
    }

    const defaultRes = await pool.query("SELECT id FROM plans WHERE is_default = TRUE LIMIT 1");
    const fallbackId = defaultRes.rows.length > 0 ? defaultRes.rows[0].id : 'plan_demo';

    await pool.query('UPDATE companies SET plan_id = $1 WHERE plan_id = $2', [fallbackId, id]);
    await pool.query('DELETE FROM plans WHERE id = $1', [id]);
    return { success: true, message: `Plan "${plan.name}" eliminado correctamente.` };
}

async function assignPlanToCompany(companyId, planId) {
    const plan = await getPlanById(planId);
    if (!plan) throw new Error('Plan no encontrado');

    const res = await pool.query(`
        UPDATE companies SET
            plan_id = $2,
            plan_started_at = NOW(),
            gemini_calls_count = 0,
            gemini_calls_reset_at = NOW(),
            auto_messages_count = 0,
            auto_messages_reset_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *;
    `, [companyId, planId]);

    return res.rows[0];
}

async function resetCompanyQuota(companyId) {
    const res = await pool.query(`
        UPDATE companies SET
            gemini_calls_count = 0,
            gemini_calls_reset_at = NOW(),
            auto_messages_count = 0,
            auto_messages_reset_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *;
    `, [companyId]);

    return { success: true, message: 'Cuota de consumo reiniciada exitosamente a 0.' };
}

async function checkAndPerformMonthlyResetPg(compRow, planRow) {
    if (!compRow || !planRow) return;
    const now = new Date();
    let needsUpdate = false;
    let newGeminiCount = compRow.gemini_calls_count;
    let newGeminiReset = compRow.gemini_calls_reset_at;
    let newAutoCount = compRow.auto_messages_count;
    let newAutoReset = compRow.auto_messages_reset_at;

    if (planRow.gemini_limit_type === 'monthly') {
        const lastReset = compRow.gemini_calls_reset_at ? new Date(compRow.gemini_calls_reset_at) : new Date(0);
        if (now.getFullYear() !== lastReset.getFullYear() || now.getMonth() !== lastReset.getMonth()) {
            newGeminiCount = 0;
            newGeminiReset = now;
            needsUpdate = true;
        }
    }

    if (planRow.auto_messages_limit_type === 'monthly') {
        const lastReset = compRow.auto_messages_reset_at ? new Date(compRow.auto_messages_reset_at) : new Date(0);
        if (now.getFullYear() !== lastReset.getFullYear() || now.getMonth() !== lastReset.getMonth()) {
            newAutoCount = 0;
            newAutoReset = now;
            needsUpdate = true;
        }
    }

    if (needsUpdate) {
        await pool.query(`
            UPDATE companies SET
                gemini_calls_count = $2,
                gemini_calls_reset_at = $3,
                auto_messages_count = $4,
                auto_messages_reset_at = $5
            WHERE id = $1;
        `, [compRow.id, newGeminiCount, newGeminiReset, newAutoCount, newAutoReset]);
        compRow.gemini_calls_count = newGeminiCount;
        compRow.gemini_calls_reset_at = newGeminiReset;
        compRow.auto_messages_count = newAutoCount;
        compRow.auto_messages_reset_at = newAutoReset;
    }
}

async function getCompanyUsage(companyId) {
    const compRes = await pool.query(`
        SELECT c.*, p.name as plan_name, p.description as plan_description,
               p.price as plan_price, p.currency as plan_currency,
               p.gemini_limit_type, p.gemini_limit,
               p.auto_messages_limit_type, p.auto_messages_limit,
               p.custom_warning_message
        FROM companies c
        LEFT JOIN plans p ON p.id = c.plan_id
        WHERE c.id = $1;
    `, [companyId]);

    if (compRes.rows.length === 0) throw new Error('Empresa no encontrada');
    let row = compRes.rows[0];

    // Si la empresa no tiene plan asignado, asociar el plan demo por defecto
    if (!row.plan_id) {
        const defaultPlanRes = await pool.query('SELECT * FROM plans WHERE is_default = TRUE LIMIT 1');
        const defPlan = defaultPlanRes.rows[0] || {
            id: 'plan_demo',
            name: 'Versión Gratuita / Demo',
            gemini_limit_type: 'total',
            gemini_limit: 100,
            auto_messages_limit_type: 'monthly',
            auto_messages_limit: 200
        };
        await pool.query('UPDATE companies SET plan_id = $1 WHERE id = $2', [defPlan.id, companyId]);
        row.plan_id = defPlan.id;
        row.plan_name = defPlan.name;
        row.gemini_limit_type = defPlan.gemini_limit_type;
        row.gemini_limit = defPlan.gemini_limit;
        row.auto_messages_limit_type = defPlan.auto_messages_limit_type;
        row.auto_messages_limit = defPlan.auto_messages_limit;
    }

    await checkAndPerformMonthlyResetPg(row, {
        gemini_limit_type: row.gemini_limit_type,
        auto_messages_limit_type: row.auto_messages_limit_type
    });

    const geminiLimit = Number(row.gemini_limit !== null ? row.gemini_limit : 100);
    const geminiUsed = Number(row.gemini_calls_count || 0);
    const isGeminiUnlimited = geminiLimit <= 0;
    const geminiPercent = isGeminiUnlimited ? 0 : Math.min(100, Math.round((geminiUsed / geminiLimit) * 100));

    const autoLimit = Number(row.auto_messages_limit !== null ? row.auto_messages_limit : 500);
    const autoUsed = Number(row.auto_messages_count || 0);
    const isAutoUnlimited = autoLimit <= 0 || row.auto_messages_limit_type === 'unlimited';
    const autoPercent = isAutoUnlimited ? 0 : Math.min(100, Math.round((autoUsed / autoLimit) * 100));

    return {
        companyId: row.id,
        companyName: row.name,
        plan: {
            id: row.plan_id,
            name: row.plan_name,
            description: row.plan_description,
            price: Number(row.plan_price || 0),
            currency: row.plan_currency || 'USD',
            geminiLimitType: row.gemini_limit_type,
            geminiLimit,
            autoMessagesLimitType: row.auto_messages_limit_type,
            autoMessagesLimit: autoLimit,
            customWarningMessage: row.custom_warning_message
        },
        geminiUsage: {
            current: geminiUsed,
            limit: geminiLimit,
            type: row.gemini_limit_type,
            percent: geminiPercent,
            isExhausted: !isGeminiUnlimited && geminiUsed >= geminiLimit,
            isUnlimited: isGeminiUnlimited,
            resetAt: row.gemini_calls_reset_at
        },
        autoMessagesUsage: {
            current: autoUsed,
            limit: autoLimit,
            type: row.auto_messages_limit_type,
            percent: autoPercent,
            isExhausted: !isAutoUnlimited && autoUsed >= autoLimit,
            isUnlimited: isAutoUnlimited,
            resetAt: row.auto_messages_reset_at
        }
    };
}

async function checkGeminiQuota(companyId) {
    try {
        const usage = await getCompanyUsage(companyId);
        if (usage.geminiUsage.isUnlimited) {
            return { allowed: true, warningMessage: null, current: usage.geminiUsage.current, limit: -1, planName: usage.plan.name };
        }
        if (usage.geminiUsage.isExhausted) {
            // Solo enviar mensaje si está explícitamente configurado en el plan.
            // Si el empresario/superadmin dejó el campo vacío, NO se envía nada a los clientes para no exponer la cuota.
            const warning = (usage.plan.customWarningMessage && usage.plan.customWarningMessage.trim())
                ? usage.plan.customWarningMessage.trim()
                : null;
            return {
                allowed: false,
                warningMessage: warning,
                current: usage.geminiUsage.current,
                limit: usage.geminiUsage.limit,
                planName: usage.plan.name
            };
        }
        return {
            allowed: true,
            warningMessage: null,
            current: usage.geminiUsage.current,
            limit: usage.geminiUsage.limit,
            planName: usage.plan.name
        };
    } catch (err) {
        console.warn(`Aviso verificando cuota Gemini para ${companyId}:`, err.message);
        return { allowed: true, warningMessage: null, current: 0, limit: -1, planName: '' };
    }
}

async function incrementGeminiCalls(companyId) {
    try {
        await pool.query('UPDATE companies SET gemini_calls_count = COALESCE(gemini_calls_count, 0) + 1 WHERE id = $1', [companyId]);
        const usage = await getCompanyUsage(companyId);
        return {
            current: usage.geminiUsage.current,
            limit: usage.geminiUsage.limit,
            isExhausted: usage.geminiUsage.isExhausted,
            planName: usage.plan.name
        };
    } catch (err) {
        console.warn(`Aviso incrementando Gemini calls para ${companyId}:`, err.message);
        return { current: 0, limit: -1, isExhausted: false, planName: '' };
    }
}

async function checkAutoMessagesQuota(companyId) {
    try {
        const usage = await getCompanyUsage(companyId);
        if (usage.autoMessagesUsage.isUnlimited) {
            return { allowed: true, current: usage.autoMessagesUsage.current, limit: -1, planName: usage.plan.name };
        }
        if (usage.autoMessagesUsage.isExhausted) {
            return {
                allowed: false,
                current: usage.autoMessagesUsage.current,
                limit: usage.autoMessagesUsage.limit,
                planName: usage.plan.name
            };
        }
        return {
            allowed: true,
            current: usage.autoMessagesUsage.current,
            limit: usage.autoMessagesUsage.limit,
            planName: usage.plan.name
        };
    } catch (err) {
        console.warn(`Aviso verificando cuota auto mensajes para ${companyId}:`, err.message);
        return { allowed: true, current: 0, limit: -1, planName: '' };
    }
}

async function incrementAutoMessages(companyId) {
    try {
        await pool.query('UPDATE companies SET auto_messages_count = COALESCE(auto_messages_count, 0) + 1 WHERE id = $1', [companyId]);
        const usage = await getCompanyUsage(companyId);
        return {
            current: usage.autoMessagesUsage.current,
            limit: usage.autoMessagesUsage.limit,
            isExhausted: usage.autoMessagesUsage.isExhausted,
            planName: usage.plan.name
        };
    } catch (err) {
        console.warn(`Aviso incrementando auto mensajes para ${companyId}:`, err.message);
        return { current: 0, limit: -1, isExhausted: false, planName: '' };
    }
}

module.exports = {
    pool,
    query: (text, params) => pool.query(text, params),
    initDb,
    getCompanyProducts,
    getCompanyActivePromotions,
    getPlans,
    getPlanById,
    createPlan,
    updatePlan,
    deletePlan,
    assignPlanToCompany,
    resetCompanyQuota,
    getCompanyUsage,
    checkGeminiQuota,
    incrementGeminiCalls,
    checkAutoMessagesQuota,
    incrementAutoMessages,
    DEFAULT_SYSTEM_ROLES,
};
