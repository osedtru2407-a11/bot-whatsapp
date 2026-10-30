<script>
  import { isAuthModalOpen, login } from '../../stores/auth';

  let identifier = $state('oscar');
  let password = $state('');
  let showPassword = $state(false);
  let isLoading = $state(false);
  let errorMessage = $state('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!identifier || !password) return;

    isLoading = true;
    errorMessage = '';

    const res = await login(identifier, password);
    isLoading = false;

    if (!res.success) {
      errorMessage = res.error || 'Credenciales incorrectas';
    }
  }
</script>

{#if $isAuthModalOpen}
  <div class="auth-modal-overlay">
    <div class="auth-card">
      <div class="auth-card-glow"></div>

      <div class="auth-header">
        <div class="auth-badge-icon">
          <svg class="whatsapp-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.53 7.35C9.37 7.35 9.11 7.41 8.89 7.65C8.68 7.89 8.07 8.46 8.07 9.62C8.07 10.78 8.92 11.9 9.04 12.06C9.16 12.22 10.67 14.63 13.06 15.58C15.04 16.37 15.45 16.21 15.87 16.17C16.3 16.13 17.24 15.61 17.43 15.07C17.63 14.53 17.63 14.07 17.57 13.97C17.51 13.87 17.35 13.81 17.11 13.69C16.87 13.57 15.68 12.98 15.46 12.9C15.24 12.82 15.08 12.78 14.92 13.02C14.76 13.26 14.3 13.81 14.16 13.97C14.02 14.13 13.88 14.15 13.64 14.03C13.4 13.91 12.63 13.66 11.71 12.84C10.99 12.2 10.51 11.41 10.37 11.17C10.23 10.93 10.36 10.8 10.48 10.68C10.59 10.57 10.73 10.39 10.85 10.25C10.97 10.11 11.01 10.01 11.09 9.85C11.17 9.69 11.13 9.55 11.07 9.43C11.01 9.31 10.55 8.17 10.35 7.71C10.16 7.25 9.97 7.31 9.83 7.31C9.69 7.3 9.53 7.35 9.53 7.35Z"/>
          </svg>
        </div>
        <h2 class="auth-title">WhatsApp Sales Bot Studio</h2>
        <p class="auth-subtitle">Ingresa tus credenciales para acceder al panel de control</p>
      </div>

      <form onsubmit={handleSubmit} class="auth-form-body">
        {#if errorMessage}
          <div class="auth-alert error">{errorMessage}</div>
        {/if}

        <div class="form-group auth-field">
          <label for="login-identifier" class="auth-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            USUARIO O CORREO ELECTRÓNICO
          </label>
          <div class="auth-input-wrapper">
            <input 
              type="text" 
              id="login-identifier" 
              class="auth-input" 
              placeholder="ej. oscar o oscar@admin.com" 
              bind:value={identifier} 
              required 
              autocomplete="username" 
            />
          </div>
        </div>

        <div class="form-group auth-field">
          <label for="login-password" class="auth-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            CONTRASEÑA
          </label>
          <div class="auth-input-wrapper password-wrapper">
            <input 
              type={showPassword ? 'text' : 'password'} 
              id="login-password" 
              class="auth-input" 
              placeholder="Ingresa tu contraseña" 
              bind:value={password} 
              required 
              autocomplete="current-password" 
            />
            <button 
              type="button" 
              class="btn-eye-toggle" 
              onclick={() => showPassword = !showPassword}
              title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                {#if showPassword}
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                {:else}
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                {/if}
              </svg>
            </button>
          </div>
        </div>

        <button type="submit" class="btn btn-auth-submit" disabled={isLoading}>
          <span>{isLoading ? 'Iniciando sesión...' : 'Ingresar al Panel'}</span>
          {#if !isLoading}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          {/if}
        </button>

        <div class="auth-footer-note">
          <span>🛡️ Acceso seguro con roles y base de datos PostgreSQL</span>
        </div>
      </form>
    </div>
  </div>
{/if}
