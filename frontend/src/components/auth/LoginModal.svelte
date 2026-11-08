<script>
  import { isAuthModalOpen, login, register, forgotPassword, resetPassword, pendingResetData } from '../../stores/auth';

  let mode = $state('login'); // 'login' | 'register' | 'forgot' | 'reset'

  // Campos de inicio de sesión
  let identifier = $state('');
  let password = $state('');
  let showPassword = $state(false);

  // Campos de registro
  let fullName = $state('');
  let email = $state('');
  let companyName = $state('');
  let regPassword = $state('');
  let confirmPassword = $state('');
  let showRegPassword = $state(false);

  // Campos de recuperación de contraseña
  let forgotEmail = $state('');
  let resetEmail = $state('');
  let resetCode = $state('');
  let resetToken = $state('');
  let newPassword = $state('');
  let confirmNewPassword = $state('');
  let showNewPassword = $state(false);

  let isLoading = $state(false);
  let errorMessage = $state('');
  let successMessage = $state('');

  // Sincronizar si vino un token por URL (?resetToken=...&email=...)
  $effect(() => {
    if ($pendingResetData?.token) {
      mode = 'reset';
      resetToken = $pendingResetData.token;
      resetEmail = $pendingResetData.email || '';
      errorMessage = '';
      successMessage = 'Enlace de recuperación validado. Ingresa tu nueva contraseña.';
    }
  });

  function switchMode(newMode) {
    mode = newMode;
    errorMessage = '';
    successMessage = '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    errorMessage = '';
    successMessage = '';

    if (mode === 'login') {
      if (!identifier.trim() || !password) {
        errorMessage = 'Por favor ingresa tu usuario o correo y tu contraseña.';
        return;
      }

      isLoading = true;
      const res = await login(identifier.trim(), password);
      isLoading = false;

      if (!res.success) {
        errorMessage = res.error || 'Credenciales incorrectas';
      }
    } else if (mode === 'register') {
      if (!fullName.trim() || !email.trim() || !regPassword) {
        errorMessage = 'Nombre, correo electrónico y contraseña son obligatorios.';
        return;
      }

      if (regPassword.length < 6) {
        errorMessage = 'La contraseña debe tener al menos 6 caracteres.';
        return;
      }

      if (regPassword !== confirmPassword) {
        errorMessage = 'Las contraseñas no coinciden.';
        return;
      }

      isLoading = true;
      const res = await register(fullName.trim(), email.trim(), regPassword, companyName.trim() || undefined);
      isLoading = false;

      if (!res.success) {
        errorMessage = res.error || 'Error al crear la cuenta.';
      }
    } else if (mode === 'forgot') {
      if (!forgotEmail.trim()) {
        errorMessage = 'Por favor ingresa tu correo electrónico.';
        return;
      }

      isLoading = true;
      const res = await forgotPassword(forgotEmail.trim());
      isLoading = false;

      if (res.success) {
        successMessage = res.message || 'Se ha enviado un código y enlace a tu correo.';
        resetEmail = forgotEmail.trim();
        setTimeout(() => {
          if (mode === 'forgot') {
            mode = 'reset';
          }
        }, 1200);
      } else {
        errorMessage = res.error || 'Error al solicitar recuperación de contraseña.';
      }
    } else if (mode === 'reset') {
      if (!newPassword) {
        errorMessage = 'Por favor ingresa tu nueva contraseña.';
        return;
      }

      if (newPassword.length < 6) {
        errorMessage = 'La nueva contraseña debe tener al menos 6 caracteres.';
        return;
      }

      if (newPassword !== confirmNewPassword) {
        errorMessage = 'Las contraseñas no coinciden.';
        return;
      }

      if (!resetToken && (!resetEmail.trim() || !resetCode.trim())) {
        errorMessage = 'Debes ingresar tu correo y el código de 6 dígitos que recibiste.';
        return;
      }

      isLoading = true;
      const res = await resetPassword({
        email: resetEmail.trim() || undefined,
        code: resetCode.trim() || undefined,
        token: resetToken.trim() || undefined,
        newPassword,
      });
      isLoading = false;

      if (res.success) {
        successMessage = '¡Contraseña restablecida con éxito! Redirigiendo al inicio de sesión...';
        identifier = resetEmail;
        password = '';
        setTimeout(() => {
          switchMode('login');
        }, 1500);
      } else {
        errorMessage = res.error || 'Error al restablecer la contraseña.';
      }
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
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.53 7.35C9.37 7.35 9.11 7.41 8.89 7.65C8.68 7.89 8.07 8.46 8.07 9.62C8.07 10.78 8.92 11.9 9.04 12.06C9.16 12.22 10.67 14.63 13.06 15.58C15.04 16.37 15.45 16.21 15.87 16.17C16.3 16.13 17.24 15.61 17.43 15.07C17.63 14.53 17.63 14.07 17.57 13.97C17.51 13.87 17.35 13.81 17.11 13.69C16.87 13.57 15.68 12.98 15.46 12.9C15.24 12.82 15.08 12.78 14.92 13.02C14.76 13.26 14.3 13.81 14.16 13.97C14.02 14.13 13.88 14.15 13.64 14.03C13.4 13.91 12.63 13.66 11.71 12.84C10.99 12.2 10.51 11.41 10.37 11.17C10.23 10.93 10.36 10.8 10.48 10.68C10.59 10.57 10.73 10.39 10.85 10.25C10.97 10.01 11.01 10.01 11.09 9.85C11.17 9.69 11.13 9.55 11.07 9.43C11.01 9.31 10.55 8.17 10.35 7.71C10.16 7.25 9.97 7.31 9.83 7.31C9.69 7.3 9.53 7.35 9.53 7.35Z"/>
          </svg>
        </div>
        <h2 class="auth-title">
          {#if mode === 'login'}
            WhatsApp Sales Bot Studio
          {:else if mode === 'register'}
            Crear Nueva Cuenta
          {:else if mode === 'forgot'}
            Recuperar Contraseña
          {:else}
            Restablecer Contraseña
          {/if}
        </h2>
        <p class="auth-subtitle">
          {#if mode === 'login'}
            Ingresa tus credenciales para acceder al panel de control
          {:else if mode === 'register'}
            Registra tu usuario y crea tu primer entorno empresarial
          {:else if mode === 'forgot'}
            Ingresa tu correo para recibir un enlace y código de verificación
          {:else}
            Establece una nueva contraseña segura para tu cuenta
          {/if}
        </p>

        <!-- Pestañas para alternar entre Iniciar Sesión y Registrarse -->
        {#if mode === 'login' || mode === 'register'}
          <div class="auth-mode-tabs">
            <button 
              type="button" 
              class="auth-mode-tab {mode === 'login' ? 'active' : ''}"
              onclick={() => switchMode('login')}
            >
              🔑 Iniciar Sesión
            </button>
            <button 
              type="button" 
              class="auth-mode-tab {mode === 'register' ? 'active' : ''}"
              onclick={() => switchMode('register')}
            >
              ✨ Registrarse
            </button>
          </div>
        {:else}
          <div class="auth-recovery-bar">
            <button 
              type="button" 
              class="auth-back-btn" 
              onclick={() => switchMode('login')}
            >
              ← Volver al Inicio de Sesión
            </button>
          </div>
        {/if}
      </div>

      <form onsubmit={handleSubmit} class="auth-form-body">
        {#if errorMessage}
          <div class="auth-alert error">{errorMessage}</div>
        {/if}
        {#if successMessage}
          <div class="auth-alert success">{successMessage}</div>
        {/if}

        {#if mode === 'login'}
          <!-- MODO INICIAR SESIÓN -->
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
                placeholder="ej. admin@empresa.com o tu_usuario" 
                bind:value={identifier} 
                required 
                autocomplete="username" 
              />
            </div>
          </div>

          <div class="form-group auth-field">
            <div class="auth-label-row">
              <label for="login-password" class="auth-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                CONTRASEÑA
              </label>
              <button 
                type="button" 
                class="auth-forgot-link" 
                onclick={() => switchMode('forgot')}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
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
                aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
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

          <div class="auth-switch-prompt">
            ¿No tienes una cuenta aún?
            <button type="button" class="auth-link-button" onclick={() => switchMode('register')}>
              Regístrate aquí
            </button>
          </div>

        {:else if mode === 'register'}
          <!-- MODO REGISTRO -->
          <div class="form-group auth-field">
            <label for="reg-fullname" class="auth-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              NOMBRE COMPLETO
            </label>
            <div class="auth-input-wrapper">
              <input 
                type="text" 
                id="reg-fullname" 
                class="auth-input" 
                placeholder="Ej. Juan Pérez" 
                bind:value={fullName} 
                required 
                autocomplete="name" 
              />
            </div>
          </div>

          <div class="form-group auth-field">
            <label for="reg-email" class="auth-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
              CORREO ELECTRÓNICO
            </label>
            <div class="auth-input-wrapper">
              <input 
                type="email" 
                id="reg-email" 
                class="auth-input" 
                placeholder="ejemplo@negocio.com" 
                bind:value={email} 
                required 
                autocomplete="email" 
              />
            </div>
          </div>

          <div class="form-group auth-field">
            <label for="reg-company" class="auth-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
              </svg>
              NOMBRE DE TU EMPRESA (OPCIONAL)
            </label>
            <div class="auth-input-wrapper">
              <input 
                type="text" 
                id="reg-company" 
                class="auth-input" 
                placeholder="Ej. Mi Negocio Digital" 
                bind:value={companyName} 
              />
            </div>
          </div>

          <div class="form-group auth-field">
            <label for="reg-password" class="auth-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              CONTRASEÑA
            </label>
            <div class="auth-input-wrapper password-wrapper">
              <input 
                type={showRegPassword ? 'text' : 'password'} 
                id="reg-password" 
                class="auth-input" 
                placeholder="Mínimo 6 caracteres" 
                bind:value={regPassword} 
                required 
                minlength="6"
                autocomplete="new-password" 
              />
              <button 
                type="button" 
                class="btn-eye-toggle" 
                onclick={() => showRegPassword = !showRegPassword}
                title={showRegPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  {#if showRegPassword}
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

          <div class="form-group auth-field">
            <label for="reg-confirm-password" class="auth-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              CONFIRMAR CONTRASEÑA
            </label>
            <div class="auth-input-wrapper">
              <input 
                type={showRegPassword ? 'text' : 'password'} 
                id="reg-confirm-password" 
                class="auth-input" 
                placeholder="Repite tu contraseña" 
                bind:value={confirmPassword} 
                required 
                minlength="6"
                autocomplete="new-password" 
              />
            </div>
          </div>

          <button type="submit" class="btn btn-auth-submit" disabled={isLoading}>
            <span>{isLoading ? 'Creando cuenta...' : 'Crear Cuenta y Comenzar'}</span>
            {#if !isLoading}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            {/if}
          </button>

          <div class="auth-switch-prompt">
            ¿Ya tienes una cuenta?
            <button type="button" class="auth-link-button" onclick={() => switchMode('login')}>
              Inicia sesión aquí
            </button>
          </div>

        {:else if mode === 'forgot'}
          <!-- MODO SOLICITAR RECUPERACIÓN -->
          <div class="form-group auth-field">
            <label for="forgot-email" class="auth-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
              TU CORREO ELECTRÓNICO REGISTRADO
            </label>
            <div class="auth-input-wrapper">
              <input 
                type="email" 
                id="forgot-email" 
                class="auth-input" 
                placeholder="ejemplo@negocio.com" 
                bind:value={forgotEmail} 
                required 
                autocomplete="email" 
              />
            </div>
          </div>

          <button type="submit" class="btn btn-auth-submit" disabled={isLoading}>
            <span>{isLoading ? 'Enviando código...' : 'Enviar Código y Enlace'}</span>
            {#if !isLoading}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            {/if}
          </button>

          <div class="auth-switch-prompt">
            ¿Ya recibiste un código de verificación?
            <button type="button" class="auth-link-button" onclick={() => switchMode('reset')}>
              Ingresar código aquí
            </button>
          </div>

        {:else if mode === 'reset'}
          <!-- MODO RESTABLECER CONTRASEÑA -->
          {#if resetToken}
            <div class="auth-token-badge">
              <span class="token-icon">🔗</span>
              <span>Enlace de recuperación verificado para <strong>{resetEmail || 'tu cuenta'}</strong></span>
            </div>
          {:else}
            <div class="form-group auth-field">
              <label for="reset-email" class="auth-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                CORREO ELECTRÓNICO
              </label>
              <div class="auth-input-wrapper">
                <input 
                  type="email" 
                  id="reset-email" 
                  class="auth-input" 
                  placeholder="ejemplo@negocio.com" 
                  bind:value={resetEmail} 
                  required 
                />
              </div>
            </div>

            <div class="form-group auth-field">
              <label for="reset-code" class="auth-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                CÓDIGO DE 6 DÍGITOS RECIBIDO POR CORREO
              </label>
              <div class="auth-input-wrapper">
                <input 
                  type="text" 
                  id="reset-code" 
                  class="auth-input code-input" 
                  placeholder="123456" 
                  maxlength="6"
                  bind:value={resetCode} 
                  required 
                />
              </div>
            </div>
          {/if}

          <div class="form-group auth-field">
            <label for="reset-new-password" class="auth-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              NUEVA CONTRASEÑA
            </label>
            <div class="auth-input-wrapper password-wrapper">
              <input 
                type={showNewPassword ? 'text' : 'password'} 
                id="reset-new-password" 
                class="auth-input" 
                placeholder="Mínimo 6 caracteres" 
                bind:value={newPassword} 
                required 
                minlength="6"
                autocomplete="new-password" 
              />
              <button 
                type="button" 
                class="btn-eye-toggle" 
                onclick={() => showNewPassword = !showNewPassword}
                title={showNewPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  {#if showNewPassword}
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

          <div class="form-group auth-field">
            <label for="reset-confirm-new-password" class="auth-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              CONFIRMAR NUEVA CONTRASEÑA
            </label>
            <div class="auth-input-wrapper">
              <input 
                type={showNewPassword ? 'text' : 'password'} 
                id="reset-confirm-new-password" 
                class="auth-input" 
                placeholder="Repite tu nueva contraseña" 
                bind:value={confirmNewPassword} 
                required 
                minlength="6"
                autocomplete="new-password" 
              />
            </div>
          </div>

          <button type="submit" class="btn btn-auth-submit" disabled={isLoading}>
            <span>{isLoading ? 'Actualizando contraseña...' : 'Guardar Nueva Contraseña'}</span>
            {#if !isLoading}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            {/if}
          </button>

          <div class="auth-switch-prompt">
            ¿Recordaste tu contraseña?
            <button type="button" class="auth-link-button" onclick={() => switchMode('login')}>
              Iniciar sesión aquí
            </button>
          </div>
        {/if}

        <div class="auth-footer-note">
          <span>🛡️ Acceso seguro con roles y base de datos PostgreSQL</span>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .auth-mode-tabs {
    display: flex;
    background: rgba(10, 16, 29, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 4px;
    margin-top: 18px;
    gap: 4px;
  }

  .auth-mode-tab {
    flex: 1;
    padding: 9px 14px;
    border: none;
    background: transparent;
    color: #94a3b8;
    font-size: 0.85rem;
    font-weight: 600;
    border-radius: 9px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .auth-mode-tab:hover {
    color: #f8fafc;
    background: rgba(255, 255, 255, 0.04);
  }

  .auth-mode-tab.active {
    background: rgba(37, 211, 102, 0.18);
    color: #25d366;
    border: 1px solid rgba(37, 211, 102, 0.35);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .auth-recovery-bar {
    margin-top: 14px;
    text-align: center;
  }

  .auth-back-btn {
    background: transparent;
    border: none;
    color: #38bdf8;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    padding: 4px 8px;
    transition: color 0.15s ease;
  }

  .auth-back-btn:hover {
    color: #7dd3fc;
    text-decoration: underline;
  }

  .auth-label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .auth-label-row .auth-label {
    margin-bottom: 0;
  }

  .auth-forgot-link {
    background: transparent;
    border: none;
    color: #38bdf8;
    font-size: 0.76rem;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
    transition: color 0.15s ease;
  }

  .auth-forgot-link:hover {
    color: #7dd3fc;
    text-decoration: underline;
  }

  .code-input {
    letter-spacing: 4px;
    font-weight: 700;
    font-family: monospace;
    font-size: 1.1rem;
    text-align: center;
  }

  .auth-token-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(37, 211, 102, 0.12);
    border: 1px solid rgba(37, 211, 102, 0.3);
    padding: 10px 14px;
    border-radius: 8px;
    color: #86efac;
    font-size: 0.82rem;
    margin-bottom: 14px;
  }

  .auth-switch-prompt {
    margin-top: 18px;
    text-align: center;
    font-size: 0.84rem;
    color: #94a3b8;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .auth-link-button {
    background: transparent;
    border: none;
    color: #38bdf8;
    font-size: 0.84rem;
    font-weight: 700;
    cursor: pointer;
    padding: 2px 4px;
    text-decoration: underline;
    transition: color 0.15s ease;
  }

  .auth-link-button:hover {
    color: #7dd3fc;
  }

  .auth-alert.success {
    background: rgba(34, 197, 94, 0.15);
    border: 1px solid rgba(34, 197, 94, 0.35);
    color: #4ade80;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.84rem;
    margin-bottom: 14px;
    text-align: center;
  }
</style>
