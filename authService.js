'use strict';

require('dotenv').config();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, DEFAULT_SYSTEM_ROLES } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'ws_sales_bot_jwt_secret_key_2026_super_secure';
const JWT_EXPIRES_IN = '7d';

/**
 * Cifra una contraseña con bcrypt
 */
async function hashPassword(plainTextPassword) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(plainTextPassword, salt);
}

/**
 * Compara contraseña en texto plano con el hash
 */
async function comparePassword(plainTextPassword, hash) {
    return bcrypt.compare(plainTextPassword, hash);
}

/**
 * Genera un token JWT para un usuario
 */
function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            userId: user.id,
            email: user.email,
            fullName: user.full_name
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

/**
 * Verifica un token JWT y devuelve el payload decodificado
 */
function verifyToken(token) {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.id && decoded.userId) {
        decoded.id = decoded.userId;
    }
    return decoded;
}

/**
 * Iniciar sesión de usuario
 */
    async function login(emailOrUsername, password, targetCompanyId = null) {
        const cleanIdentifier = (emailOrUsername || '').trim().toLowerCase();
        if (!cleanIdentifier || !password) {
            throw new Error('Debes ingresar tu usuario o correo y contraseña.');
        }

        const userRes = await pool.query(
            `SELECT * FROM users 
         WHERE (LOWER(email) = $1 OR LOWER(split_part(email, '@', 1)) = $1 OR LOWER(full_name) = $1)
           AND is_active = TRUE`,
            [cleanIdentifier]
        );

        if (userRes.rows.length === 0) {
            throw new Error('Credenciales inválidas. Usuario/correo o contraseña incorrectos.');
        }

        const user = userRes.rows[0];
        const passwordMatches = await comparePassword(password, user.password_hash);
        if (!passwordMatches) {
            throw new Error('Credenciales inválidas. Correo o contraseña incorrectos.');
        }

        // Obtener empresas a las que este usuario tiene acceso
        const companies = await getUserCompanies(user.id);
        const token = generateToken(user);

        let activeCompany = targetCompanyId ? companies.find(c => c.id === targetCompanyId) : null;
        if (!activeCompany && companies.length > 0) {
            activeCompany = companies[0];
        }

        const membership = activeCompany ? {
            companyId: activeCompany.id,
            roleId: activeCompany.roleId,
            roleName: activeCompany.roleName,
            isOwner: activeCompany.isOwner,
            permissions: activeCompany.permissions
        } : null;

        return {
            user: {
                id: user.id,
                email: user.email,
                username: user.email ? user.email.split('@')[0] : cleanIdentifier,
                fullName: user.full_name,
                phone: user.phone,
                mustChangePassword: Boolean(user.must_change_password)
            },
            token,
        companies,
            activeCompany: activeCompany || null,
            membership,
            permissions: activeCompany ? activeCompany.permissions : []
        };
    }

    /**
     * Registrar un nuevo usuario (y crear su primera empresa como Administrador/Owner)
     */
    async function register(fullName, email, password, companyName = 'Mi Empresa') {
        const cleanEmail = (email || '').trim().toLowerCase();
        const cleanName = (fullName || '').trim();
        const cleanCompName = (companyName || '').trim() || 'Mi Empresa';

        if (!cleanEmail || !password || !cleanName) {
            throw new Error('Nombre completo, correo y contraseña son obligatorios.');
        }

        if (password.length < 6) {
            throw new Error('La contraseña debe tener al menos 6 caracteres.');
        }

        // Verificar si ya existe
        const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [cleanEmail]);
        if (existing.rows.length > 0) {
            throw new Error('El correo electrónico ya está registrado.');
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const userId = 'usr_' + Date.now();
            const passwordHash = await hashPassword(password);

            // 1. Crear usuario
            await client.query(`
            INSERT INTO users (id, email, password_hash, full_name, is_active, must_change_password)
            VALUES ($1, $2, $3, $4, TRUE, FALSE)
        `, [userId, cleanEmail, passwordHash, cleanName]);

            // 2. Crear su empresa inicial
            const companyId = 'comp_' + Date.now();
            await client.query(`
            INSERT INTO companies (id, name, created_by)
            VALUES ($1, $2, $3)
        `, [companyId, cleanCompName, userId]);

            // 3. Crear membresía como Owner y Administrador
            const membershipId = `cu_${companyId}_${userId}`;
            await client.query(`
            INSERT INTO company_users (id, user_id, company_id, role_id, is_owner, status)
            VALUES ($1, $2, $3, 'role_admin', TRUE, 'active')
        `, [membershipId, userId, companyId]);

            // 4. Crear configuración inicial de la empresa
            await client.query(`
            INSERT INTO company_settings (company_id, business_name, fallback_message)
            VALUES ($1, $2, $3)
        `, [companyId, cleanCompName, `¡Hola! Gracias por comunicarte con ${cleanCompName}. Escribe *menu* para ver las opciones disponibles.`]);

            await client.query('COMMIT');

            const user = { id: userId, email: cleanEmail, full_name: cleanName };
            const token = generateToken(user);
            const companies = await getUserCompanies(userId);

            return {
                user: {
                    id: userId,
                    email: cleanEmail,
                    fullName: cleanName,
                    mustChangePassword: false
                },
                token,
                companies,
                activeCompanyId: companyId
            };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    /**
     * Obtener las empresas a las que un usuario pertenece junto con su rol
     */
    async function getUserCompanies(userId) {
        const res = await pool.query(`
        SELECT 
            c.id,
            c.name,
            cu.is_owner,
            cu.status,
            r.id as role_id,
            r.name as role_name,
            r.permissions
        FROM company_users cu
        JOIN companies c ON c.id = cu.company_id
        JOIN roles r ON r.id = cu.role_id
        WHERE cu.user_id = $1 AND cu.status = 'active'
        ORDER BY cu.is_owner DESC, c.name ASC
    `, [userId]);

        return res.rows.map(row => ({
            id: row.id,
            name: row.name,
            isOwner: Boolean(row.is_owner),
            roleId: row.role_id,
            roleName: row.role_name,
            permissions: Array.isArray(row.permissions) ? row.permissions : (typeof row.permissions === 'string' ? JSON.parse(row.permissions) : [])
        }));
    }

    /**
     * Obtener perfil completo y contexto de permisos para una empresa específica
     */
    async function getUserContext(userId, companyId) {
        const userRes = await pool.query('SELECT id, email, full_name, phone, must_change_password FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) return null;

        const user = userRes.rows[0];
        const companies = await getUserCompanies(userId);

        let activeCompany = companies.find(c => c.id === companyId);
        if (!activeCompany && companies.length > 0) {
            activeCompany = companies[0];
        }

        return {
            user: {
                id: user.id,
                email: user.email,
                fullName: user.full_name,
                phone: user.phone,
                mustChangePassword: Boolean(user.must_change_password)
            },
            companies,
            activeCompany: activeCompany || null,
            membership: activeCompany ? {
                roleId: activeCompany.roleId,
                roleName: activeCompany.roleName,
                isOwner: activeCompany.isOwner,
                permissions: activeCompany.permissions
            } : null,
            permissions: activeCompany ? activeCompany.permissions : []
        };
    }

    /**
     * El administrador agrega un nuevo colaborador a la empresa con contraseña temporal
     */
    async function addTeamMember(companyId, adminUserId, memberData) {
        const { email, fullName, temporaryPassword, password, roleId } = memberData;

        const cleanEmail = (email || '').trim().toLowerCase();
        const cleanName = (fullName || '').trim();
        const cleanPass = (temporaryPassword || password || '').trim();
        const cleanRole = (roleId || '').trim();

        if (!cleanEmail || !cleanName || !cleanPass || !cleanRole) {
            throw new Error('Todos los campos son obligatorios: Nombre, correo, contraseña temporal y rol.');
        }

        if (cleanPass.length < 4) {
            throw new Error('La contraseña temporal debe tener al menos 4 caracteres.');
        }

        // Verificar que el usuario administrador tenga permiso en la empresa
        const adminCheck = await pool.query(`
        SELECT cu.is_owner, r.permissions
        FROM company_users cu
        JOIN roles r ON r.id = cu.role_id
        WHERE cu.user_id = $1 AND cu.company_id = $2 AND cu.status = 'active'
    `, [adminUserId, companyId]);

        if (adminCheck.rows.length === 0) {
            throw new Error('No tienes permisos en esta empresa.');
        }

        const adminPerms = adminCheck.rows[0].permissions || [];
        const isOwner = adminCheck.rows[0].is_owner;
        if (!isOwner && !adminPerms.includes('team:manage') && !adminPerms.includes('*')) {
            throw new Error('No tienes permisos para administrar miembros de equipo en esta empresa.');
        }

        // Verificar que el rol asignado exista
        const roleCheck = await pool.query(
            'SELECT id, name FROM roles WHERE id = $1 AND (company_id IS NULL OR company_id = $2)',
            [cleanRole, companyId]
        );
        if (roleCheck.rows.length === 0) {
            throw new Error('El rol seleccionado no es válido.');
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Buscar si el usuario ya existe en el sistema
            let targetUserId;
            const userExistRes = await client.query('SELECT id FROM users WHERE LOWER(email) = $1', [cleanEmail]);

            if (userExistRes.rows.length > 0) {
                targetUserId = userExistRes.rows[0].id;
                // Actualizar nombre si era placeholder y establecer la contraseña temporal
                const passwordHash = await hashPassword(cleanPass);
                await client.query(`
                UPDATE users SET 
                    password_hash = $1,
                    full_name = COALESCE($2, full_name),
                    must_change_password = TRUE,
                    updated_at = NOW()
                WHERE id = $3
            `, [passwordHash, cleanName, targetUserId]);
            } else {
                // Crear nuevo usuario con contraseña temporal
                targetUserId = 'usr_' + Date.now();
                const passwordHash = await hashPassword(cleanPass);
                await client.query(`
                INSERT INTO users (id, email, password_hash, full_name, is_active, must_change_password)
                VALUES ($1, $2, $3, $4, TRUE, TRUE)
            `, [targetUserId, cleanEmail, passwordHash, cleanName]);
            }

            // Crear o actualizar membresía en esta empresa
            const membershipId = `cu_${companyId}_${targetUserId}`;
            await client.query(`
            INSERT INTO company_users (id, user_id, company_id, role_id, is_owner, status)
            VALUES ($1, $2, $3, $4, FALSE, 'active')
            ON CONFLICT (user_id, company_id) DO UPDATE SET
                role_id = EXCLUDED.role_id,
                status = 'active';
        `, [membershipId, targetUserId, companyId, cleanRole]);

            await client.query('COMMIT');

            return {
                userId: targetUserId,
                email: cleanEmail,
                fullName: cleanName,
                roleId: cleanRole,
                roleName: roleCheck.rows[0].name,
                temporaryPassword: cleanPass
            };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    /**
     * Listar miembros de una empresa
     */
    async function getTeamMembers(companyId) {
        const res = await pool.query(`
        SELECT 
            u.id as user_id,
            u.email,
            u.full_name,
            u.phone,
            u.is_active,
            cu.is_owner,
            cu.status,
            cu.created_at as joined_at,
            r.id as role_id,
            r.name as role_name,
            r.description as role_description
        FROM company_users cu
        JOIN users u ON u.id = cu.user_id
        JOIN roles r ON r.id = cu.role_id
        WHERE cu.company_id = $1
        ORDER BY cu.is_owner DESC, u.full_name ASC
    `, [companyId]);

        return res.rows.map(row => ({
            userId: row.user_id,
            email: row.email,
            fullName: row.full_name,
            phone: row.phone,
            isActive: Boolean(row.is_active),
            isOwner: Boolean(row.is_owner),
            status: row.status,
            joinedAt: row.joined_at,
            roleId: row.role_id,
            roleName: row.role_name,
            roleDescription: row.role_description
        }));
    }

    /**
     * Actualizar rol de un miembro
     */
    async function updateTeamMemberRole(companyId, adminUserId, targetUserId, newRoleId) {
        if (adminUserId === targetUserId) {
            throw new Error('No puedes cambiar tu propio rol en la empresa.');
        }

        const res = await pool.query(`
        UPDATE company_users
        SET role_id = $1
        WHERE company_id = $2 AND user_id = $3
        RETURNING *;
    `, [newRoleId, companyId, targetUserId]);

        if (res.rows.length === 0) {
            throw new Error('Miembro no encontrado en esta empresa.');
        }
        return res.rows[0];
    }

    /**
     * Eliminar un miembro de la empresa
     */
    async function removeTeamMember(companyId, adminUserId, targetUserId) {
        if (adminUserId === targetUserId) {
            throw new Error('No puedes eliminarte a ti mismo de la empresa.');
        }

        const check = await pool.query(
            'SELECT is_owner FROM company_users WHERE company_id = $1 AND user_id = $2',
            [companyId, targetUserId]
        );

        if (check.rows.length === 0) {
            throw new Error('Miembro no encontrado.');
        }

        if (check.rows[0].is_owner) {
            throw new Error('No se puede eliminar al propietario original de la empresa.');
        }

        await pool.query('DELETE FROM company_users WHERE company_id = $1 AND user_id = $2', [companyId, targetUserId]);
        return { success: true };
    }

    /**
     * Obtener todos los roles disponibles para una empresa (roles por defecto + personalizados)
     */
    async function getCompanyRoles(companyId) {
        const res = await pool.query(`
        SELECT id, company_id, name, description, is_system_default, permissions
        FROM roles
        WHERE company_id IS NULL OR company_id = $1
        ORDER BY is_system_default DESC, name ASC;
    `, [companyId]);

        return res.rows.map(r => ({
            id: r.id,
            companyId: r.company_id,
            name: r.name,
            description: r.description,
            isSystemDefault: Boolean(r.is_system_default),
            permissions: Array.isArray(r.permissions) ? r.permissions : (typeof r.permissions === 'string' ? JSON.parse(r.permissions) : [])
        }));
    }

    /**
     * Crear un rol personalizado para una empresa
     */
    async function createCustomRole(companyId, roleData) {
        const { name, description, permissions } = roleData;
        const cleanName = (name || '').trim();
        if (!cleanName) {
            throw new Error('El nombre del rol es obligatorio.');
        }

        const roleId = 'role_' + Date.now();
        const permsArray = Array.isArray(permissions) ? permissions : [];

        const res = await pool.query(`
        INSERT INTO roles (id, company_id, name, description, is_system_default, permissions)
        VALUES ($1, $2, $3, $4, FALSE, $5)
        RETURNING *;
    `, [roleId, companyId, cleanName, description || '', JSON.stringify(permsArray)]);

        return res.rows[0];
    }

    /**
     * Cambiar contraseña de usuario
     */
    async function changePassword(userId, currentPassword, newPassword) {
        if (!newPassword || newPassword.length < 6) {
            throw new Error('La nueva contraseña debe tener al menos 6 caracteres.');
        }

        const userRes = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) {
            throw new Error('Usuario no encontrado.');
        }

        const currentMatches = await comparePassword(currentPassword, userRes.rows[0].password_hash);
        if (!currentMatches) {
            throw new Error('La contraseña actual es incorrecta.');
        }

        const newHash = await hashPassword(newPassword);
        await pool.query(`
        UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = NOW()
        WHERE id = $2
    `, [newHash, userId]);

        return { success: true };
    }

    /**
     * Middleware para autenticar requests con JWT
     */
    function authenticateToken(req, res, next) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

        if (!token) {
            return res.status(401).json({ error: 'Acceso no autorizado. Inicia sesión para continuar.' });
        }

        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) {
                return res.status(403).json({ error: 'Sesión expirada o token inválido. Inicia sesión nuevamente.' });
            }
            req.user = decoded;
            next();
        });
    }

    module.exports = {
        login,
        register,
        getUserCompanies,
        getUserContext,
        addTeamMember,
        getTeamMembers,
        updateTeamMemberRole,
        removeTeamMember,
        getCompanyRoles,
        createCustomRole,
        changePassword,
        authenticateToken,
        generateToken,
        verifyToken
    };
