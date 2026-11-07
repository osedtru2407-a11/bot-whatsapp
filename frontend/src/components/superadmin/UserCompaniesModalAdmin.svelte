<!-- frontend/src/components/superadmin/UserCompaniesModalAdmin.svelte -->
<script>
  import Modal from '../common/Modal.svelte';
  import { assignUserToCompany, removeUserFromCompany } from '../../stores/superadmin';

  let { isOpen = false, onClose = () => {}, user = null, allCompanies = [] } = $props();

  let selectedCompanyId = $state('');
  let selectedRoleId = $state('role_sales_agent');
  let isOwner = $state(false);
  let isSubmitting = $state(false);

  // Filtrar empresas a las que el usuario aún no pertenece
  let availableCompanies = $derived.by(() => {
    if (!user || !user.memberships) return allCompanies;
    const existingIds = new Set(user.memberships.map(m => m.companyId));
    return allCompanies.filter(c => !existingIds.has(c.id));
  });

  $effect(() => {
    if (isOpen) {
      selectedRoleId = 'role_sales_agent';
      isOwner = false;
      if (availableCompanies.length > 0) {
        selectedCompanyId = availableCompanies[0].id;
      } else {
        selectedCompanyId = '';
      }
    }
  });

  async function handleAssign(e) {
    e.preventDefault();
    if (!user || !selectedCompanyId) return;

    isSubmitting = true;
    try {
      const res = await assignUserToCompany(user.id, selectedCompanyId, selectedRoleId, isOwner);
      if (res.success) {
        // Actualizar memberships localmente para respuesta inmediata en la vista
        const comp = allCompanies.find(c => c.id === selectedCompanyId);
        const roleNames = {
          'role_admin': '👑 Administrador',
          'role_sales_agent': '💼 Asesor / Agente de Ventas',
          'role_content_manager': '✍️ Gestor de Flujos',
          'role_viewer': '👀 Supervisor'
        };
        user.memberships = [
          ...(user.memberships || []),
          {
            companyId: selectedCompanyId,
            companyName: comp ? comp.name : 'Empresa',
            roleId: selectedRoleId,
            roleName: roleNames[selectedRoleId] || selectedRoleId,
            isOwner: Boolean(isOwner),
            status: 'active'
          }
        ];
        // Re-seleccionar primera empresa libre
        const nextAvail = availableCompanies.filter(c => c.id !== selectedCompanyId);
        selectedCompanyId = nextAvail.length > 0 ? nextAvail[0].id : '';
      }
    } finally {
      isSubmitting = false;
    }
  }

  async function handleRemove(companyId, companyName) {
    if (!user) return;
    if (!confirm(`¿Desvincular a "${user.full_name}" de la empresa "${companyName}"?`)) {
      return;
    }

    isSubmitting = true;
    try {
      const res = await removeUserFromCompany(user.id, companyId);
      if (res.success) {
        user.memberships = (user.memberships || []).filter(m => m.companyId !== companyId);
      }
    } finally {
      isSubmitting = false;
    }
  }
</script>

<Modal
  {isOpen}
  title={user ? `🏢 Empresas de: ${user.full_name}` : '🏢 Membresías de Empresas'}
  subtitle="Vincula o desvincula a este usuario de las empresas y gestiona su rol específico"
  maxWidth="540px"
  {onClose}
>
  <div class="user-companies-container">
    <!-- Lista de Empresas Actuales -->
    <div class="section-block">
      <span class="block-title">Empresas en las que participa:</span>
      {#if !user?.memberships || user.memberships.length === 0}
        <div class="empty-memberships">
          <span>Este usuario no está vinculado a ninguna empresa actualmente.</span>
        </div>
      {:else}
        <div class="memberships-list">
          {#each user.memberships as m}
            <div class="membership-item">
              <div class="comp-info">
                <span class="comp-name">🏢 {m.companyName}</span>
                <div class="comp-badges">
                  <span class="role-badge">{m.roleName || m.roleId}</span>
                  {#if m.isOwner}
                    <span class="owner-badge">Propietario</span>
                  {/if}
                </div>
              </div>
              <button
                type="button"
                class="btn-remove-membership"
                onclick={() => handleRemove(m.companyId, m.companyName)}
                disabled={isSubmitting}
                title="Desvincular usuario de esta empresa"
              >
                ✕ Desvincular
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Formulario para Vincular a una Nueva Empresa -->
    <div class="section-block add-block">
      <span class="block-title">➕ Vincular a otra empresa:</span>
      {#if availableCompanies.length === 0}
        <p class="all-assigned-msg">El usuario ya está vinculado a todas las empresas registradas en el sistema.</p>
      {:else}
        <form onsubmit={handleAssign} class="assign-form">
          <div class="form-row">
            <div class="form-group flex-1">
              <label for="modal-assign-comp">Seleccionar Empresa</label>
              <select id="modal-assign-comp" bind:value={selectedCompanyId} required>
                {#each availableCompanies as comp}
                  <option value={comp.id}>{comp.name}</option>
                {/each}
              </select>
            </div>

            <div class="form-group flex-1">
              <label for="modal-assign-role">Rol Asignado</label>
              <select id="modal-assign-role" bind:value={selectedRoleId}>
                <option value="role_admin">👑 Administrador</option>
                <option value="role_sales_agent">💼 Asesor / Agente</option>
                <option value="role_content_manager">✍️ Gestor de Flujos</option>
                <option value="role_viewer">👀 Supervisor (Lectura)</option>
              </select>
            </div>
          </div>

          <div class="owner-checkbox-row">
            <label class="owner-checkbox">
              <input type="checkbox" bind:checked={isOwner} />
              <span>Marcar como Propietario (Owner) de esta empresa</span>
            </label>
          </div>

          <div class="form-actions-row">
            <button
              type="submit"
              class="btn btn-primary btn-sm"
              disabled={isSubmitting || !selectedCompanyId}
            >
              <span>{isSubmitting ? 'Vinculando...' : '➕ Vincular a la Empresa'}</span>
            </button>
          </div>
        </form>
      {/if}
    </div>

    <div class="modal-footer-btns">
      <button type="button" class="btn btn-secondary" onclick={onClose}>
        Cerrar
      </button>
    </div>
  </div>
</Modal>

<style>
  .user-companies-container {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding-top: 8px;
  }
  .section-block {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .block-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .empty-memberships {
    padding: 14px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px dashed var(--border-subtle);
    border-radius: var(--radius-sm);
    font-size: 0.8rem;
    color: var(--text-muted);
    text-align: center;
  }

  .memberships-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .membership-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 10px 14px;
  }
  .comp-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .comp-name {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-primary);
  }
  .comp-badges {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .role-badge {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 0.72rem;
    font-weight: 600;
  }
  .owner-badge {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 0.72rem;
    font-weight: 700;
  }
  .btn-remove-membership {
    background: rgba(239, 68, 68, 0.1);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.25);
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-remove-membership:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  .add-block {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 14px;
  }
  .assign-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .form-row {
    display: flex;
    gap: 12px;
  }
  .flex-1 {
    flex: 1;
  }
  .owner-checkbox {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 0.78rem;
    color: var(--text-secondary);
    cursor: pointer;
  }
  .owner-checkbox input {
    accent-color: #f59e0b;
  }
  .all-assigned-msg {
    margin: 0;
    font-size: 0.78rem;
    color: var(--text-muted);
    font-style: italic;
  }
  .form-actions-row {
    display: flex;
    justify-content: flex-end;
  }

  .modal-footer-btns {
    display: flex;
    justify-content: flex-end;
    margin-top: 4px;
  }
</style>

