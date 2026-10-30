<script>
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
  import { hasPermission } from '../../stores/auth';
  import { formatDate } from '../../utils/formatters';

  function openEditRole(member) {
    editingMember.set({
      id: member.id,
      name: member.fullName || member.email,
      currentRoleId: member.roleId
    });
    isEditRoleModalOpen.set(true);
  }

  function handleDeleteMember(member) {
    const name = member.fullName || member.email;
    if (confirm(`¿Estás seguro de eliminar a ${name} de esta empresa? Perderá el acceso de inmediato.`)) {
      deleteMember(member.id, name);
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
          onclick={() => isInviteModalOpen.set(true)}
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
            {#each $teamMembers as member (member.id)}
              {@const initial = (member.fullName || member.email || 'U').charAt(0).toUpperCase()}
              <tr>
                <td>
                  <div class="member-user-cell">
                    <span class="member-avatar">{initial}</span>
                    <div>
                      <strong>{member.fullName || 'Sin Nombre'}</strong>
                      <div style="font-size: 0.75rem; color: var(--text-dim);">ID: {member.id}</div>
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
                        onclick={() => handleDeleteMember(member)} 
                        title="Eliminar de la empresa"
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

  <!-- Roles y Permisos Disponibles -->
  <div class="team-section-card" style="margin-top: 32px;">
    <h3 style="font-size: 1.1rem; color: #fff; margin-bottom: 16px;">Roles y Permisos Granulares Disponibles</h3>
    <div class="roles-display-grid">
      {#each $companyRoles as r (r.id)}
        <div class="role-card">
          <div class="role-card-header">
            <span class="role-badge {r.is_system_default ? r.id : 'custom-role'}">{r.name}</span>
            <span style="font-size: 0.7rem; color: {r.is_system_default ? 'var(--text-dim)' : '#a855f7'};">
              {r.is_system_default ? 'Sistema' : 'Personalizado'}
            </span>
          </div>
          <p class="role-card-desc">{r.description || 'Sin descripción.'}</p>
          <div class="role-card-perms">
            {#each (r.permissions || []) as perm}
              <span class="perm-chip">{perm}</span>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
</section>

<style>
  .team-section-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: 24px;
    margin-top: 20px;
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
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }
</style>
