<script>
  import { isEditRoleModalOpen, editingMember, companyRoles, updateMemberRole } from '../../stores/team';
  import Modal from '../common/Modal.svelte';

  let selectedRoleId = $state('');
  let isSaving = $state(false);

  $effect(() => {
    if ($isEditRoleModalOpen && $editingMember) {
      selectedRoleId = $editingMember.currentRoleId || $companyRoles[0]?.id || '';
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
    const res = await updateMemberRole($editingMember.id, selectedRoleId);
    isSaving = false;

    if (res.success) {
      handleClose();
    }
  }
</script>

<Modal 
  isOpen={$isEditRoleModalOpen}
  title="🛡️ Modificar Rol de Colaborador"
  subtitle={`Asignar nuevo rol a ${$editingMember?.name || 'Usuario'}`}
  maxWidth="480px"
  onClose={handleClose}
>
  <form onsubmit={handleSubmit} class="form-body">
    <div class="form-group">
      <label for="edit-role-select">Selecciona el Nuevo Rol</label>
      <select id="edit-role-select" bind:value={selectedRoleId} required>
        {#each $companyRoles as r}
          <option value={r.id}>{r.name} - {r.description || ''}</option>
        {/each}
      </select>
    </div>

    <div class="modal-actions" style="margin-top: 24px;">
      <button type="button" class="btn btn-secondary" onclick={handleClose}>Cancelar</button>
      <button type="submit" class="btn btn-primary" disabled={isSaving}>
        {isSaving ? 'Actualizando...' : 'Actualizar Rol'}
      </button>
    </div>
  </form>
</Modal>
