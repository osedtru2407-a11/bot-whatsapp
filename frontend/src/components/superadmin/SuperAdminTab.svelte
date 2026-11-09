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
  import { plans, loadPlans, deletePlan } from '../../stores/plans';

  // Modales
  import CompanyModalAdmin from './CompanyModalAdmin.svelte';
  import GeminiModalAdmin from './GeminiModalAdmin.svelte';
  import CleanDataModalAdmin from './CleanDataModalAdmin.svelte';
  import UserModalAdmin from './UserModalAdmin.svelte';
  import ResetPasswordModalAdmin from './ResetPasswordModalAdmin.svelte';
  import UserCompaniesModalAdmin from './UserCompaniesModalAdmin.svelte';
  import PlanModalAdmin from './PlanModalAdmin.svelte';
  import AssignPlanModalAdmin from './AssignPlanModalAdmin.svelte';

  let currentSubTab = $state('companies'); // 'companies' | 'users' | 'plans'
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

  let isPlanModalOpen = $state(false);
  let selectedPlanForEdit = $state(null);

  let isAssignPlanModalOpen = $state(false);
  let selectedCompanyForAssignPlan = $state(null);

  $effect(() => {
    if (!$isSuperadmin) {
      activeTab.set('tab-rules');
    }
  });

  onMount(() => {
    if ($isSuperadmin) {
      loadAllSuperAdminData();
      loadPlans();
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

  // Empresas con cuota agotada (para alerta de superadmin)
  let companiesWithExhaustedQuota = $derived.by(() => {
    return ($adminCompanies || []).filter(c => {
      const gLimit = Number(c.geminiLimit ?? c.gemini_limit ?? -1);
      const gCalls = Number(c.geminiCallsCount ?? c.gemini_calls_count ?? 0);
      const aLimit = Number(c.autoMessagesLimit ?? c.auto_messages_limit ?? -1);
      const aMsgs = Number(c.autoMessagesCount ?? c.auto_messages_count ?? 0);
      const isGeminiExhausted = gLimit > 0 && gCalls >= gLimit;
      const isAutoExhausted = aLimit > 0 && aMsgs >= aLimit;
      return isGeminiExhausted || isAutoExhausted;
    });
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

  // Filtrado de planes
  let filteredPlans = $derived.by(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return $plans;
    return $plans.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.id || '').toLowerCase().includes(q)
    );
  });

  // Acciones de Planes SaaS
  function openCreatePlan() {
    selectedPlanForEdit = null;
    isPlanModalOpen = true;
  }

  function openEditPlan(plan) {
    selectedPlanForEdit = plan;
    isPlanModalOpen = true;
  }

  async function handleDeletePlan(plan) {
    if (plan.is_default || plan.isDefault) {
      alert('No puedes eliminar el plan predeterminado del sistema');
      return;
    }
    const ok = window.confirm(`¿Estás seguro de eliminar el plan "${plan.name}"? Las empresas asociadas pasarán al plan demo.`);
    if (ok) {
      await deletePlan(plan.id);
    }
  }

  function openAssignPlan(company) {
    selectedCompanyForAssignPlan = company;
    isAssignPlanModalOpen = true;
  }

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

  <!-- Alerta Global de Cuotas Agotadas para Superadmin -->
  {#if companiesWithExhaustedQuota.length > 0}
    <div class="superadmin-quota-alert-banner">
      <div class="sa-alert-icon">⚠️</div>
      <div class="sa-alert-content">
        <h4 class="sa-alert-title">¡Alerta de Consumo de Plan! ({companiesWithExhaustedQuota.length} empresa{companiesWithExhaustedQuota.length > 1 ? 's' : ''} con límite alcanzado)</h4>
        <p class="sa-alert-desc">
          Las siguientes empresas han alcanzado el 100% de su cuota y tienen la atención automática restringida:
          {#each companiesWithExhaustedQuota as exComp, idx}
            <strong>{exComp.name}</strong> ({exComp.geminiCallsCount || 0}/{exComp.geminiLimit || 0} llamadas IA){#if idx < companiesWithExhaustedQuota.length - 1}, {/if}
          {/each}
        </p>
      </div>
      <div class="sa-alert-actions">
        {#each companiesWithExhaustedQuota as exComp}
          <button
            type="button"
            class="btn-sa-manage-plan"
            onclick={() => openAssignPlan(exComp)}
          >
            💎 Gestionar {exComp.name}
          </button>
        {/each}
      </div>
    </div>
  {/if}

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

  <!-- Subnavegación: Empresas vs Usuarios vs Planes -->
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
      <button
        type="button"
        class="subtab-btn {currentSubTab === 'plans' ? 'active' : ''}"
        onclick={() => { currentSubTab = 'plans'; searchQuery = ''; }}
      >
        <span>💎 Planes SaaS ({$plans.length})</span>
      </button>
    </div>

    <!-- Barra de Búsqueda y Acción Rápida -->
    <div class="subtabs-actions">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input
          type="text"
          placeholder={currentSubTab === 'companies' ? 'Buscar empresa por nombre...' : (currentSubTab === 'users' ? 'Buscar usuario por nombre o correo...' : 'Buscar plan por nombre...')}
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
      {:else if currentSubTab === 'users'}
        <button type="button" class="btn btn-primary btn-add" onclick={openCreateUser}>
          <span>➕ Nuevo Usuario</span>
        </button>
      {:else if currentSubTab === 'plans'}
        <button type="button" class="btn btn-primary btn-add" onclick={openCreatePlan}>
          <span>➕ Crear Nuevo Plan</span>
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
            <th>Plan SaaS & Consumo</th>
            <th>Equipo</th>
            <th>Flujos & Leads</th>
            <th>Inteligencia Artificial</th>
            <th class="text-right">Acciones de Superadmin</th>
          </tr>
        </thead>
        <tbody>
          {#if filteredCompanies.length === 0}
            <tr>
              <td colspan="8" class="empty-table-row">
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
                <div class="plan-cell-info">
                  <div class="plan-pill-row">
                    <span class="plan-pill {comp.planPrice > 0 ? 'paid' : 'demo'}">
                      💎 {comp.planName || 'Plan Demo'}
                    </span>
                    {#if (Number(comp.geminiLimit) > 0 && Number(comp.geminiCallsCount || 0) >= Number(comp.geminiLimit)) || (Number(comp.autoMessagesLimit) > 0 && Number(comp.autoMessagesCount || 0) >= Number(comp.autoMessagesLimit))}
                      <span class="quota-exhausted-badge">⚠️ Cuota Agotada</span>
                    {/if}
                  </div>
                  <div class="quota-progress-mini">
                    <span class="quota-text">
                      IA: <strong>{comp.geminiCallsCount || 0}</strong>/{comp.geminiLimit <= 0 ? '∞' : comp.geminiLimit}
                      {#if comp.geminiLimitType === 'total'}<small class="quota-subtag">(vitalicio)</small>{/if}
                    </span>
                    <span class="quota-text">
                      Reglas: <strong>{comp.autoMessagesCount || 0}</strong>/{comp.autoMessagesLimit <= 0 ? '∞' : comp.autoMessagesLimit}
                    </span>
                  </div>
                </div>
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
                    class="btn-action-icon plan-action"
                    onclick={() => openAssignPlan(comp)}
                    title="Asignar Plan SaaS o Reiniciar Cuota"
                  >
                    💎 Plan
                  </button>

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

  <!-- Contenido: Vista de Planes SaaS -->
  {#if currentSubTab === 'plans'}
    <div class="plans-admin-grid">
      {#if filteredPlans.length === 0}
        <div class="empty-table-card">
          <p>No se encontraron planes SaaS con el término de búsqueda.</p>
          <button type="button" class="btn btn-primary" onclick={openCreatePlan}>
            ➕ Crear Primer Plan
          </button>
        </div>
      {/if}
      {#each filteredPlans as p}
        <div class="plan-admin-card {p.is_default || p.isDefault ? 'is-default' : ''}">
          <div class="plan-card-top">
            <div class="plan-badges">
              {#if p.is_default || p.isDefault}
                <span class="badge badge-default">⭐ Predeterminado</span>
              {/if}
              {#if p.is_active === false || p.isActive === false}
                <span class="badge badge-inactive">Inactivo</span>
              {:else}
                <span class="badge badge-active">Activo</span>
              {/if}
            </div>
            <div class="plan-price-display">
              {#if Number(p.price) === 0}
                <span class="free-text">Gratuito / Demo</span>
              {:else}
                <span class="currency">$</span>
                <span class="price-val">{p.price}</span>
                <span class="period">/{p.currency || 'USD'}</span>
              {/if}
            </div>
          </div>

          <h3 class="plan-card-title">{p.name}</h3>
          {#if p.description}
            <p class="plan-card-desc">{p.description}</p>
          {/if}

          <div class="plan-limits-box">
            <div class="limit-row">
              <span class="limit-icon">🤖</span>
              <div class="limit-info">
                <strong>Gemini IA:</strong>
                <span>
                  {#if Number(p.gemini_limit !== undefined ? p.gemini_limit : p.geminiLimit) <= 0}
                    <strong class="highlight-unlimited">Ilimitado</strong>
                  {:else}
                    <strong>{p.gemini_limit !== undefined ? p.gemini_limit : p.geminiLimit}</strong> consultas ({p.gemini_limit_type === 'total' || p.geminiLimitType === 'total' ? 'Totales / Demo' : 'al mes'})
                  {/if}
                </span>
              </div>
            </div>

            <div class="limit-row">
              <span class="limit-icon">⚡</span>
              <div class="limit-info">
                <strong>Mensajes Automáticos:</strong>
                <span>
                  {#if Number(p.auto_messages_limit !== undefined ? p.auto_messages_limit : p.autoMessagesLimit) <= 0 || p.auto_messages_limit_type === 'unlimited' || p.autoMessagesLimitType === 'unlimited'}
                    <strong class="highlight-unlimited">Ilimitado</strong>
                  {:else}
                    <strong>{p.auto_messages_limit !== undefined ? p.auto_messages_limit : p.autoMessagesLimit}</strong> respuestas ({p.auto_messages_limit_type === 'total' || p.autoMessagesLimitType === 'total' ? 'Totales / Vitalicio' : 'al mes'})
                  {/if}
                </span>
              </div>
            </div>

            {#if p.custom_warning_message || p.customWarningMessage}
              <div class="limit-row warning-box">
                <span class="limit-icon">⚠️</span>
                <div class="limit-info">
                  <strong>Aviso de cuota agotada:</strong>
                  <p class="warning-sample">"{p.custom_warning_message || p.customWarningMessage}"</p>
                </div>
              </div>
            {/if}
          </div>

          <div class="plan-card-footer">
            <button
              type="button"
              class="btn-plan-action edit"
              onclick={() => openEditPlan(p)}
            >
              ✏️ Editar Plan
            </button>
            {#if !(p.is_default || p.isDefault)}
              <button
                type="button"
                class="btn-plan-action delete"
                onclick={() => handleDeletePlan(p)}
              >
                🗑️ Eliminar
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

<!-- Modales del Panel Superadmin -->
<CompanyModalAdmin
  isOpen={isCompanyModalOpen}
  company={selectedCompanyForEdit}
  onClose={() => { isCompanyModalOpen = false; selectedCompanyForEdit = null; }}
/>

<PlanModalAdmin
  isOpen={isPlanModalOpen}
  plan={selectedPlanForEdit}
  onClose={() => { isPlanModalOpen = false; selectedPlanForEdit = null; }}
/>

<AssignPlanModalAdmin
  isOpen={isAssignPlanModalOpen}
  company={selectedCompanyForAssignPlan}
  onClose={() => { isAssignPlanModalOpen = false; selectedCompanyForAssignPlan = null; }}
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
  .plan-action:hover {
    background: rgba(14, 165, 233, 0.2) !important;
    border-color: rgba(14, 165, 233, 0.5) !important;
    color: #38bdf8 !important;
  }
  .demote-action:hover {
    background: rgba(239, 68, 68, 0.2) !important;
    color: #ef4444 !important;
  }

  /* Plan Cell in Companies Table */
  .plan-cell-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .plan-pill {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 700;
    width: fit-content;
  }
  .plan-pill.paid {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.25));
    border: 1px solid rgba(168, 85, 247, 0.4);
    color: #c084fc;
  }
  .plan-pill.demo {
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #34d399;
  }
  .quota-progress-mini {
    display: flex;
    flex-direction: column;
    font-size: 0.72rem;
    color: var(--text-secondary);
  }
  .quota-text strong {
    color: #f3f4f6;
  }
  .quota-subtag {
    color: #9ca3af;
    font-size: 0.68rem;
    font-style: italic;
  }

  /* Grid de Planes SaaS */
  .plans-admin-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 20px;
  }
  .empty-table-card {
    grid-column: 1 / -1;
    background: var(--bg-card);
    border: 1px dashed var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 40px;
    text-align: center;
    color: var(--text-muted);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
  .plan-admin-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    position: relative;
    transition: transform 0.2s ease, border-color 0.2s ease;
  }
  .plan-admin-card:hover {
    border-color: rgba(56, 189, 248, 0.3);
  }
  .plan-admin-card.is-default {
    border-color: rgba(245, 158, 11, 0.4);
    box-shadow: 0 0 15px rgba(245, 158, 11, 0.08);
  }
  .plan-card-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .plan-badges {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .badge {
    padding: 2px 8px;
    border-radius: 9999px;
    font-size: 0.72rem;
    font-weight: 700;
  }
  .badge-default {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.35);
  }
  .badge-active {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
  }
  .badge-inactive {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
  }
  .plan-price-display {
    text-align: right;
  }
  .free-text {
    font-size: 1.1rem;
    font-weight: 700;
    color: #34d399;
  }
  .plan-price-display .currency {
    font-size: 0.95rem;
    color: #94a3b8;
    vertical-align: top;
  }
  .plan-price-display .price-val {
    font-size: 1.5rem;
    font-weight: 800;
    color: #fff;
  }
  .plan-price-display .period {
    font-size: 0.75rem;
    color: #94a3b8;
  }
  .plan-card-title {
    margin: 0;
    font-size: 1.15rem;
    color: #f3f4f6;
    font-weight: 700;
  }
  .plan-card-desc {
    margin: 0;
    font-size: 0.82rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }
  .plan-limits-box {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 4px;
  }
  .limit-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 0.82rem;
  }
  .limit-icon {
    font-size: 1.1rem;
    line-height: 1.2;
  }
  .limit-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .limit-info strong {
    color: #e2e8f0;
  }
  .limit-info span {
    color: #94a3b8;
  }
  .highlight-unlimited {
    color: #38bdf8 !important;
  }
  .warning-box {
    border-top: 1px dashed var(--border-subtle);
    padding-top: 8px;
  }
  .warning-sample {
    margin: 2px 0 0 0;
    font-size: 0.75rem;
    color: #cbd5e1;
    font-style: italic;
    line-height: 1.3;
  }
  .plan-card-footer {
    display: flex;
    gap: 8px;
    margin-top: auto;
    padding-top: 12px;
    border-top: 1px solid var(--border-subtle);
  }
  .btn-plan-action {
    flex: 1;
    padding: 7px 12px;
    border-radius: var(--radius-sm);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--border-subtle);
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-secondary);
    transition: all 0.15s ease;
  }
  .btn-plan-action:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
  .btn-plan-action.edit:hover {
    background: rgba(56, 189, 248, 0.15);
    border-color: rgba(56, 189, 248, 0.4);
    color: #38bdf8;
  }
  .btn-plan-action.delete {
    flex: 0 0 auto;
  }
  .btn-plan-action.delete:hover {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.4);
    color: #f87171;
  }

  /* Alerta Global de Cuota para Superadmin */
  .superadmin-quota-alert-banner {
    display: flex;
    align-items: center;
    gap: 16px;
    background: linear-gradient(90deg, rgba(239, 68, 68, 0.22) 0%, rgba(245, 158, 11, 0.16) 100%);
    border: 1px solid rgba(239, 68, 68, 0.45);
    border-left: 5px solid #ef4444;
    border-radius: var(--radius-md);
    padding: 14px 18px;
    margin-bottom: 24px;
    box-shadow: 0 4px 18px rgba(239, 68, 68, 0.15);
    animation: fadeIn 0.2s ease-out;
  }
  .sa-alert-icon {
    font-size: 1.6rem;
    line-height: 1;
    flex-shrink: 0;
  }
  .sa-alert-content {
    flex: 1;
    min-width: 0;
  }
  .sa-alert-title {
    margin: 0 0 4px 0;
    font-size: 0.98rem;
    font-weight: 700;
    color: #fca5a5;
  }
  .sa-alert-desc {
    margin: 0;
    font-size: 0.85rem;
    color: #e2e8f0;
    line-height: 1.45;
  }
  .sa-alert-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .btn-sa-manage-plan {
    padding: 7px 12px;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 6px;
    color: #fff;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .btn-sa-manage-plan:hover {
    background: rgba(255, 255, 255, 0.22);
    border-color: rgba(255, 255, 255, 0.4);
    transform: translateY(-1px);
  }
  .plan-pill-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 4px;
  }
  .quota-exhausted-badge {
    padding: 2px 7px;
    background: rgba(239, 68, 68, 0.25);
    border: 1px solid rgba(239, 68, 68, 0.5);
    border-radius: 9999px;
    color: #fca5a5;
    font-size: 0.72rem;
    font-weight: 700;
    animation: pulseBadge 2s infinite;
  }
  @keyframes pulseBadge {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.65; }
  }
</style>

