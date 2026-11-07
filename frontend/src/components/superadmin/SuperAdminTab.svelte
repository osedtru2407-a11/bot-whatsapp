<!-- frontend/src/components/superadmin/SuperAdminTab.svelte -->
<script>
  import { onMount } from 'svelte';
  import {
    adminStats,
    adminCompanies,
    adminUsers,
    isSuperadminLoading,
    loadAllSuperAdminData,
    disconnectCompanyWhatsApp,
    deleteCompany,
    deleteUser,
    toggleUserSuperadmin
  } from '../../stores/superadmin';
  import { currentUser, isSuperadmin } from '../../stores/auth';
  import { activeTab } from '../../stores/ui';

  // Modales
  import CompanyModalAdmin from './CompanyModalAdmin.svelte';
  import GeminiModalAdmin from './GeminiModalAdmin.svelte';
  import CleanDataModalAdmin from './CleanDataModalAdmin.svelte';
  import UserModalAdmin from './UserModalAdmin.svelte';
  import ResetPasswordModalAdmin from './ResetPasswordModalAdmin.svelte';
  import UserCompaniesModalAdmin from './UserCompaniesModalAdmin.svelte';

  let currentSubTab = $state('companies'); // 'companies' | 'users'
  let searchQuery = $state('');

  // Estados de Modales
  let isCompanyModalOpen = $state(false);
  let selectedCompanyForEdit = $state(null);

  let isGeminiModalOpen = $state(false);
  let selectedCompanyForGemini = $state(null);

  let isCleanModalOpen = $state(false);
  let selectedCompanyForClean = $state(null);

  let isUserModalOpen = $state(false);
  let selectedUserForEdit = $state(null);

  let isResetPassModalOpen = $state(false);
  let selectedUserForReset = $state(null);

  let isUserCompaniesModalOpen = $state(false);
  let selectedUserForCompanies = $state(null);

  $effect(() => {
    if (!$isSuperadmin) {
      activeTab.set('tab-rules');
    }
  });

  onMount(() => {
    if ($isSuperadmin) {
      loadAllSuperAdminData();
    } else {
      activeTab.set('tab-rules');
    }
  });

  // Filtrado de empresas
  let filteredCompanies = $derived.by(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return $adminCompanies;
    return $adminCompanies.filter(c => 
      (c.name || '').toLowerCase().includes(q) ||
      (c.id || '').toLowerCase().includes(q) ||
      (c.creatorEmail || '').toLowerCase().includes(q)
    );
  });

  // Filtrado de usuarios
  let filteredUsers = $derived.by(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return $adminUsers;
    return $adminUsers.filter(u =>
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.phone || '').toLowerCase().includes(q)
    );
  });

  // Acciones Empresas
  function openCreateCompany() {
    selectedCompanyForEdit = null;
    isCompanyModalOpen = true;
  }

  function openEditCompany(company) {
    selectedCompanyForEdit = company;
    isCompanyModalOpen = true;
  }

  function openGeminiConfig(company) {
    selectedCompanyForGemini = company;
    isGeminiModalOpen = true;
  }

  function openCleanData(company) {
    selectedCompanyForClean = company;
    isCleanModalOpen = true;
  }

  async function handleDisconnectWhatsApp(company) {
    if (!confirm(`¿Desvincular WhatsApp de "${company.name}"?\nEl bot quedará desconectado y esperará un nuevo escaneo de código QR.`)) {
      return;
    }
    await disconnectCompanyWhatsApp(company.id);
  }

  async function handleDeleteCompany(company) {
    if ($adminCompanies.length <= 1) {
      alert('No puedes eliminar la única empresa activa en el sistema.');
      return;
    }
    if (!confirm(`⚠️ ¿ELIMINAR DEFINITIVAMENTE la empresa "${company.name}"?\nSe borrarán sus flujos, biblioteca, contactos y mensajes de la base de datos.`)) {
      return;
    }
    await deleteCompany(company.id);
  }

  // Acciones Usuarios
  function openCreateUser() {
    selectedUserForEdit = null;
    isUserModalOpen = true;
  }

  function openEditUser(user) {
    selectedUserForEdit = user;
    isUserModalOpen = true;
  }

  function openResetPassword(user) {
    selectedUserForReset = user;
    isResetPassModalOpen = true;
  }

  function openUserCompanies(user) {
    selectedUserForCompanies = user;
    isUserCompaniesModalOpen = true;
  }

  async function handleToggleSuperadmin(user) {
    const targetStatus = !user.is_superadmin;
    const actionText = targetStatus ? 'promover a SUPERUSUARIO' : 'quitar privilegios de Superusuario a';
    if (!confirm(`¿Estás seguro de ${actionText} ${user.full_name || user.email}?`)) {
      return;
    }
    await toggleUserSuperadmin(user.id, targetStatus);
  }

  async function handleDeleteUser(user) {
    if ($currentUser?.id === user.id) {
      alert('No puedes eliminar tu propia cuenta de usuario en uso.');
      return;
    }
    if (!confirm(`¿Eliminar al usuario ${user.full_name} (${user.email}) del sistema?\nEsta acción es irreversible.`)) {
      return;
    }
    await deleteUser(user.id);
  }
</script>

{#if $isSuperadmin}
<section id="tab-superadmin" class="tab-content active superadmin-view">
  <!-- Encabezado Principal del Panel Superadmin -->
  <div class="superadmin-header-card">
    <div class="header-left">
      <div class="crown-badge-icon">👑</div>
      <div>
        <div class="header-title-row">
          <h2>Panel de Superusuario Global</h2>
          <span class="badge-root">SISTEMA ROOT</span>
        </div>
        <p class="section-desc">
          Centro de administración técnica y programación para todas las empresas, cuentas globales, credenciales de Gemini y mantenimiento del servidor.
        </p>
      </div>
    </div>
    <div class="header-actions">
      <button
        type="button"
        class="btn btn-secondary btn-refresh"
        onclick={() => loadAllSuperAdminData()}
        disabled={$isSuperadminLoading}
        title="Recargar todos los datos del sistema"
      >
        <span>{$isSuperadminLoading ? '⏳ Actualizando...' : '🔄 Actualizar Datos'}</span>
      </button>
    </div>
  </div>

  <!-- Métricas Globales del Sistema -->
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-icon-wrapper comp-icon">🏢</div>
      <div class="stat-info">
        <span class="stat-value">{$adminStats.companiesCount || 0}</span>
        <span class="stat-label">Empresas Registradas</span>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-icon-wrapper user-icon">👥</div>
      <div class="stat-info">
        <span class="stat-value">{$adminStats.usersCount || 0}</span>
        <span class="stat-label">Usuarios Globales</span>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-icon-wrapper super-icon">⭐</div>
      <div class="stat-info">
        <span class="stat-value">{$adminStats.superadminsCount || 0}</span>
        <span class="stat-label">Superadministradores</span>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-icon-wrapper bot-icon">🤖</div>
      <div class="stat-info">
        <span class="stat-value">{$adminStats.activeBotsCount || 0}</span>
        <span class="stat-label">Bots WhatsApp Activos</span>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-icon-wrapper leads-icon">🎯</div>
      <div class="stat-info">
        <span class="stat-value">{$adminStats.leadsCount || 0}</span>
        <span class="stat-label">Prospectos en Sistema</span>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-icon-wrapper msg-icon">💬</div>
      <div class="stat-info">
        <span class="stat-value">{$adminStats.messagesCount || 0}</span>
        <span class="stat-label">Mensajes Registrados</span>
      </div>
    </div>
  </div>

  <!-- Subnavegación: Empresas vs Usuarios -->
  <div class="subtabs-bar">
    <div class="tabs-group">
      <button
        type="button"
        class="subtab-btn {currentSubTab === 'companies' ? 'active' : ''}"
        onclick={() => { currentSubTab = 'companies'; searchQuery = ''; }}
      >
        <span>🏢 Empresas del Sistema ({$adminCompanies.length})</span>
      </button>
      <button
        type="button"
        class="subtab-btn {currentSubTab === 'users' ? 'active' : ''}"
        onclick={() => { currentSubTab = 'users'; searchQuery = ''; }}
      >
        <span>👥 Usuarios Globales ({$adminUsers.length})</span>
      </button>
    </div>

    <!-- Barra de Búsqueda y Acción Rápida -->
    <div class="subtabs-actions">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input
          type="text"
          placeholder={currentSubTab === 'companies' ? 'Buscar empresa por nombre...' : 'Buscar usuario por nombre o correo...'}
          bind:value={searchQuery}
        />
        {#if searchQuery}
          <button type="button" class="btn-clear-search" onclick={() => searchQuery = ''}>✕</button>
        {/if}
      </div>

      {#if currentSubTab === 'companies'}
        <button type="button" class="btn btn-primary btn-add" onclick={openCreateCompany}>
          <span>➕ Nueva Empresa</span>
        </button>
      {:else}
        <button type="button" class="btn btn-primary btn-add" onclick={openCreateUser}>
          <span>➕ Nuevo Usuario</span>
        </button>
      {/if}
    </div>
  </div>

  <!-- Contenido: Vista de Empresas -->
  {#if currentSubTab === 'companies'}
    <div class="data-table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>Empresa / Marca</th>
            <th>Propietario / Creador</th>
            <th>Estado WhatsApp</th>
            <th>Equipo</th>
            <th>Flujos & Leads</th>
            <th>Inteligencia Artificial</th>
            <th class="text-right">Acciones de Superadmin</th>
          </tr>
        </thead>
        <tbody>
          {#if filteredCompanies.length === 0}
            <tr>
              <td colspan="7" class="empty-table-row">
                No se encontraron empresas con el término de búsqueda.
              </td>
            </tr>
          {/if}
          {#each filteredCompanies as comp}
            <tr>
              <td>
                <div class="comp-cell-name">
                  <strong>{comp.name}</strong>
                  <code class="cell-id">{comp.id}</code>
                </div>
              </td>
              <td>
                <span class="text-secondary">{comp.creatorEmail || comp.creatorName || 'Sistema'}</span>
              </td>
              <td>
                {#if comp.whatsappStatus === 'ready'}
                  <span class="status-pill ready">● Conectado</span>
                {:else if comp.whatsappStatus === 'qr_ready'}
                  <span class="status-pill qr">● Esperando QR</span>
                {:else}
                  <span class="status-pill idle">● Desconectado</span>
                {/if}
              </td>
              <td>
                <span class="badge-counter">{comp.memberCount || 0} usuarios</span>
              </td>
              <td>
                <div class="stats-mini-cell">
                  <span>{comp.rulesCount || 0} rutas</span>
                  <span class="dot-separator">•</span>
                  <span>{comp.leadsCount || 0} prospectos</span>
                </div>
              </td>
              <td>
                {#if comp.isCustomGeminiKey}
                  <span class="gemini-pill custom" title="Clave exclusiva configurada">
                    🔑 Exclusiva ({comp.geminiApiKeyMasked})
                  </span>
                {:else if comp.hasGlobalKey}
                  <span class="gemini-pill global" title="Usa la clave global del servidor">
                    🌐 Global ({comp.geminiModel || 'Flash Lite'})
                  </span>
                {:else}
                  <span class="gemini-pill no-key">⚠️ Sin clave</span>
                {/if}
              </td>
              <td class="text-right">
                <div class="actions-row">
                  <button
                    type="button"
                    class="btn-action-icon gemini-action"
                    onclick={() => openGeminiConfig(comp)}
                    title="Configurar API Key de Gemini exclusiva para esta empresa"
                  >
                    🔑 Gemini
                  </button>

                  <button
                    type="button"
                    class="btn-action-icon disconnect-action"
                    onclick={() => handleDisconnectWhatsApp(comp)}
                    title="Desvincular WhatsApp (cierra sesión y borra credenciales en disco)"
                  >
                    🔌 WhatsApp
                  </button>

                  <button
                    type="button"
                    class="btn-action-icon clean-action"
                    onclick={() => openCleanData(comp)}
                    title="Limpiar Data (Purgar mensajes y prospectos)"
                  >
                    🧹 Limpiar
                  </button>

                  <button
                    type="button"
                    class="btn-action-icon edit-action"
                    onclick={() => openEditCompany(comp)}
                    title="Editar nombre de la empresa"
                  >
                    ✏️
                  </button>

                  <button
                    type="button"
                    class="btn-action-icon delete-action"
                    onclick={() => handleDeleteCompany(comp)}
                    title="Eliminar empresa definitivamente"
                  >
                    🗑️
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <!-- Contenido: Vista de Usuarios Globales -->
  {#if currentSubTab === 'users'}
    <div class="data-table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Contacto</th>
            <th>Rol Global</th>
            <th>Estado</th>
            <th>Empresas Vinculadas</th>
            <th class="text-right">Acciones de Superadmin</th>
          </tr>
        </thead>
        <tbody>
          {#if filteredUsers.length === 0}
            <tr>
              <td colspan="6" class="empty-table-row">
                No se encontraron usuarios con el término de búsqueda.
              </td>
            </tr>
          {/if}
          {#each filteredUsers as user}
            <tr>
              <td>
                <div class="user-cell-info">
                  <strong>{user.full_name || 'Sin Nombre'}</strong>
                  <span class="cell-email">{user.email}</span>
                </div>
              </td>
              <td>
                <span class="text-secondary">{user.phone || 'No registrado'}</span>
              </td>
              <td>
                {#if user.is_superadmin}
                  <span class="global-role-pill superadmin" title="Tiene acceso total al sistema como superusuario">
                    ⭐ Superusuario
                  </span>
                {:else}
                  <span class="global-role-pill normal">
                    👤 Normal
                  </span>
                {/if}
              </td>
              <td>
                {#if user.is_active}
                  <span class="status-pill ready">Activo</span>
                {:else}
                  <span class="status-pill idle">Inactivo</span>
                {/if}
              </td>
              <td>
                <div class="memberships-chips">
                  {#if !user.memberships || user.memberships.length === 0}
                    <span class="no-memberships-tag">Sin empresas</span>
                  {:else}
                    {#each user.memberships as m}
                      <span class="company-chip" title={`${m.roleName || m.roleId}${m.isOwner ? ' (Owner)' : ''}`}>
                        🏢 {m.companyName}
                        {#if m.isOwner}
                          <span class="chip-owner-star" title="Propietario">👑</span>
                        {/if}
                      </span>
                    {/each}
                  {/if}
                </div>
              </td>
              <td class="text-right">
                <div class="actions-row">
                  <!-- Botón toggle superadmin -->
                  <button
                    type="button"
                    class="btn-action-icon {user.is_superadmin ? 'demote-action' : 'promote-action'}"
                    onclick={() => handleToggleSuperadmin(user)}
                    title={user.is_superadmin ? 'Quitar privilegios de Superusuario' : 'Hacer Superusuario global'}
                  >
                    {user.is_superadmin ? 'Quitar ⭐' : 'Hacer ⭐'}
                  </button>

                  <!-- Botón gestionar empresas -->
                  <button
                    type="button"
                    class="btn-action-icon comp-action"
                    onclick={() => openUserCompanies(user)}
                    title="Vincular o desvincular empresas"
                  >
                    🏢 Empresas
                  </button>

                  <!-- Botón reset password -->
                  <button
                    type="button"
                    class="btn-action-icon pass-action"
                    onclick={() => openResetPassword(user)}
                    title="Restablecer o generar contraseña"
                  >
                    🔑 Clave
                  </button>

                  <!-- Botón editar usuario -->
                  <button
                    type="button"
                    class="btn-action-icon edit-action"
                    onclick={() => openEditUser(user)}
                    title="Editar datos del usuario"
                  >
                    ✏️
                  </button>

                  <!-- Botón eliminar usuario -->
                  <button
                    type="button"
                    class="btn-action-icon delete-action"
                    onclick={() => handleDeleteUser(user)}
                    disabled={$currentUser?.id === user.id}
                    title={$currentUser?.id === user.id ? 'No puedes eliminarte a ti mismo' : 'Eliminar usuario'}
                  >
                    🗑️
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<!-- Modales del Panel Superadmin -->
<CompanyModalAdmin
  isOpen={isCompanyModalOpen}
  company={selectedCompanyForEdit}
  onClose={() => { isCompanyModalOpen = false; selectedCompanyForEdit = null; }}
/>

<GeminiModalAdmin
  isOpen={isGeminiModalOpen}
  company={selectedCompanyForGemini}
  onClose={() => { isGeminiModalOpen = false; selectedCompanyForGemini = null; }}
/>

<CleanDataModalAdmin
  isOpen={isCleanModalOpen}
  company={selectedCompanyForClean}
  onClose={() => { isCleanModalOpen = false; selectedCompanyForClean = null; }}
/>

<UserModalAdmin
  isOpen={isUserModalOpen}
  user={selectedUserForEdit}
  companies={$adminCompanies}
  onClose={() => { isUserModalOpen = false; selectedUserForEdit = null; }}
/>

<ResetPasswordModalAdmin
  isOpen={isResetPassModalOpen}
  user={selectedUserForReset}
  onClose={() => { isResetPassModalOpen = false; selectedUserForReset = null; }}
/>

<UserCompaniesModalAdmin
  isOpen={isUserCompaniesModalOpen}
  user={selectedUserForCompanies}
  allCompanies={$adminCompanies}
  onClose={() => { isUserCompaniesModalOpen = false; selectedUserForCompanies = null; }}
/>
{/if}

<style>
  .superadmin-view {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  /* Encabezado */
  .superadmin-header-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.9));
    border: 1px solid rgba(245, 158, 11, 0.25);
    border-radius: var(--radius-lg);
    padding: 24px 28px;
    gap: 20px;
    flex-wrap: wrap;
  }
  .header-left {
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }
  .crown-badge-icon {
    font-size: 2.2rem;
    line-height: 1;
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.3);
    padding: 10px;
    border-radius: var(--radius-md);
  }
  .header-title-row {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 6px;
  }
  .header-title-row h2 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 700;
    color: #fff;
  }
  .badge-root {
    background: linear-gradient(135deg, #f59e0b, #d97706);
    color: #000;
    font-size: 0.7rem;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 9999px;
    letter-spacing: 0.5px;
  }
  .section-desc {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-secondary);
    max-width: 680px;
    line-height: 1.4;
  }
  .btn-refresh {
    font-size: 0.85rem;
    padding: 8px 16px;
  }

  /* Grid de Métricas */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
  }
  .stat-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 16px 18px;
    display: flex;
    align-items: center;
    gap: 14px;
    transition: transform 0.2s ease, border-color 0.2s ease;
  }
  .stat-card:hover {
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-2px);
  }
  .stat-icon-wrapper {
    font-size: 1.5rem;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }
  .comp-icon { background: rgba(56, 189, 248, 0.12); }
  .user-icon { background: rgba(16, 185, 129, 0.12); }
  .super-icon { background: rgba(245, 158, 11, 0.12); }
  .bot-icon { background: rgba(168, 85, 247, 0.12); }
  .leads-icon { background: rgba(236, 72, 153, 0.12); }
  .msg-icon { background: rgba(99, 102, 241, 0.12); }

  .stat-info {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .stat-value {
    font-size: 1.3rem;
    font-weight: 700;
    color: #fff;
    line-height: 1.1;
  }
  .stat-label {
    font-size: 0.74rem;
    color: var(--text-secondary);
    margin-top: 2px;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }

  /* Subpestañas */
  .subtabs-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 12px;
    gap: 16px;
    flex-wrap: wrap;
  }
  .tabs-group {
    display: flex;
    gap: 8px;
  }
  .subtab-btn {
    background: transparent;
    border: none;
    padding: 8px 16px;
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all 0.2s ease;
  }
  .subtab-btn:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.05);
  }
  .subtab-btn.active {
    color: #fbbf24;
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  .subtabs-actions {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }
  .search-box {
    display: flex;
    align-items: center;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 4px 10px;
    width: 280px;
  }
  .search-icon {
    font-size: 0.85rem;
    margin-right: 6px;
    color: var(--text-muted);
  }
  .search-box input {
    border: none;
    background: transparent;
    color: #fff;
    font-size: 0.82rem;
    width: 100%;
    outline: none;
  }
  .btn-clear-search {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 0.75rem;
    cursor: pointer;
    padding: 2px 4px;
  }
  .btn-add {
    font-size: 0.82rem;
    padding: 6px 14px;
  }

  /* Tabla de Datos */
  .data-table-container {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    overflow-x: auto;
  }
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.84rem;
  }
  .data-table th {
    background: rgba(15, 23, 42, 0.75);
    padding: 12px 16px;
    text-align: left;
    font-size: 0.76rem;
    font-weight: 700;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid var(--border-subtle);
  }
  .data-table td {
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    vertical-align: middle;
  }
  .data-table tr:hover td {
    background: rgba(255, 255, 255, 0.02);
  }
  .text-right {
    text-align: right;
  }
  .empty-table-row {
    text-align: center;
    padding: 32px 16px;
    color: var(--text-muted);
    font-style: italic;
  }

  .comp-cell-name {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .cell-id {
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  .user-cell-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .cell-email {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .status-pill {
    padding: 3px 8px;
    border-radius: 9999px;
    font-size: 0.72rem;
    font-weight: 600;
    display: inline-block;
  }
  .status-pill.ready {
    background: rgba(34, 197, 94, 0.15);
    color: #4ade80;
  }
  .status-pill.qr {
    background: rgba(234, 179, 8, 0.15);
    color: #facc15;
  }
  .status-pill.idle {
    background: rgba(100, 116, 139, 0.2);
    color: #94a3b8;
  }

  .badge-counter {
    background: rgba(255, 255, 255, 0.06);
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.74rem;
    color: var(--text-secondary);
  }

  .stats-mini-cell {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-secondary);
    font-size: 0.78rem;
  }
  .dot-separator {
    color: var(--text-muted);
  }

  .gemini-pill {
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.74rem;
    font-weight: 600;
    display: inline-block;
  }
  .gemini-pill.custom {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.3);
  }
  .gemini-pill.global {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.3);
  }
  .gemini-pill.no-key {
    background: rgba(239, 68, 68, 0.15);
    color: #fca5a5;
  }

  .global-role-pill {
    padding: 3px 8px;
    border-radius: 9999px;
    font-size: 0.72rem;
    font-weight: 700;
    display: inline-block;
  }
  .global-role-pill.superadmin {
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.3));
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.4);
  }
  .global-role-pill.normal {
    background: rgba(255, 255, 255, 0.06);
    color: #94a3b8;
  }

  .memberships-chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    max-width: 280px;
  }
  .company-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-subtle);
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 0.72rem;
    color: var(--text-secondary);
  }
  .chip-owner-star {
    font-size: 0.7rem;
    color: #fbbf24;
  }
  .no-memberships-tag {
    font-size: 0.74rem;
    color: var(--text-muted);
    font-style: italic;
  }

  /* Acciones en la tabla */
  .actions-row {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    align-items: center;
  }
  .btn-action-icon {
    padding: 5px 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: 0.74rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  .btn-action-icon:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    border-color: rgba(255, 255, 255, 0.2);
  }
  .btn-action-icon:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .gemini-action:hover {
    background: rgba(245, 158, 11, 0.15) !important;
    border-color: rgba(245, 158, 11, 0.4) !important;
    color: #fbbf24 !important;
  }
  .disconnect-action:hover {
    background: rgba(234, 179, 8, 0.15) !important;
    border-color: rgba(234, 179, 8, 0.4) !important;
    color: #facc15 !important;
  }
  .clean-action:hover {
    background: rgba(239, 68, 68, 0.15) !important;
    border-color: rgba(239, 68, 68, 0.4) !important;
    color: #f87171 !important;
  }
  .delete-action:hover {
    background: rgba(239, 68, 68, 0.2) !important;
    border-color: rgba(239, 68, 68, 0.5) !important;
    color: #ef4444 !important;
  }
  .promote-action {
    background: rgba(245, 158, 11, 0.1);
    color: #fbbf24;
    border-color: rgba(245, 158, 11, 0.3);
  }
  .promote-action:hover {
    background: rgba(245, 158, 11, 0.2) !important;
    color: #fef08a !important;
  }
  .demote-action {
    background: rgba(239, 68, 68, 0.1);
    color: #fca5a5;
    border-color: rgba(239, 68, 68, 0.3);
  }
  .demote-action:hover {
    background: rgba(239, 68, 68, 0.2) !important;
    color: #ef4444 !important;
  }
</style>

