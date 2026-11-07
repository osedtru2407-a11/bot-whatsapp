<!-- frontend/src/components/team/RoleDetailModal.svelte -->
<script>
  import Modal from '../common/Modal.svelte';
  import { 
    PERMISSION_CATEGORIES, 
    PERMISSIONS_DICTIONARY, 
    getPermissionMeta, 
    groupPermissionsByCategory, 
    isFullAdmin 
  } from '../../utils/permissions';
  import { hasPermission } from '../../stores/auth';
  import { deleteCustomRole } from '../../stores/team';

  let { role = null, isOpen = false, onClose = () => {} } = $props();

  const rolePerms = $derived(Array.isArray(role?.permissions) ? role.permissions : []);
  const isAllAdmin = $derived(isFullAdmin(role || {}));
  const groupedPerms = $derived(groupPermissionsByCategory(rolePerms));

  // Permisos restringidos (los que este rol NO tiene)
  const restrictedPerms = $derived.by(() => {
    if (isAllAdmin) return [];
    const roleSet = new Set(rolePerms);
    const result = [];
    for (const [key, meta] of Object.entries(PERMISSIONS_DICTIONARY)) {
      if (!roleSet.has(key)) {
        result.push(meta);
      }
    }
    return result;
  });

  const groupedRestricted = $derived.by(() => {
    if (isAllAdmin) return [];
    const roleSet = new Set(rolePerms);
    const restrictedKeys = Object.keys(PERMISSIONS_DICTIONARY).filter(k => !roleSet.has(k));
    return groupPermissionsByCategory(restrictedKeys);
  });

  let activeTab = $state('allowed'); // 'allowed' | 'restricted'

  async function handleDeleteRole() {
    if (!role) return;
    if (confirm(`¿Estás seguro de eliminar el rol personalizado "${role.name}"? Los colaboradores que lo tengan deberán tener otro rol asignado.`)) {
      const res = await deleteCustomRole(role.id, role.name);
      if (res.success) {
        onClose();
      }
    }
  }
</script>

{#if role}
  <Modal 
    {isOpen} 
    title={`🛡️ Detalle de Permisos: ${role.name}`}
    subtitle={role.isSystemDefault || role.is_system_default 
      ? 'Rol oficial predeterminado del sistema' 
      : 'Rol personalizado creado para tu empresa'}
    maxWidth="740px"
    {onClose}
  >
    <div class="role-modal-content">
      <!-- Encabezado con descripción del rol -->
      <div class="role-hero-box">
        <div class="role-hero-info">
          <div class="role-title-row">
            <span class="role-badge {role.isSystemDefault || role.is_system_default ? (role.id || 'custom-role') : 'custom-role'}">
              {role.name}
            </span>
            <span class="role-nature-tag {role.isSystemDefault || role.is_system_default ? 'system' : 'custom'}">
              {role.isSystemDefault || role.is_system_default ? '🔒 Sistema (No modificable)' : '✨ Personalizado'}
            </span>
          </div>
          <p class="role-desc-text">{role.description || 'Sin descripción asignada.'}</p>
        </div>
      </div>

      {#if isAllAdmin}
        <div class="admin-full-banner">
          <div class="admin-crown">👑</div>
          <div>
            <h4>Control Total y Sin Restricciones</h4>
            <p>
              Este rol posee privilegios totales en la plataforma. Puede ver, crear, modificar y eliminar cualquier elemento,
              vincular cuentas de WhatsApp, entrenar a la inteligencia artificial y gestionar colaboradores.
            </p>
          </div>
        </div>
      {/if}

      <!-- Pestañas de lo que puede hacer vs restricciones -->
      <div class="modal-tabs-header">
        <button 
          type="button" 
          class="modal-tab-btn {activeTab === 'allowed' ? 'active' : ''}"
          onclick={() => activeTab = 'allowed'}
        >
          ✅ Lo que puede hacer y ver ({rolePerms.length})
        </button>
        <button 
          type="button" 
          class="modal-tab-btn {activeTab === 'restricted' ? 'active' : ''}"
          onclick={() => activeTab = 'restricted'}
        >
          🚫 Restricciones ({restrictedPerms.length})
        </button>
      </div>

      <!-- Contenido Tab 1: Permisos Habilitados -->
      {#if activeTab === 'allowed'}
        <div class="perms-tab-body">
          {#if rolePerms.length === 0}
            <div class="empty-state-text">Este rol no tiene ningún permiso asignado actualmente.</div>
          {:else}
            <div class="grouped-sections-list">
              {#each groupedPerms as cat}
                <div class="module-group-card">
                  <div class="module-group-header">
                    <span class="module-icon">{cat.icon}</span>
                    <div>
                      <h4 class="module-title">{cat.name}</h4>
                      <p class="module-desc">{cat.description}</p>
                    </div>
                  </div>
                  <div class="perms-list">
                    {#each cat.permissions as p}
                      <div class="perm-detail-item allowed">
                        <span class="check-icon">✓</span>
                        <div class="perm-text">
                          <strong class="perm-title">{p.label}</strong>
                          <span class="perm-desc">{p.description}</span>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <!-- Contenido Tab 2: Permisos Restringidos -->
        <div class="perms-tab-body">
          {#if restrictedPerms.length === 0}
            <div class="no-restrictions-box">
              <span style="font-size: 2rem;">🛡️</span>
              <div>
                <strong>Este rol no tiene ninguna restricción</strong>
                <p>Tiene acceso completo a todas las herramientas del sistema.</p>
              </div>
            </div>
          {:else}
            <div class="restrictions-notice">
              ⚠️ Los colaboradores con este rol tienen bloqueadas las siguientes acciones para proteger la seguridad y los datos de tu empresa:
            </div>
            <div class="grouped-sections-list">
              {#each groupedRestricted as cat}
                <div class="module-group-card restricted">
                  <div class="module-group-header">
                    <span class="module-icon">{cat.icon}</span>
                    <div>
                      <h4 class="module-title">{cat.name}</h4>
                      <p class="module-desc">{cat.description}</p>
                    </div>
                  </div>
                  <div class="perms-list">
                    {#each cat.permissions as p}
                      <div class="perm-detail-item blocked">
                        <span class="blocked-icon">✕</span>
                        <div class="perm-text">
                          <strong class="perm-title">No puede {p.label.toLowerCase()}</strong>
                          <span class="perm-desc">{p.description}</span>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Acciones del pie de modal -->
      <div class="modal-footer-actions">
        {#if !role.isSystemDefault && !role.is_system_default && $hasPermission('roles:manage')}
          <button 
            type="button" 
            class="btn btn-outline-danger" 
            onclick={handleDeleteRole}
            title="Eliminar este rol de la empresa"
          >
            🗑️ Eliminar Rol
          </button>
        {/if}
        <button type="button" class="btn btn-secondary" onclick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  </Modal>
{/if}

<style>
  .role-modal-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .role-hero-box {
    padding: 14px 18px;
    background: rgba(30, 41, 59, 0.7);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
  }

  .role-title-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }

  .role-nature-tag {
    font-size: 0.72rem;
    padding: 3px 10px;
    border-radius: 9999px;
    font-weight: 600;
  }
  .role-nature-tag.system {
    background: rgba(148, 163, 184, 0.12);
    color: #94a3b8;
    border: 1px solid rgba(148, 163, 184, 0.25);
  }
  .role-nature-tag.custom {
    background: rgba(168, 85, 247, 0.15);
    color: #c084fc;
    border: 1px solid rgba(168, 85, 247, 0.35);
  }

  .role-desc-text {
    font-size: 0.88rem;
    color: var(--text-muted);
    line-height: 1.45;
    margin: 0;
  }

  .admin-full-banner {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px 18px;
    background: linear-gradient(135deg, rgba(234, 179, 8, 0.12) 0%, rgba(245, 158, 11, 0.05) 100%);
    border: 1px solid rgba(234, 179, 8, 0.35);
    border-radius: var(--radius-md);
  }
  .admin-crown {
    font-size: 2.2rem;
    line-height: 1;
  }
  .admin-full-banner h4 {
    margin: 0 0 4px 0;
    color: #fef08a;
    font-size: 0.95rem;
  }
  .admin-full-banner p {
    margin: 0;
    font-size: 0.84rem;
    color: #fef9c3;
    line-height: 1.4;
  }

  .modal-tabs-header {
    display: flex;
    gap: 8px;
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 8px;
  }

  .modal-tab-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 0.88rem;
    font-weight: 600;
    padding: 8px 14px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .modal-tab-btn:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.05);
  }
  .modal-tab-btn.active {
    color: #fff;
    background: rgba(37, 211, 102, 0.15);
    color: var(--wa-primary);
  }

  .perms-tab-body {
    max-height: 380px;
    overflow-y: auto;
    padding-right: 6px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .grouped-sections-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .module-group-card {
    background: rgba(15, 23, 42, 0.5);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 14px;
  }
  .module-group-card.restricted {
    background: rgba(30, 20, 25, 0.4);
    border-color: rgba(244, 63, 94, 0.2);
  }

  .module-group-header {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .module-icon {
    font-size: 1.3rem;
    line-height: 1;
  }
  .module-title {
    margin: 0 0 2px 0;
    font-size: 0.92rem;
    color: #f1f5f9;
  }
  .module-desc {
    margin: 0;
    font-size: 0.78rem;
    color: var(--text-dim);
  }

  .perms-list {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .perm-detail-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    background: rgba(255, 255, 255, 0.02);
  }
  .perm-detail-item.allowed .check-icon {
    color: #22c55e;
    font-weight: 800;
    font-size: 0.95rem;
    line-height: 1.2;
  }
  .perm-detail-item.blocked .blocked-icon {
    color: #f43f5e;
    font-weight: 800;
    font-size: 0.95rem;
    line-height: 1.2;
  }

  .perm-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .perm-title {
    font-size: 0.85rem;
    color: #f8fafc;
  }
  .perm-desc {
    font-size: 0.78rem;
    color: var(--text-muted);
    line-height: 1.35;
  }

  .restrictions-notice {
    font-size: 0.84rem;
    color: #fda4af;
    background: rgba(244, 63, 94, 0.08);
    border: 1px solid rgba(244, 63, 94, 0.25);
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    line-height: 1.4;
  }

  .no-restrictions-box {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 24px;
    background: rgba(34, 197, 94, 0.08);
    border: 1px solid rgba(34, 197, 94, 0.25);
    border-radius: var(--radius-md);
    color: #86efac;
    text-align: left;
  }

  .empty-state-text {
    text-align: center;
    padding: 30px;
    color: var(--text-muted);
    font-size: 0.88rem;
  }

  .modal-footer-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--border-subtle);
  }

  .btn-outline-danger {
    background: transparent;
    border: 1px solid rgba(244, 63, 94, 0.4);
    color: #f43f5e;
    padding: 7px 14px;
    border-radius: var(--radius-sm);
    font-size: 0.84rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  .btn-outline-danger:hover {
    background: rgba(244, 63, 94, 0.15);
    border-color: #f43f5e;
  }
</style>

