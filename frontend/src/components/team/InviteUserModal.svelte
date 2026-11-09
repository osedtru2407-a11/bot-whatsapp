<script>
  import { isInviteModalOpen, companyRoles, inviteMember, checkTeamUserByEmail } from '../../stores/team';
  import { settings } from '../../stores/settings';
  import { showToast } from '../../stores/toast';
  import Modal from '../common/Modal.svelte';

  let email = $state('');
  let fullName = $state('');
  let phone = $state('');
  let roleId = $state('');
  let password = $state('');
  let isSubmitting = $state(false);

  // Estados de detección de usuario existente en la base de datos
  let isExistingUser = $state(false);
  let isSearchingUser = $state(false);
  let isAlreadyInCompany = $state(false);
  let currentRoleInCompany = $state('');
  let searchTimer = null;

  $effect(() => {
    if ($isInviteModalOpen) {
      email = '';
      fullName = '';
      phone = '';
      isExistingUser = false;
      isSearchingUser = false;
      isAlreadyInCompany = false;
      currentRoleInCompany = '';
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

  function handleEmailInput(e) {
    const val = e.target.value;
    email = val;
    const clean = val.trim().toLowerCase();

    if (searchTimer) clearTimeout(searchTimer);

    if (!clean || !clean.includes('@') || clean.length < 5) {
      isExistingUser = false;
      isAlreadyInCompany = false;
      currentRoleInCompany = '';
      return;
    }

    // Debounce de 400ms para no saturar consultas mientras escribe
    searchTimer = setTimeout(() => {
      performUserLookup(clean);
    }, 400);
  }

  async function handleEmailBlur() {
    const clean = email.trim().toLowerCase();
    if (clean && clean.includes('@')) {
      if (searchTimer) clearTimeout(searchTimer);
      await performUserLookup(clean);
    }
  }

  async function performUserLookup(cleanEmail) {
    isSearchingUser = true;
    try {
      const res = await checkTeamUserByEmail(cleanEmail);
      if (res && res.exists && res.user) {
        isExistingUser = true;
        fullName = res.user.fullName || fullName;
        phone = res.companyPhone || '';
        isAlreadyInCompany = Boolean(res.isAlreadyInCompany);
        currentRoleInCompany = res.currentRole || '';
      } else {
        isExistingUser = false;
        isAlreadyInCompany = false;
        currentRoleInCompany = '';
      }
    } catch (err) {
      console.error('Error buscando usuario por correo:', err);
    } finally {
      isSearchingUser = false;
    }
  }

  function handleClose() {
    if (searchTimer) clearTimeout(searchTimer);
    isInviteModalOpen.set(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !fullName.trim() || !roleId) {
      showToast('Por favor completa todos los campos requeridos', 'warning');
      return;
    }

    if (!isExistingUser && (!password || password.trim().length < 4)) {
      showToast('Debes ingresar una contraseña temporal de al menos 4 caracteres', 'warning');
      return;
    }

    isSubmitting = true;
    const res = await inviteMember({
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      roleId,
      password: isExistingUser ? undefined : password
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
  subtitle="Vincula un usuario existente o crea un nuevo acceso para que tu equipo opere el bot"
  maxWidth="560px"
  onClose={handleClose}
>
  <form onsubmit={handleSubmit} class="form-body">
    {#if ($settings?.phoneUsageType === 'personal_and_business')}
      <div class="personal-line-warning-callout">
        <span class="warning-callout-icon">⚠️</span>
        <div class="warning-callout-text">
          <strong>Aviso de Privacidad:</strong> Esta empresa usa una línea personal/mixta de WhatsApp. Este colaborador tendrá acceso al CRM y los historiales de chats sincronizados con este dispositivo.
        </div>
      </div>
    {/if}

    <!-- 1. CORREO ELECTRÓNICO (PRIMER INPUT) -->
    <div class="form-group">
      <div class="field-label-row">
        <label for="inv-email">Correo Electrónico (Para Login)</label>
        {#if isSearchingUser}
          <span class="badge-status-searching">🔍 Verificando correo...</span>
        {:else if isExistingUser}
          <span class="badge-status-found">✓ Usuario en el sistema</span>
        {/if}
      </div>
      <input 
        type="email" 
        id="inv-email" 
        placeholder="andres@empresa.com" 
        bind:value={email} 
        oninput={handleEmailInput}
        onblur={handleEmailBlur}
        required 
      />
    </div>

    <!-- BANNER INFORMATIVO SI EL USUARIO YA EXISTE EN EL SISTEMA -->
    {#if isExistingUser}
      <div class="existing-user-banner">
        <div class="banner-icon">👤</div>
        <div class="banner-content">
          <span class="banner-title">Usuario Registrado en la Plataforma</span>
          <span class="banner-desc">
            Este correo pertenece a <strong>{fullName}</strong>. Se le asignará el rol seleccionado sin modificar su contraseña actual.
          </span>
        </div>
      </div>

      {#if isAlreadyInCompany}
        <div class="already-member-warning">
          ⚠️ Este usuario ya forma parte de esta empresa con el rol <strong>{currentRoleInCompany || 'Asignado'}</strong>. Al continuar, su rol será actualizado al rol seleccionado abajo.
        </div>
      {/if}
    {/if}

    <!-- 2. NOMBRE COMPLETO (SOLO LECTURA SI YA EXISTE) -->
    <div class="form-group">
      <div class="field-label-row">
        <label for="inv-fullname">Nombre Completo</label>
        {#if isExistingUser}
          <span class="badge-readonly">🔒 Solo lectura (nombre en sistema)</span>
        {/if}
      </div>
      <input 
        type="text" 
        id="inv-fullname" 
        placeholder="Ej: Andrés Gómez" 
        bind:value={fullName} 
        readonly={isExistingUser}
        class={isExistingUser ? 'input-readonly' : ''}
        required 
      />
    </div>

    <!-- 3. TELÉFONO CORPORATIVO EN ESTA EMPRESA -->
    <div class="form-group">
      <div class="field-label-row">
        <label for="inv-phone">Teléfono Corporativo en esta Empresa (Opcional)</label>
        <span class="badge-readonly">Exclusivo de esta empresa</span>
      </div>
      <input 
        type="tel" 
        id="inv-phone" 
        placeholder="Ej: 573001234567" 
        bind:value={phone} 
      />
      <span class="field-helper-note">
        📱 Línea corporativa asignada para atender a esta empresa (no afectará el número personal del usuario ni el de otras empresas).
      </span>
    </div>

    <!-- 4. ROL Y PERMISOS -->
    <div class="form-group">
      <label for="inv-role">Rol a Asignar en esta Empresa</label>
      <select id="inv-role" bind:value={roleId} required>
        {#each $companyRoles as r}
          <option value={r.id}>{r.name} - {r.description || ''}</option>
        {/each}
      </select>
    </div>

    <!-- 5. CONTRASEÑA TEMPORAL (DESAPARECE SI EL USUARIO YA EXISTE) -->
    {#if !isExistingUser}
      <div class="form-group password-section">
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
          Copia esta contraseña y compártela con el nuevo usuario para su primer ingreso.
        </span>
      </div>
    {/if}

    <div class="modal-actions" style="margin-top: 24px;">
      <button type="button" class="btn btn-secondary" onclick={handleClose}>Cancelar</button>
      <button type="submit" class="btn btn-primary" disabled={isSubmitting || isSearchingUser}>
        {#if isSubmitting}
          Guardando...
        {:else if isExistingUser}
          {isAlreadyInCompany ? '🔄 Actualizar Rol' : '➕ Vincular a la Empresa'}
        {:else}
          ➕ Agregar al Equipo
        {/if}
      </button>
    </div>
  </form>
</Modal>

<style>
  .field-label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .badge-status-searching {
    font-size: 0.72rem;
    color: #60a5fa;
    font-weight: 500;
  }

  .badge-status-found {
    font-size: 0.72rem;
    color: #34d399;
    font-weight: 600;
    background: rgba(52, 211, 153, 0.12);
    padding: 2px 8px;
    border-radius: 12px;
    border: 1px solid rgba(52, 211, 153, 0.25);
  }

  .badge-readonly {
    font-size: 0.72rem;
    color: var(--text-muted, #94a3b8);
    font-weight: 500;
  }

  .input-readonly {
    background-color: rgba(255, 255, 255, 0.04) !important;
    color: #cbd5e1 !important;
    cursor: not-allowed;
    border-color: rgba(255, 255, 255, 0.12) !important;
  }

  .existing-user-banner {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    background: rgba(37, 99, 235, 0.1);
    border: 1px solid rgba(37, 99, 235, 0.25);
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 16px;
    animation: fadeIn 0.25s ease;
  }

  .banner-icon {
    font-size: 1.25rem;
    line-height: 1;
    margin-top: 2px;
  }

  .banner-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .banner-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: #93c5fd;
  }

  .banner-desc {
    font-size: 0.78rem;
    color: #cbd5e1;
    line-height: 1.4;
  }

  .already-member-warning {
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 0.78rem;
    color: #fbbf24;
    line-height: 1.4;
    margin-bottom: 16px;
    animation: fadeIn 0.25s ease;
  }

  .personal-line-warning-callout {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 0.8rem;
    color: #fde68a;
    line-height: 1.4;
    margin-bottom: 14px;
  }
  .warning-callout-icon {
    font-size: 1.15rem;
    line-height: 1;
    flex-shrink: 0;
  }
  .warning-callout-text strong {
    color: #fef08a;
  }

  .field-helper-note {
    font-size: 0.76rem;
    color: var(--text-muted, #94a3b8);
    margin-top: 5px;
    display: block;
    line-height: 1.35;
  }

  .password-section {
    animation: fadeIn 0.25s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>