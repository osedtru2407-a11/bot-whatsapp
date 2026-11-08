<script>
  import { isEditRoleModalOpen, editingMember, companyRoles, updateMemberRole } from '../../stores/team';
  import Modal from '../common/Modal.svelte';

  let selectedRoleId = $state('');
  let corporatePhone = $state('');
  let isSaving = $state(false);

  $effect(() => {
    if ($isEditRoleModalOpen && $editingMember) {
      selectedRoleId = $editingMember.currentRoleId || $companyRoles[0]?.id || '';
      corporatePhone = $editingMember.currentPhone || '';
    }
  });

  function handleClose() {
    isEditRoleModalOpen.set(false);
    editingMember.set(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!$editingMember || !selectedRoleId) return;

    isSaving = true;
    const res = await updateMemberRole($editingMember.id, selectedRoleId, corporatePhone.trim());
    isSaving = false;

    if (res.success) {
      handleClose();
    }
  }
</script>

<Modal 
  isOpen={$isEditRoleModalOpen}
  title="🛡️ Modificar Colaborador"
  subtitle={`Actualizar rol y línea corporativa de ${$editingMember?.name || 'Usuario'}`}
  maxWidth="480px"
  onClose={handleClose}
>
  <form onsubmit={handleSubmit} class="form-body">
    <div class="form-group">
      <label for="edit-role-select">Rol y Permisos</label>
      <select id="edit-role-select" bind:value={selectedRoleId} required>
        {#each $companyRoles as r}
          <option value={r.id}>{r.name} - {r.description || ''}</option>
        {/each}
      </select>
    </div>

    <div class="form-group">
      <label for="edit-member-phone">Teléfono Corporativo en esta Empresa</label>
      <input 
        type="tel" 
        id="edit-member-phone" 
        placeholder="Ej: 573001234567" 
        bind:value={corporatePhone} 
      />
      <span style="font-size: 0.76rem; color: var(--text-muted); margin-top: 4px; display: block; line-height: 1.35;">
        📱 Línea asignada exclusivamente para atender en esta empresa.
      </span>
    </div>

    <div class="modal-actions" style="margin-top: 24px;">
      <button type="button" class="btn btn-secondary" onclick={handleClose}>Cancelar</button>
      <button type="submit" class="btn btn-primary" disabled={isSaving}>
        {isSaving ? 'Guardando...' : 'Guardar Cambios'}
      </button>
    </div>
  </form>
</Modal>
