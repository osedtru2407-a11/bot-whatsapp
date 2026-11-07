<!-- frontend/src/components/team/CustomRoleModal.svelte -->
<script>
  import { isCustomRoleModalOpen, createCustomRole } from '../../stores/team';
  import { showToast } from '../../stores/toast';
  import Modal from '../common/Modal.svelte';
  import { PERMISSION_CATEGORIES, PERMISSIONS_DICTIONARY } from '../../utils/permissions';

  let roleName = $state('');
  let roleDesc = $state('');
  let isSubmitting = $state(false);

  // Inicializar estado reactivo de permisos
  let selectedPerms = $state({});

  function resetForm() {
    roleName = '';
    roleDesc = '';
    const initial = {};
    for (const key of Object.keys(PERMISSIONS_DICTIONARY)) {
      initial[key] = key.endsWith(':view') || key === 'simulator:use';
    }
    selectedPerms = initial;
  }

  // Pre-llenar al abrir
  $effect(() => {
    if ($isCustomRoleModalOpen) {
      resetForm();
    }
  });

  const selectedCount = $derived(
    Object.values(selectedPerms).filter(Boolean).length
  );

  function selectAll() {
    const next = {};
    for (const key of Object.keys(PERMISSIONS_DICTIONARY)) {
      next[key] = true;
    }
    selectedPerms = next;
  }

  function selectReadOnly() {
    const next = {};
    for (const key of Object.keys(PERMISSIONS_DICTIONARY)) {
      next[key] = key.endsWith(':view');
    }
    selectedPerms = next;
  }

  function selectSalesProfile() {
    const next = {};
    for (const key of Object.keys(PERMISSIONS_DICTIONARY)) {
      next[key] = false;
    }
    next['leads:view'] = true;
    next['leads:pause'] = true;
    next['quick_send:use'] = true;
    next['simulator:use'] = true;
    selectedPerms = next;
  }

  function clearAll() {
    const next = {};
    for (const key of Object.keys(PERMISSIONS_DICTIONARY)) {
      next[key] = false;
    }
    selectedPerms = next;
  }

  function toggleCategory(categoryKey) {
    const catPerms = Object.values(PERMISSIONS_DICTIONARY).filter(p => p.categoryKey === categoryKey);
    const allChecked = catPerms.every(p => selectedPerms[p.key]);
    const next = { ...selectedPerms };
    for (const p of catPerms) {
      next[p.key] = !allChecked;
    }
    selectedPerms = next;
  }

  function handleClose() {
    isCustomRoleModalOpen.set(false);
    resetForm();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!roleName.trim()) {
      showToast('Ingresa un nombre claro para el rol', 'warning');
      return;
    }

    const perms = Object.keys(selectedPerms).filter(k => selectedPerms[k]);
    if (perms.length === 0) {
      showToast('Selecciona al menos un permiso para el rol', 'warning');
      return;
    }

    isSubmitting = true;
    const res = await createCustomRole({
      name: roleName.trim(),
      description: roleDesc.trim(),
      permissions: perms
    });
    isSubmitting = false;

    if (res.success) {
      handleClose();
    }
  }
</script>

<Modal 
  isOpen={$isCustomRoleModalOpen}
  title="🛡️ Crear Rol Personalizado"
  subtitle="Define en lenguaje claro exactamente qué podrá ver y hacer este perfil en tu empresa"
  maxWidth="760px"
  onClose={handleClose}
>
  <form onsubmit={handleSubmit} class="form-body">
    <div class="form-group">
      <label for="c-role-name">Nombre del Rol</label>
      <input 
        type="text" 
        id="c-role-name" 
        placeholder="Ej: Especialista de Envíos Masivos / Asesor Junior" 
        bind:value={roleName} 
        required 
      />
    </div>

    <div class="form-group">
      <label for="c-role-desc">Descripción de Responsabilidades</label>
      <input 
        type="text" 
        id="c-role-desc" 
        placeholder="Ej: Encargado de programar difusiones mensuales y responder dudas frecuentes..." 
        bind:value={roleDesc} 
      />
    </div>

    <!-- Barra de acciones rápidas de permisos -->
    <div class="presets-toolbar">
      <div class="perm-counter">
        Permisos seleccionados: <strong>{selectedCount} de {Object.keys(PERMISSIONS_DICTIONARY).length}</strong>
      </div>
      <div class="presets-buttons">
        <button type="button" class="preset-btn" onclick={selectAll}>✨ Todos</button>
        <button type="button" class="preset-btn" onclick={selectSalesProfile}>💼 Perfil Ventas</button>
        <button type="button" class="preset-btn" onclick={selectReadOnly}>👀 Solo Ver</button>
        <button type="button" class="preset-btn" onclick={clearAll}>🧹 Limpiar</button>
      </div>
    </div>

    <div class="form-group">
      <div class="permissions-checklist-container">
        {#each PERMISSION_CATEGORIES as cat}
          {@const catPerms = Object.values(PERMISSIONS_DICTIONARY).filter(p => p.categoryKey === cat.key)}
          {@const catCheckedCount = catPerms.filter(p => selectedPerms[p.key]).length}
          
          <div class="perm-module-block">
            <div class="perm-module-header">
              <div class="perm-module-title-box">
                <span class="module-icon">{cat.icon}</span>
                <div>
                  <h4 class="module-title">{cat.name}</h4>
                  <span class="module-sub">{cat.description}</span>
                </div>
              </div>
              <button 
                type="button" 
                class="btn-toggle-cat"
                onclick={() => toggleCategory(cat.key)}
                title="Marcar o desmarcar todos los permisos de este módulo"
              >
                {catCheckedCount === catPerms.length ? 'Desmarcar módulo' : `Marcar módulo (${catCheckedCount}/${catPerms.length})`}
              </button>
            </div>

            <div class="perm-items-grid">
              {#each catPerms as p}
                <label class="perm-item-box {selectedPerms[p.key] ? 'selected' : ''}">
                  <input 
                    type="checkbox" 
                    bind:checked={selectedPerms[p.key]}
                  />
                  <div class="perm-item-content">
                    <span class="perm-label-text">
                      <span class="perm-action-icon">{p.icon}</span> {p.label}
                    </span>
                    <span class="perm-desc-text">{p.description}</span>
                  </div>
                </label>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>

    <div class="modal-actions" style="margin-top: 24px;">
      <button type="button" class="btn btn-secondary" onclick={handleClose}>Cancelar</button>
      <button type="submit" class="btn btn-primary" disabled={isSubmitting || selectedCount === 0}>
        {isSubmitting ? 'Guardando...' : `Crear Rol (${selectedCount} permisos)`}
      </button>
    </div>
  </form>
</Modal>

<style>
  .presets-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(30, 41, 59, 0.6);
    border: 1px solid var(--border-subtle);
    padding: 10px 14px;
    border-radius: var(--radius-md);
    margin-bottom: 14px;
    flex-wrap: wrap;
    gap: 10px;
  }

  .perm-counter {
    font-size: 0.86rem;
    color: var(--text-muted);
  }
  .perm-counter strong {
    color: #38bdf8;
  }

  .presets-buttons {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .preset-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-subtle);
    color: var(--text-muted);
    font-size: 0.76rem;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.2s;
  }
  .preset-btn:hover {
    background: rgba(56, 189, 248, 0.15);
    border-color: #38bdf8;
    color: #fff;
  }

  .permissions-checklist-container {
    max-height: 380px;
    overflow-y: auto;
    padding-right: 6px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .perm-module-block {
    background: rgba(15, 23, 42, 0.45);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 14px;
  }

  .perm-module-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 10px;
    margin-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    flex-wrap: wrap;
    gap: 8px;
  }

  .perm-module-title-box {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .module-icon {
    font-size: 1.25rem;
  }

  .module-title {
    margin: 0;
    font-size: 0.9rem;
    color: #f8fafc;
  }

  .module-sub {
    font-size: 0.76rem;
    color: var(--text-dim);
  }

  .btn-toggle-cat {
    background: none;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: var(--text-muted);
    font-size: 0.74rem;
    padding: 3px 8px;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .btn-toggle-cat:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
  }

  .perm-items-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 10px;
  }

  .perm-item-box {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 9px 12px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.04);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .perm-item-box:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(56, 189, 248, 0.3);
  }
  .perm-item-box.selected {
    background: rgba(37, 211, 102, 0.08);
    border-color: rgba(37, 211, 102, 0.35);
  }

  .perm-item-box input[type="checkbox"] {
    accent-color: var(--wa-primary);
    width: 16px;
    height: 16px;
    margin-top: 2px;
    cursor: pointer;
  }

  .perm-item-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .perm-label-text {
    font-size: 0.84rem;
    font-weight: 600;
    color: #f1f5f9;
  }

  .perm-desc-text {
    font-size: 0.75rem;
    color: var(--text-muted);
    line-height: 1.35;
  }
</style>
