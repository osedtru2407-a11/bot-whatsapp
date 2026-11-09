<script>
  import { onDestroy } from 'svelte';
  import { 
    teamMembers, 
    companyRoles, 
    isInviteModalOpen, 
    isEditRoleModalOpen, 
    isCustomRoleModalOpen, 
    editingMember, 
    deleteMember, 
    loadTeamData 
  } from '../../stores/team';
  import { hasPermission, currentUser } from '../../stores/auth';
  import { settings } from '../../stores/settings';
  import { showToast } from '../../stores/toast';
  import { formatDate } from '../../utils/formatters';
  import { 
    getPermissionMeta, 
    groupPermissionsByCategory, 
    isFullAdmin 
  } from '../../utils/permissions';
  import RoleDetailModal from './RoleDetailModal.svelte';
  import Modal from '../common/Modal.svelte';

  let selectedRoleForDetail = $state(null);
  let isRoleDetailOpen = $state(false);

  // Alerta estilizada de privacidad al añadir colaboradores con número personal
  let isPersonalWarningOpen = $state(false);
  let warningCountdown = $state(5);
  let warningTimer = null;

  function handleOpenInvite() {
    const isPersonalPhone = ($settings?.phoneUsageType === 'personal_and_business');
    if (isPersonalPhone) {
      warningCountdown = 5;
      isPersonalWarningOpen = true;
      if (warningTimer) clearInterval(warningTimer);
      warningTimer = setInterval(() => {
        if (warningCountdown > 0) {
          warningCountdown--;
        } else {
          clearInterval(warningTimer);
          warningTimer = null;
        }
      }, 1000);
    } else {
      isInviteModalOpen.set(true);
    }
  }

  function handleCloseWarning() {
    if (warningTimer) {
      clearInterval(warningTimer);
      warningTimer = null;
    }
    isPersonalWarningOpen = false;
  }

  function handleProceedAfterWarning() {
    if (warningCountdown > 0) return;
    handleCloseWarning();
    isInviteModalOpen.set(true);
  }

  onDestroy(() => {
    if (warningTimer) {
      clearInterval(warningTimer);
      warningTimer = null;
    }
  });

  function openRoleDetail(role) {
    selectedRoleForDetail = role;
    isRoleDetailOpen = true;
  }

  function closeRoleDetail() {
    selectedRoleForDetail = null;
    isRoleDetailOpen = false;
  }

  function openEditRole(member) {
    const memberId = member.id || member.userId;
    editingMember.set({
      id: memberId,
      name: member.fullName || member.email,
      currentRoleId: member.roleId,
      currentPhone: member.phone || ''
    });
    isEditRoleModalOpen.set(true);
  }

  function handleDeleteMember(member) {
    const memberId = member.id || member.userId;
    const name = member.fullName || member.email;

    if ($teamMembers.length <= 1) {
      showToast('No es posible eliminar al único usuario de la empresa. La empresa no puede quedar sin miembros.', 'error');
      return;
    }

    if (memberId === $currentUser?.id) {
      showToast('No puedes eliminarte a ti mismo de la empresa.', 'error');
      return;
    }

    if (member.isOwner) {
      showToast('No se puede eliminar al propietario original de la empresa.', 'error');
      return;
    }

    if (confirm(`¿Estás seguro de eliminar a ${name} de esta empresa? Perderá el acceso de inmediato.`)) {
      deleteMember(memberId, name);
    }
  }
</script>

<section id="tab-team" class="tab-content active">
  <div class="content-toolbar">
    <div>
      <h2>Equipo y Roles de la Empresa</h2>
      <p class="section-desc">Gestiona qué miembros pueden acceder a esta empresa, ver prospectos, editar flujos y enviar mensajes.</p>
    </div>
    <div style="display: flex; gap: 8px;">
      {#if $hasPermission('roles:manage')}
        <button 
          type="button" 
          class="btn btn-secondary" 
          onclick={() => isCustomRoleModalOpen.set(true)}
        >
          🛡️ Crear Rol Personalizado
        </button>
      {/if}
      {#if $hasPermission('team:manage')}
        <button 
          type="button" 
          class="btn btn-primary" 
          onclick={handleOpenInvite}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Agregar Colaborador
        </button>
      {/if}
    </div>
  </div>

  <!-- Miembros del Equipo -->
  <div class="team-section-card">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <h3 style="font-size: 1.1rem; color: #fff;">Miembros de la Empresa ({$teamMembers.length})</h3>
    </div>

    {#if $teamMembers.length === 1}
      <div class="sole-member-alert">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="alert-icon">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span><strong>Empresa con único usuario:</strong> Esta empresa solo tiene un colaborador registrado. No se puede eliminar ni dejar la empresa sin miembros administradores.</span>
      </div>
    {/if}

    {#if $teamMembers.length === 0}
      <div style="text-align: center; padding: 40px; color: var(--text-dim);">
        No hay colaboradores registrados en esta empresa.
      </div>
    {:else}
      <div class="leads-table-container">
        <table class="leads-table">
          <thead>
            <tr>
              <th>Colaborador</th>
              <th>Contacto</th>
              <th>Rol Asignado</th>
              <th>Estado</th>
              <th>Fecha de Ingreso</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {#each $teamMembers as member (member.id || member.userId)}
              {@const initial = (member.fullName || member.email || 'U').charAt(0).toUpperCase()}
              {@const memberId = member.id || member.userId}
              {@const isOnlyMember = $teamMembers.length <= 1}
              {@const isSelf = memberId === $currentUser?.id}
              {@const isOwner = Boolean(member.isOwner)}
              {@const cannotDelete = isOnlyMember || isSelf || isOwner}
              {@const deleteTooltip = isOnlyMember 
                ? 'No se puede eliminar al único usuario de la empresa (la empresa no puede quedar sin miembros)' 
                : isSelf 
                  ? 'No puedes eliminarte a ti mismo de la empresa' 
                  : isOwner 
                    ? 'No se puede eliminar al propietario original de la empresa' 
                    : 'Eliminar de la empresa'}
              <tr>
                <td>
                  <div class="member-user-cell">
                    <span class="member-avatar">{initial}</span>
                    <div>
                      <strong>{member.fullName || 'Sin Nombre'}</strong>
                      {#if isSelf}
                        <span class="self-tag">(Tú)</span>
                      {/if}
                      {#if isOwner}
                        <span class="owner-tag">Propietario</span>
                      {/if}
                      <div style="font-size: 0.75rem; color: var(--text-dim);">ID: {memberId}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div style="font-size: 0.85rem; color: var(--text-main);">{member.email}</div>
                  <div style="font-size: 0.75rem; color: var(--text-dim); font-family: var(--font-mono);">
                    {member.phone || 'Sin teléfono'}
                  </div>
                </td>
                <td>
                  <span class="role-badge {member.is_system_default ? (member.roleId || 'custom-role') : 'custom-role'}">
                    {member.roleName || 'Colaborador'}
                  </span>
                </td>
                <td>
                  <span style="color: #4ade80; font-size: 0.85rem; font-weight: 500;">● Activo</span>
                </td>
                <td style="color: var(--text-muted); font-size: 0.82rem;">
                  {formatDate(member.joinedAt || member.createdAt, { dateStyle: 'short', timeStyle: undefined })}
                </td>
                <td>
                  <div style="display: flex; gap: 6px;">
                    {#if $hasPermission('team:manage')}
                      <button 
                        type="button" 
                        class="btn btn-outline-sm" 
                        onclick={() => openEditRole(member)} 
                        title="Cambiar rol"
                      >
                        Cambiar Rol
                      </button>
                      <button 
                        type="button" 
                        class="icon-btn delete-btn" 
                        disabled={cannotDelete}
                        onclick={() => handleDeleteMember(member)} 
                        title={deleteTooltip}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>

  <!-- Roles y Permisos Disponibles en Lenguaje Claro -->
  <div class="team-section-card" style="margin-top: 32px;">
    <div class="roles-section-header">
      <div>
        <h3 style="font-size: 1.15rem; color: #fff; margin-bottom: 4px;">🛡️ Roles y Niveles de Acceso del Equipo</h3>
        <p class="section-desc" style="margin: 0; font-size: 0.85rem;">
          Conoce en español y lenguaje claro qué puede ver y hacer cada colaborador en tu empresa, desde ventas y atención hasta administración total.
        </p>
      </div>
      {#if $hasPermission('roles:manage')}
        <button 
          type="button" 
          class="btn btn-secondary" 
          onclick={() => isCustomRoleModalOpen.set(true)}
        >
          🛡️ Crear Rol Personalizado
        </button>
      {/if}
    </div>

    <div class="roles-display-grid">
      {#each $companyRoles as r (r.id)}
        {@const perms = Array.isArray(r.permissions) ? r.permissions : []}
        {@const isAll = isFullAdmin(r)}
        {@const grouped = groupPermissionsByCategory(perms)}
        {@const isSystem = Boolean(r.isSystemDefault || r.is_system_default)}

        <div class="role-card {isAll ? 'admin-card' : ''}">
          <div class="role-card-header">
            <div class="role-card-title-group">
              <span class="role-badge {isSystem ? (r.id || 'custom-role') : 'custom-role'}">{r.name}</span>
              <span class="role-type-tag {isSystem ? 'system' : 'custom'}">
                {isSystem ? 'Sistema' : 'Personalizado'}
              </span>
            </div>
            <span class="role-perms-count-badge {isAll ? 'admin-badge' : ''}">
              {isAll ? '⭐ Acceso Total' : `${perms.length} permisos`}
            </span>
          </div>

          <p class="role-card-desc">{r.description || 'Sin descripción asignada.'}</p>

          <!-- Resumen comprensible de capacidades del rol en español -->
          <div class="role-capabilities-summary">
            {#if isAll}
              <div class="admin-full-box">
                <span class="admin-icon">👑</span>
                <div class="admin-box-text">
                  <strong>Control Total Sin Restricciones</strong>
                  <p>Puede operar WhatsApp, configurar inteligencia artificial, ver y gestionar todos los clientes, programar difusiones y administrar colaboradores.</p>
                </div>
              </div>
            {:else}
              <div class="role-grouped-modules">
                {#each grouped as cat}
                  <div class="module-caps-row">
                    <span class="module-caps-name">{cat.icon} {cat.name}:</span>
                    <div class="module-caps-pills">
                      {#each cat.permissions as perm}
                        <span class="friendly-perm-pill" title={perm.description}>
                          {perm.icon} {perm.shortLabel}
                        </span>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <div class="role-card-footer">
            <button 
              type="button" 
              class="btn-inspect-role" 
              onclick={() => openRoleDetail(r)}
            >
              🔍 Ver qué puede y qué no puede hacer ({perms.length})
            </button>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <!-- Modal interactivo con el desglose comprensible de permisos -->
  <RoleDetailModal 
    role={selectedRoleForDetail} 
    isOpen={isRoleDetailOpen} 
    onClose={closeRoleDetail} 
  />

  <!-- Modal Estilizado de Advertencia: Adición de Colaboradores con Teléfono Personal -->
  {#if isPersonalWarningOpen}
    <Modal
      isOpen={isPersonalWarningOpen}
      title="⚠️ Advertencia de Privacidad: Teléfono Personal en Uso"
      subtitle="Atención: Esta empresa utiliza un número de WhatsApp configurado para uso personal/mixto"
      maxWidth="580px"
      onClose={handleCloseWarning}
    >
      <div class="personal-alert-modal-content">
        <div class="alert-icon-banner">
          <span class="big-warning-icon">🛡️</span>
          <div>
            <h4 class="alert-banner-title">No se recomienda añadir colaboradores con un teléfono personal</h4>
            <p class="alert-banner-desc">Riesgo de exposición de tus mensajes y conversaciones privadas</p>
          </div>
        </div>

        <div class="alert-text-body">
          <p>
            Actualmente tienes configurada esta línea en modo <strong>Uso Mixto (Personal y Negocio)</strong>. Al tratarse de un número personal, el sistema asume que operas como una empresa unipersonal.
          </p>
          <p>
            Si decides invitar a colaboradores o miembros de equipo a esta empresa:
          </p>
          <ul class="alert-reasons-list">
            <li>
              <strong>👁️ Acceso a conversaciones personales:</strong> Los colaboradores vinculados tendrán acceso al panel CRM, al historial de chats y a todos los mensajes y notas de voz entrantes que reciba este dispositivo, incluidos aquellos de tu vida íntima, familiar o doméstica.
            </li>
            <li>
              <strong>🏢 Recomendación de privacidad:</strong> Si vas a delegar la atención a un equipo de trabajo, te recomendamos enfáticamente utilizar una <strong>línea de WhatsApp comercial exclusiva ('Solo Negocio')</strong> para mantener tu vida personal completamente separada y protegida.
            </li>
          </ul>
          <p class="alert-disclaimer">
            Puedes continuar y agregar colaboradores si así lo deseas bajo tu propio criterio, pero eres consciente de que compartirás visibilidad sobre las conversaciones del dispositivo.
          </p>
        </div>
      </div>

      {#snippet actions()}
        <button
          type="button"
          class="btn btn-secondary"
          onclick={handleCloseWarning}
        >
          Cancelar y Proteger Privacidad
        </button>
        <button
          type="button"
          class="btn btn-warning-action"
          disabled={warningCountdown > 0}
          onclick={handleProceedAfterWarning}
        >
          {#if warningCountdown > 0}
            ⏳ Lee con atención ({warningCountdown}s)...
          {:else}
            ⚠️ Entiendo el riesgo y deseo continuar
          {/if}
        </button>
      {/snippet}
    </Modal>
  {/if}
</section>

<style>
  .team-section-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: 24px;
    margin-top: 20px;
  }

  .roles-section-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 12px;
  }

  .member-user-cell {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .member-avatar {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: rgba(37, 211, 102, 0.15);
    color: var(--wa-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 14px;
  }

  .roles-display-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 18px;
  }

  .role-card {
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 18px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    transition: all 0.2s ease;
  }
  .role-card:hover {
    border-color: rgba(56, 189, 248, 0.3);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
  }
  .role-card.admin-card {
    border-color: rgba(234, 179, 8, 0.3);
    background: linear-gradient(180deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%);
  }

  .role-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }

  .role-card-title-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .role-type-tag {
    font-size: 0.68rem;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 9999px;
  }
  .role-type-tag.system {
    background: rgba(148, 163, 184, 0.12);
    color: #94a3b8;
  }
  .role-type-tag.custom {
    background: rgba(168, 85, 247, 0.15);
    color: #c084fc;
    border: 1px solid rgba(168, 85, 247, 0.3);
  }

  .role-perms-count-badge {
    font-size: 0.72rem;
    font-weight: 700;
    padding: 3px 8px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 9999px;
    color: var(--text-muted);
  }
  .role-perms-count-badge.admin-badge {
    background: rgba(234, 179, 8, 0.15);
    color: #facc15;
    border: 1px solid rgba(234, 179, 8, 0.35);
  }

  .role-card-desc {
    font-size: 0.82rem;
    color: var(--text-muted);
    line-height: 1.45;
    margin: 0 0 14px 0;
  }

  .role-capabilities-summary {
    flex: 1;
    margin-bottom: 16px;
  }

  .admin-full-box {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px;
    background: rgba(234, 179, 8, 0.08);
    border: 1px solid rgba(234, 179, 8, 0.2);
    border-radius: var(--radius-sm);
  }
  .admin-icon {
    font-size: 1.5rem;
    line-height: 1;
  }
  .admin-box-text strong {
    display: block;
    font-size: 0.84rem;
    color: #fef08a;
    margin-bottom: 3px;
  }
  .admin-box-text p {
    font-size: 0.78rem;
    color: var(--text-muted);
    line-height: 1.35;
    margin: 0;
  }

  .role-grouped-modules {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .module-caps-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .module-caps-name {
    font-size: 0.74rem;
    font-weight: 700;
    color: #cbd5e1;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .module-caps-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .friendly-perm-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 3px 8px;
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    color: #e2e8f0;
    line-height: 1.2;
    transition: all 0.15s ease;
  }
  .friendly-perm-pill:hover {
    background: rgba(56, 189, 248, 0.15);
    border-color: rgba(56, 189, 248, 0.3);
    color: #fff;
  }

  .role-card-footer {
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .btn-inspect-role {
    width: 100%;
    padding: 8px 12px;
    background: rgba(30, 41, 59, 0.8);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: #38bdf8;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: center;
  }
  .btn-inspect-role:hover {
    background: rgba(56, 189, 248, 0.15);
    border-color: #38bdf8;
    color: #fff;
  }

  /* Aviso de único usuario y protección de borrado */
  .sole-member-alert {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    margin-bottom: 16px;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.28);
    border-radius: var(--radius-sm);
    color: #fef08a;
    font-size: 0.84rem;
    line-height: 1.4;
  }
  .sole-member-alert .alert-icon {
    flex-shrink: 0;
    color: #f59e0b;
  }
  .self-tag {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 6px;
    font-size: 0.68rem;
    font-weight: 700;
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    border-radius: 4px;
    vertical-align: middle;
  }
  .owner-tag {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 6px;
    font-size: 0.68rem;
    font-weight: 700;
    background: rgba(234, 179, 8, 0.15);
    color: #facc15;
    border-radius: 4px;
    vertical-align: middle;
  }
  .delete-btn:disabled {
    opacity: 0.3 !important;
    cursor: not-allowed !important;
    pointer-events: auto !important;
    filter: grayscale(1);
  }
  .delete-btn:disabled:hover {
    background: transparent !important;
    color: inherit !important;
  }

  /* Modal Estilizado de Advertencia de Teléfono Personal */
  .personal-alert-modal-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 4px 2px;
  }
  .alert-icon-banner {
    display: flex;
    align-items: center;
    gap: 14px;
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.35);
    border-radius: var(--radius-md);
    padding: 14px 16px;
  }
  .big-warning-icon {
    font-size: 28px;
    flex-shrink: 0;
  }
  .alert-banner-title {
    margin: 0 0 3px 0;
    font-size: 0.96rem;
    font-weight: 700;
    color: #fef08a;
  }
  .alert-banner-desc {
    margin: 0;
    font-size: 0.82rem;
    color: #fde68a;
    line-height: 1.35;
  }
  .alert-text-body {
    font-size: 0.88rem;
    color: var(--text-main);
    line-height: 1.5;
  }
  .alert-text-body p {
    margin: 0 0 10px 0;
  }
  .alert-reasons-list {
    margin: 10px 0 14px 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .alert-reasons-list li {
    font-size: 0.84rem;
    color: #cbd5e1;
    line-height: 1.45;
  }
  .alert-reasons-list strong {
    color: #fff;
  }
  .alert-disclaimer {
    background: rgba(15, 23, 42, 0.6);
    border-left: 3px solid #f59e0b;
    padding: 10px 14px;
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    font-size: 0.82rem;
    color: var(--text-muted);
    margin-bottom: 0 !important;
  }
  .btn-warning-action {
    background: #d97706 !important;
    border-color: #f59e0b !important;
    color: #fff !important;
    font-weight: 700 !important;
    padding: 9px 18px !important;
    transition: all 0.2s ease !important;
  }
  .btn-warning-action:hover:not(:disabled) {
    background: #b45309 !important;
    box-shadow: 0 0 12px rgba(245, 158, 11, 0.4) !important;
  }
  .btn-warning-action:disabled {
    opacity: 0.55 !important;
    cursor: not-allowed !important;
    background: rgba(120, 53, 15, 0.5) !important;
    border-color: rgba(180, 83, 9, 0.4) !important;
    color: #fde68a !important;
  }
</style>
