'use strict';

const { pool, initDb } = require('../db');
const dataStore = require('../dataStore');
const authService = require('../authService');

async function runVerification() {
    console.log('--- 1. Inicializando DB y cargando datos ---');
    await initDb();
    const appData = await dataStore.loadAllAppData();
    console.log(`✅ Empresas cargadas: ${appData.companies.length}`);
    for (const c of appData.companies) {
        console.log(`   🏢 ${c.name} (${c.id}) -> Reglas: ${c.rules.length}, Leads: ${c.leads.length}, Docs: ${c.library.length}`);
    }

    console.log('\n--- 2. Probando Login de Administrador (Oscar) ---');
    const loginRes = await authService.login('oscar', 'Lajama18*..');
    console.log(`✅ Login exitoso: ${loginRes.user.fullName} (${loginRes.user.email})`);
    console.log(`   Empresas asignadas: ${loginRes.companies.map(c => c.name).join(', ')}`);
    console.log(`   Token generado: ${loginRes.token.slice(0, 20)}...`);

    const activeCompany = loginRes.companies[0];
    const userContext = await authService.getUserContext(loginRes.user.id, activeCompany.id);
    console.log(`✅ Contexto de usuario en ${activeCompany.name}:`);
    console.log(`   Rol: ${userContext.membership.roleName} (Owner: ${userContext.membership.isOwner})`);
    console.log(`   Permisos totales: ${userContext.membership.permissions.length}`);

    console.log('\n--- 3. Creando nuevo colaborador de ventas con contraseña temporal ---');
    const tempEmail = 'agente_prueba_' + Date.now() + '@empresa.com';
    const tempPassword = 'TempPass123!*';
    const newMember = await authService.addTeamMember(activeCompany.id, loginRes.user.id, {
        fullName: 'Laura Agente',
        email: tempEmail,
        phone: '573009988776',
        roleId: 'role_sales_agent',
        password: tempPassword
    });
    console.log(`✅ Colaborador creado: ${newMember.fullName} (${newMember.email})`);

    console.log('\n--- 4. Probando Login del nuevo colaborador ---');
    const memberLogin = await authService.login(tempEmail, tempPassword);
    console.log(`✅ Login de colaborador exitoso: ${memberLogin.user.fullName}`);
    const memberContext = await authService.getUserContext(memberLogin.user.id, activeCompany.id);
    console.log(`   Rol asignado: ${memberContext.membership.roleName}`);
    console.log(`   Permisos asignados: ${JSON.stringify(memberContext.membership.permissions)}`);

    console.log('\n--- 5. Actualizando Rol a Gestor de Contenidos ---');
    await authService.updateTeamMemberRole(activeCompany.id, loginRes.user.id, memberLogin.user.id, 'role_content_manager');
    const updatedContext = await authService.getUserContext(memberLogin.user.id, activeCompany.id);
    console.log(`✅ Nuevo Rol: ${updatedContext.membership.roleName}`);
    console.log(`   Nuevos Permisos: ${JSON.stringify(updatedContext.membership.permissions)}`);

    console.log('\n--- 6. Limpiando colaborador de prueba ---');
    await authService.removeTeamMember(activeCompany.id, loginRes.user.id, memberLogin.user.id);
    console.log('✅ Colaborador de prueba eliminado correctamente.');

    console.log('\n=============================================');
    console.log('🎉 TODAS LAS VERIFICACIONES PASARON CON ÉXITO');
    console.log('=============================================');
    process.exit(0);
}

runVerification().catch(err => {
    console.error('❌ Error en verificación:', err);
    process.exit(1);
});
