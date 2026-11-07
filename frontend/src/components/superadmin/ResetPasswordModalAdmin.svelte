<!-- frontend/src/components/superadmin/ResetPasswordModalAdmin.svelte -->
<script>
  import Modal from '../common/Modal.svelte';
  import { resetUserPassword } from '../../stores/superadmin';
  import { showToast } from '../../stores/toast';

  let { isOpen = false, onClose = () => {}, user = null } = $props();

  let newPassword = $state('');
  let requireChange = $state(true);
  let showPassword = $state(true);
  let isSubmitting = $state(false);
  let generatedSuccess = $state(null); // stores the password set if completed

  $effect(() => {
    if (isOpen) {
      newPassword = generateRandomPassword();
      requireChange = true;
      showPassword = true;
      generatedSuccess = null;
    }
  });

  function generateRandomPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
    let res = '';
    for (let i = 0; i < 10; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  }

  function handleRegenerate() {
    newPassword = generateRandomPassword();
    showPassword = true;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!user || !newPassword.trim()) return;

    if (newPassword.trim().length < 6) {
      alert('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    isSubmitting = true;
    try {
      const res = await resetUserPassword(user.id, newPassword.trim(), requireChange);
      if (res.success) {
        generatedSuccess = res.temporaryPassword || newPassword.trim();
      }
    } finally {
      isSubmitting = false;
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    showToast('Contraseña copiada al portapapeles', 'info');
  }
</script>

<Modal
  {isOpen}
  title={user ? `🔑 Resetear Clave: ${user.full_name}` : '🔑 Restablecer Contraseña'}
  subtitle="Proceso administrativo de recuperación y cambio de credenciales"
  maxWidth="480px"
  {onClose}
>
  {#if generatedSuccess}
    <!-- Pantalla de Éxito con Contraseña Lista para Entregar -->
    <div class="success-screen">
      <div class="success-icon-badge">✅</div>
      <h4 class="success-title">¡Contraseña Restablecida con Éxito!</h4>
      <p class="success-desc">
        La contraseña de <strong>{user?.email}</strong> fue actualizada. Puedes copiarla y enviársela de forma segura:
      </p>

      <div class="password-display-card">
        <code class="temp-password">{generatedSuccess}</code>
        <button
          type="button"
          class="btn-copy-pass"
          onclick={() => copyToClipboard(generatedSuccess)}
          title="Copiar contraseña"
        >
          📋 Copiar
        </button>
      </div>

      {#if requireChange}
        <span class="must-change-hint">
          ℹ️ Se le solicitará cambiar esta contraseña obligatoriamente al iniciar sesión.
        </span>
      {/if}

      <div class="modal-footer-btns" style="margin-top: 16px;">
        <button type="button" class="btn btn-primary" onclick={onClose}>
          Listo / Cerrar
        </button>
      </div>
    </div>
  {:else}
    <form onsubmit={handleSubmit} class="form-body">
      <div class="user-target-info">
        <span class="target-name">👤 {user?.full_name}</span>
        <span class="target-email">✉️ {user?.email}</span>
      </div>

      <div class="form-group">
        <label for="reset-pass-input">Nueva Contraseña Provisoria</label>
        <div class="input-with-tools">
          <input
            type={showPassword ? 'text' : 'password'}
            id="reset-pass-input"
            bind:value={newPassword}
            placeholder="Escribe o genera una clave"
            minlength="6"
            required
          />
          <button
            type="button"
            class="btn-tool"
            onclick={() => showPassword = !showPassword}
            title={showPassword ? 'Ocultar' : 'Mostrar'}
          >
            {showPassword ? '🙈' : '👁️'}
          </button>
          <button
            type="button"
            class="btn-tool"
            onclick={handleRegenerate}
            title="Generar otra clave aleatoria"
          >
            🎲
          </button>
        </div>
      </div>

      <div class="require-change-box">
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={requireChange} />
          <span class="checkbox-text">
            <strong>Exigir cambio de contraseña en el próximo inicio de sesión</strong>
            <small>El usuario verá un aviso obligatorio para definir su propia clave personal al ingresar.</small>
          </span>
        </label>
      </div>

      <div class="modal-footer-btns">
        <button type="button" class="btn btn-secondary" onclick={onClose} disabled={isSubmitting}>
          Cancelar
        </button>
        <button
          type="submit"
          class="btn btn-primary"
          disabled={isSubmitting || !newPassword.trim()}
        >
          <span>{isSubmitting ? 'Guardando...' : '🔑 Establecer Nueva Contraseña'}</span>
        </button>
      </div>
    </form>
  {/if}
</Modal>

<style>
  .form-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 8px;
  }
  .user-target-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid var(--border-subtle);
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    font-size: 0.8rem;
  }
  .target-name {
    font-weight: 600;
    color: var(--text-primary);
  }
  .target-email {
    color: var(--text-secondary);
  }

  .input-with-tools {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .input-with-tools input {
    flex: 1;
    font-family: monospace;
    font-size: 0.95rem;
    font-weight: 600;
  }
  .btn-tool {
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 0.95rem;
    color: var(--text-secondary);
  }
  .btn-tool:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .require-change-box {
    background: rgba(56, 189, 248, 0.06);
    border: 1px solid rgba(56, 189, 248, 0.2);
    border-radius: var(--radius-sm);
    padding: 12px;
  }
  .checkbox-label {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    cursor: pointer;
  }
  .checkbox-label input {
    margin-top: 3px;
    accent-color: #38bdf8;
    width: 16px;
    height: 16px;
  }
  .checkbox-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .checkbox-text strong {
    font-size: 0.82rem;
    color: #e0f2fe;
  }
  .checkbox-text small {
    font-size: 0.74rem;
    color: var(--text-secondary);
    line-height: 1.3;
  }

  /* Success Screen */
  .success-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 16px 8px;
    gap: 12px;
  }
  .success-icon-badge {
    font-size: 2.2rem;
    line-height: 1;
  }
  .success-title {
    margin: 0;
    color: #86efac;
    font-size: 1.1rem;
    font-weight: 700;
  }
  .success-desc {
    margin: 0;
    font-size: 0.82rem;
    color: var(--text-secondary);
  }
  .password-display-card {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #020617;
    border: 1px solid rgba(34, 197, 94, 0.4);
    padding: 10px 18px;
    border-radius: var(--radius-sm);
    margin: 8px 0;
  }
  .temp-password {
    font-size: 1.2rem;
    font-weight: 700;
    color: #4ade80;
    letter-spacing: 1px;
  }
  .btn-copy-pass {
    padding: 6px 12px;
    background: rgba(34, 197, 94, 0.15);
    border: 1px solid rgba(34, 197, 94, 0.35);
    border-radius: 4px;
    color: #86efac;
    font-size: 0.76rem;
    font-weight: 700;
    cursor: pointer;
  }
  .btn-copy-pass:hover {
    background: rgba(34, 197, 94, 0.25);
  }
  .must-change-hint {
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .modal-footer-btns {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 10px;
    width: 100%;
  }
</style>

