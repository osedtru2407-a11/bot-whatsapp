<script>
  import { isChangePasswordModalOpen } from '../../stores/ui';
  import { changePassword } from '../../stores/auth';
  import Modal from '../common/Modal.svelte';

  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let errorMsg = $state('');
  let isSubmitting = $state(false);

  function resetForm() {
    currentPassword = '';
    newPassword = '';
    confirmPassword = '';
    errorMsg = '';
    isSubmitting = false;
  }

  function handleClose() {
    isChangePasswordModalOpen.set(false);
    resetForm();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (newPassword.length < 6) {
      errorMsg = 'La nueva contraseña debe tener al menos 6 caracteres';
      return;
    }
    if (newPassword !== confirmPassword) {
      errorMsg = 'Las contraseñas no coinciden';
      return;
    }

    isSubmitting = true;
    errorMsg = '';

    const res = await changePassword(currentPassword, newPassword);
    isSubmitting = false;

    if (res.success) {
      handleClose();
    } else {
      errorMsg = res.error || 'Error al cambiar contraseña';
    }
  }
</script>

<Modal 
  isOpen={$isChangePasswordModalOpen} 
  title="🔒 Cambiar Mi Contraseña" 
  subtitle="Actualiza tus credenciales de acceso" 
  maxWidth="440px"
  onClose={handleClose}
>
  <form onsubmit={handleSubmit} class="form-body">
    {#if errorMsg}
      <div class="auth-alert error" style="margin-bottom: 14px;">{errorMsg}</div>
    {/if}

    <div class="form-group">
      <label for="pwd-current">Contraseña Actual</label>
      <input 
        type="password" 
        id="pwd-current" 
        placeholder="Contraseña actual" 
        bind:value={currentPassword} 
        required 
      />
    </div>

    <div class="form-group">
      <label for="pwd-new">Nueva Contraseña</label>
      <input 
        type="password" 
        id="pwd-new" 
        placeholder="Al menos 6 caracteres" 
        minlength="6" 
        bind:value={newPassword} 
        required 
      />
    </div>

    <div class="form-group">
      <label for="pwd-confirm">Confirmar Nueva Contraseña</label>
      <input 
        type="password" 
        id="pwd-confirm" 
        placeholder="Repite la nueva contraseña" 
        minlength="6" 
        bind:value={confirmPassword} 
        required 
      />
    </div>

    <div class="modal-actions" style="margin-top: 20px;">
      <button type="button" class="btn btn-secondary" onclick={handleClose}>Cancelar</button>
      <button type="submit" class="btn btn-primary" disabled={isSubmitting}>
        {isSubmitting ? 'Actualizando...' : 'Actualizar Contraseña'}
      </button>
    </div>
  </form>
</Modal>
