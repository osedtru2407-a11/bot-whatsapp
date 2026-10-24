'use strict';

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.PG_HOST || process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || process.env.PG_USER || 'oscar',
    password: process.env.POSTGRES_PW || process.env.POSTGRES_PASSWORD || process.env.PG_PASSWORD,
    database: process.env.POSTGRES_DB || process.env.PG_DATABASE || 'whatsapp_sales_bot',
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
        description: 'Acceso total y control absoluto de todas las funciones, vinculación de WhatsApp, roles y usuarios.',
        is_system_default: true,
        permissions: [
            'rules:view', 'rules:create', 'rules:edit', 'rules:delete',
            'schedules:view', 'schedules:create', 'schedules:delete',
            'simulator:use',
            'quick_send:use',
            'leads:view', 'leads:pause', 'leads:delete',
            'library:view', 'library:upload', 'library:edit', 'library:toggle', 'library:delete',
            'settings:view', 'settings:edit',
            'whatsapp:connect', 'whatsapp:disconnect', 'whatsapp:toggle',
            'team:view', 'team:manage', 'roles:manage'
        ]
    },
    {
        id: 'role_sales_agent',
        name: '💼 Asesor / Agente de Ventas',
        description: 'Atiende clientes, consulta prospectos (CRM), realiza envíos rápidos y prueba el simulador.',
        is_system_default: true,
        permissions: [
            'leads:view', 'leads:pause',
            'quick_send:use',
            'simulator:use'
        ]
    },
    {
        id: 'role_content_manager',
        name: '✍️ Gestor de Contenidos y Flujos',
        description: 'Diseña rutas de respuesta, gestiona la biblioteca de conocimiento y programa envíos masivos.',
        is_system_default: true,
        permissions: [
            'rules:view', 'rules:create', 'rules:edit', 'rules:delete',
            'library:view', 'library:upload', 'library:edit', 'library:toggle', 'library:delete',
            'schedules:view', 'schedules:create', 'schedules:delete',
            'simulator:use'
        ]
    },
    {
        id: 'role_viewer',
        name: '👀 Supervisor / Auditor (Solo Lectura)',
        description: 'Visualiza métricas, prospectos, flujos y programación sin poder editar ni eliminar.',
        is_system_default: true,
        permissions: [
            'rules:view',
            'schedules:view',
            'leads:view',
            'library:view',
            'settings:view'
        ]
    }
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
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(user_id, company_id)
            );
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
                fallback_message TEXT,
                gemini_enabled BOOLEAN DEFAULT TRUE,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
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
                received_files JSONB DEFAULT '[]'::jsonb,
                last_interaction TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(company_id, phone)
            );
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

        // 10. Sembrar roles preestablecidos del sistema si no existen
        for (const role of DEFAULT_SYSTEM_ROLES) {
            await client.query(`
                INSERT INTO roles (id, company_id, name, description, is_system_default, permissions)
                VALUES ($1, NULL, $2, $3, $4, $5)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    permissions = EXCLUDED.permissions;
            `, [role.id, role.name, role.description, role.is_system_default, JSON.stringify(role.permissions)]);
        }

        // Índices para optimizar velocidad de consultas frecuentes
        await client.query(`CREATE INDEX IF NOT EXISTS idx_rules_company ON rules(company_id);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_leads_company ON leads(company_id);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_leads_company_phone ON leads(company_id, phone);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_schedules_company_status ON schedules(company_id, status);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_library_company ON library_documents(company_id);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_company_users_user ON company_users(user_id);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_company_users_company ON company_users(company_id);`);

        await client.query('COMMIT');
        console.log('✅ Esquema relacional PostgreSQL inicializado exitosamente.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error inicializando esquema PostgreSQL:', err);
        throw err;
    } finally {
        client.release();
    }
}

module.exports = {
    pool,
    query: (text, params) => pool.query(text, params),
    initDb,
    DEFAULT_SYSTEM_ROLES
};
