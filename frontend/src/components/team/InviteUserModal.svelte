<script>
  import { isInviteModalOpen, companyRoles, inviteMember } from '../../stores/team';
  import { showToast } from '../../stores/toast';
  import Modal from '../common/Modal.svelte';

  let fullName = $state('');
  let email = $state('');
  let phone = $state('');
  let roleId = $state('');
  let password = $state('');
  let isSubmitting = $state(false);

  $effect(() => {
    if ($isInviteModalOpen) {
      fullName = '';
      email = '';
      phone = '';
      roleId = $companyRoles[0]?.id || '';
      generatePassword();
    }
  });

  function generatePassword() {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
    let pwd = '';
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    password = pwd;
  }

  function handleClose() {
    isInviteModalOpen.set(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !roleId) {
      showToast('Por favor completa todos los campos requeridos', 'warning');
      return;
    }

    isSubmitting = true;
    const res = await inviteMember({
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      roleId,
      password
    });
    isSubmitting = false;

    if (res.success) {
      handleClose();
    }
  }
</script>

<Modal 
  isOpen={$isInviteModalOpen}
  title="👤 Agregar Colaborador a la Empresa"
  subtitle="Crea un acceso con rol específico para que tu equipo opere el bot"
  maxWidth="560px"
  onClose={handleClose}
>
  <form onsubmit={handleSubmit} class="form-body">
    <div class="form-group">
      <label for="inv-fullname">Nombre Completo</label>
      <input 
        type="text" 
        id="inv-fullname" 
        placeholder="Ej: Andrés Gómez" 
        bind:value={fullName} 
        required 
      />
    </div>

    <div class="form-row">
      <div class="form-group flex-1">
        <label for="inv-email">Correo Electrónico (Para Login)</label>
        <input 
          type="email" 
          id="inv-email" 
          placeholder="andres@empresa.com" 
          bind:value={email} 
          required 
        />
      </div>

      <div class="form-group flex-1">
        <label for="inv-phone">Teléfono / WhatsApp (Opcional)</label>
        <input 
          type="tel" 
          id="inv-phone" 
          placeholder="573001234567" 
          bind:value={phone} 
        />
      </div>
    </div>

    <div class="form-group">
      <label for="inv-role">Rol y Permisos</label>
      <select id="inv-role" bind:value={roleId} required>
        {#each $companyRoles as r}
          <option value={r.id}>{r.name} - {r.description || ''}</option>
        {/each}
      </select>
    </div>

    <div class="form-group">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <label for="inv-pwd" style="margin-bottom: 0;">Contraseña Temporal de Acceso</label>
        <button type="button" class="btn btn-outline-sm" style="padding: 2px 8px; font-size: 11px;" onclick={generatePassword}>
          🎲 Generar Otra
        </button>
      </div>
      <input 
        type="text" 
        id="inv-pwd" 
        style="font-family: var(--font-mono);" 
        bind:value={password} 
        required 
      />
      <span style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px; display: block;">
        Copia esta contraseña y compártela con el usuario para su primer ingreso.
      </span>
    </div>

    <div class="modal-actions" style="margin-top: 24px;">
      <button type="button" class="btn btn-secondary" onclick={handleClose}>Cancelar</button>
      <button type="submit" class="btn btn-primary" disabled={isSubmitting}>
        {isSubmitting ? 'Agregando...' : 'Agregar al Equipo'}
      </button>
    </div>
  </form>
</Modal>

<style>
  .form-row {
    display: flex;
    gap: 16px;
  }
  .flex-1 { flex: 1; }
</style>
