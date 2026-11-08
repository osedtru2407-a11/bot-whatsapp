<script>
  import { isProfileModalOpen } from '../../stores/ui';
  import { currentUser, updateProfile, changePassword } from '../../stores/auth';
  import { showToast } from '../../stores/toast';
  import Modal from '../common/Modal.svelte';

  let activeTab = $state('profile'); // 'profile' | 'security'
  
  // Profile form state
  let fullName = $state('');
  let phone = $state('');
  let isSavingProfile = $state(false);
  let profileError = $state('');

  // Password form state
  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let isSavingPassword = $state(false);
  let passwordError = $state('');

  // When modal opens or currentUser updates, populate form state
  $effect(() => {
    if ($isProfileModalOpen && $currentUser) {
      fullName = $currentUser.fullName || '';
      phone = $currentUser.phone || '';
      profileError = '';
      passwordError = '';
      currentPassword = '';
      newPassword = '';
      confirmPassword = '';
      if ($currentUser.mustChangePassword) {
        activeTab = 'security';
      }
    }
  });

  function handleClose() {
    if ($currentUser?.mustChangePassword) {
      showToast('Por seguridad, debes establecer una contraseña definitiva antes de cerrar.', 'warning');
      return;
    }
    isProfileModalOpen.set(false);
  }

  async function handleUpdateProfile(e) {
    e.preventDefault();
    if (!fullName.trim()) {
      profileError = 'El nombre completo es obligatorio';
      return;
    }

    isSavingProfile = true;
    profileError = '';

    const res = await updateProfile({
      fullName: fullName.trim(),
      phone: phone.trim()
    });

    isSavingProfile = false;
    if (!res.success) {
      profileError = res.error || 'Error al actualizar el perfil';
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    const isTemp = Boolean($currentUser?.mustChangePassword);

    if (!isTemp && !currentPassword) {
      passwordError = 'Debes ingresar tu contraseña actual';
      return;
    }

    if (newPassword.length < 6) {
      passwordError = 'La nueva contraseña debe tener al menos 6 caracteres';
      return;
    }

    if (newPassword !== confirmPassword) {
      passwordError = 'Las contraseñas no coinciden';
      return;
    }

    isSavingPassword = true;
    passwordError = '';

    const res = await changePassword(currentPassword, newPassword);
    isSavingPassword = false;

    if (res.success) {
      currentPassword = '';
      newPassword = '';
      confirmPassword = '';
      isProfileModalOpen.set(false);
    } else {
      passwordError = res.error || 'Error al cambiar la contraseña';
    }
  }
</script>

<Modal
  isOpen={$isProfileModalOpen}
  title="👤 Mi Perfil de Usuario"
  subtitle="Gestiona tus datos personales y credenciales de acceso"
  maxWidth="520px"
  onClose={handleClose}
>
  <!-- Modal Tabs Header -->
  <div class="profile-tabs-nav">
    <button
      type="button"
      class="profile-tab-btn {activeTab === 'profile' ? 'active' : ''}"
      onclick={() => activeTab = 'profile'}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
      <span>Datos Personales</span>
    </button>
    <button
      type="button"
      class="profile-tab-btn {activeTab === 'security' ? 'active' : ''}"
      onclick={() => activeTab = 'security'}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
      <span>Seguridad y Contraseña</span>
      {#if $currentUser?.mustChangePassword}
        <span class="tab-alert-dot" title="Cambio obligatorio">!</span>
      {/if}
    </button>
  </div>

  {#if activeTab === 'profile'}
    <!-- TAB 1: DATOS PERSONALES -->
    <form onsubmit={handleUpdateProfile} class="profile-form-pane">
      {#if profileError}
        <div class="auth-alert error" style="margin-bottom: 14px;">{profileError}</div>
      {/if}

      <div class="form-group">
        <label for="prof-email">Correo Electrónico de Acceso</label>
        <input
          type="email"
          id="prof-email"
          value={$currentUser?.email || ''}
          disabled
          style="background: rgba(255, 255, 255, 0.04); color: var(--text-muted); cursor: not-allowed;"
        />
        <span style="font-size: 0.74rem; color: var(--text-dim); margin-top: 4px; display: block;">
          El correo electrónico es el identificador único de tu cuenta y no puede modificarse directamente.
        </span>
      </div>

      <div class="form-group">
        <label for="prof-fullname">Nombre Completo</label>
        <input
          type="text"
          id="prof-fullname"
          placeholder="Tu nombre completo"
          bind:value={fullName}
          required
        />
      </div>

      <div class="form-group">
        <label for="prof-phone">Teléfono de Contacto</label>
        <input
          type="text"
          id="prof-phone"
          placeholder="Ej: +57 300 123 4567"
          bind:value={phone}
        />
        <span style="font-size: 0.74rem; color: var(--text-dim); margin-top: 4px; display: block;">
          Opcional. Utilizado para notificaciones internas de tu empresa.
        </span>
      </div>

      <div class="modal-actions" style="margin-top: 24px;">
        <button type="button" class="btn btn-secondary" onclick={handleClose}>
          Cerrar
        </button>
        <button type="submit" class="btn btn-primary" disabled={isSavingProfile}>
          {isSavingProfile ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>
    </form>
  {:else}
    <!-- TAB 2: SEGURIDAD Y CONTRASEÑA -->
    <form onsubmit={handleChangePassword} class="profile-form-pane">
      {#if $currentUser?.mustChangePassword}
        <div class="temp-pwd-alert">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <div>
            <strong>¡Contraseña temporal detectada!</strong>
            <p>Has ingresado mediante una clave temporal. Por seguridad, establece una nueva contraseña personal para tu cuenta.</p>
          </div>
        </div>
      {/if}

      {#if passwordError}
        <div class="auth-alert error" style="margin-bottom: 14px;">{passwordError}</div>
      {/if}

      {#if !$currentUser?.mustChangePassword}
        <div class="form-group">
          <label for="pwd-cur">Contraseña Actual</label>
          <input
            type="password"
            id="pwd-cur"
            placeholder="Tu contraseña actual"
            bind:value={currentPassword}
            required
          />
        </div>
      {/if}

      <div class="form-group">
        <label for="pwd-new-prof">Nueva Contraseña</label>
        <input
          type="password"
          id="pwd-new-prof"
          placeholder="Mínimo 6 caracteres"
          minlength="6"
          bind:value={newPassword}
          required
        />
      </div>

      <div class="form-group">
        <label for="pwd-conf-prof">Confirmar Nueva Contraseña</label>
        <input
          type="password"
          id="pwd-conf-prof"
          placeholder="Repite la nueva contraseña"
          minlength="6"
          bind:value={confirmPassword}
          required
        />
      </div>

      <div class="modal-actions" style="margin-top: 24px;">
        {#if !$currentUser?.mustChangePassword}
          <button type="button" class="btn btn-secondary" onclick={handleClose}>
            Cancelar
          </button>
        {/if}
        <button type="submit" class="btn btn-primary" disabled={isSavingPassword}>
          {isSavingPassword ? 'Actualizando...' : 'Actualizar Contraseña'}
        </button>
      </div>
    </form>
  {/if}
</Modal>

<style>
  .profile-tabs-nav {
    display: flex;
    gap: 8px;
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 12px;
    margin-bottom: 18px;
  }

  .profile-tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-radius: var(--radius-sm);
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-muted);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .profile-tab-btn:hover {
    color: var(--text-main);
    background: rgba(255, 255, 255, 0.05);
  }

  .profile-tab-btn.active {
    color: #fff;
    background: rgba(37, 211, 102, 0.15);
    border-color: rgba(37, 211, 102, 0.35);
  }

  .tab-alert-dot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #ef4444;
    color: #fff;
    font-size: 0.65rem;
    font-weight: 800;
  }

  .profile-form-pane {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .temp-pwd-alert {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 14px;
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: var(--radius-sm);
    color: #fef08a;
    font-size: 0.82rem;
  }

  .temp-pwd-alert svg {
    flex-shrink: 0;
    color: #f59e0b;
    margin-top: 2px;
  }

  .temp-pwd-alert strong {
    display: block;
    font-size: 0.85rem;
    color: #fff;
    margin-bottom: 2px;
  }

  .temp-pwd-alert p {
    margin: 0;
    color: #fde68a;
    line-height: 1.35;
  }
</style>

