<script>
  import { 
    companies, 
    currentCompanyId, 
    selectCompany, 
    isCompanyModalOpen, 
    companyModalMode 
  } from '../../stores/company';
  import { 
    botStatus, 
    isQrModalOpen, 
    toggleBot, 
    restartBot 
  } from '../../stores/botStatus';
  import { 
    currentUser, 
    userMembership, 
    hasPermission, 
    logout 
  } from '../../stores/auth';
  import { isChangePasswordModalOpen } from '../../stores/ui';

  let { onCompanySwitched } = $props();

  async function handleCompanyChange(e) {
    const newId = e.target.value;
    await selectCompany(newId, onCompanySwitched);
  }

  function openCreateCompany() {
    companyModalMode.set('create');
    isCompanyModalOpen.set(true);
  }

  function openManageCompany() {
    companyModalMode.set('edit');
    isCompanyModalOpen.set(true);
  }
</script>

<header class="app-header">
  <div class="header-left">
    <div class="brand-logo">
      <svg class="whatsapp-icon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.53 7.35C9.37 7.35 9.11 7.41 8.89 7.65C8.68 7.89 8.07 8.46 8.07 9.62C8.07 10.78 8.92 11.9 9.04 12.06C9.16 12.22 10.67 14.63 13.06 15.58C15.04 16.37 15.45 16.21 15.87 16.17C16.3 16.13 17.24 15.61 17.43 15.07C17.63 14.53 17.63 14.07 17.57 13.97C17.51 13.87 17.35 13.81 17.11 13.69C16.87 13.57 15.68 12.98 15.46 12.9C15.24 12.82 15.08 12.78 14.92 13.02C14.76 13.26 14.3 13.81 14.16 13.97C14.02 14.13 13.88 14.15 13.64 14.03C13.4 13.91 12.63 13.66 11.71 12.84C10.99 12.2 10.51 11.41 10.37 11.17C10.23 10.93 10.36 10.8 10.48 10.68C10.59 10.57 10.73 10.39 10.85 10.25C10.97 10.11 11.01 10.01 11.09 9.85C11.17 9.69 11.13 9.55 11.07 9.43C11.01 9.31 10.55 8.17 10.35 7.71C10.16 7.25 9.97 7.31 9.83 7.31C9.69 7.3 9.53 7.35 9.53 7.35Z"/>
      </svg>
      <div class="brand-text">
        <h1>WhatsApp Sales Bot</h1>
        <span class="brand-subtitle">Panel de Control & Automatización Modular (Svelte)</span>
      </div>
    </div>
  </div>

  <!-- Selector y Administrador de Empresa Activa -->
  <div class="header-company-section">
    <div class="company-badge-icon" title="Empresa Activa">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 21h18M3 7v14M21 7v14M6 10h2M6 14h2M6 18h2M10 10h4M10 14h4M10 18h4M16 10h2M16 14h2M16 18h2M9 3h6v4H9z"/>
      </svg>
    </div>
    <div class="company-select-container">
      <span class="company-label">Empresa / Bot:</span>
      <select 
        value={$currentCompanyId} 
        onchange={handleCompanyChange}
        class="company-select" 
        aria-label="Seleccionar Empresa"
      >
        {#each $companies as comp (comp.id)}
          <option value={comp.id}>
            {comp.name}{comp.phone ? ` (+${comp.phone})` : (comp.status === 'ready' ? ' (Conectado)' : ' (Sin vincular)')}
          </option>
        {/each}
      </select>
    </div>

    <button 
      type="button" 
      class="btn btn-outline-sm btn-icon" 
      onclick={openCreateCompany}
      title="Crear nueva empresa"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      <span>Nueva</span>
    </button>

    <button 
      type="button" 
      class="btn btn-outline-sm btn-icon-only" 
      onclick={openManageCompany}
      title="Configurar empresa actual"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>
  </div>

  <!-- Estado y Acciones de WhatsApp -->
  <div class="header-right">
    <!-- Status Pill -->
    <div class="connection-pill status-{$botStatus.status}">
      <span class="status-dot"></span>
      <span class="connection-text">
        {#if $botStatus.status === 'ready'}
          Conectado{$botStatus.phone ? ` (+${$botStatus.phone})` : ''}
        {:else if $botStatus.status === 'qr_ready'}
          Escanear QR Requerido
        {:else if $botStatus.status === 'authenticated'}
          Autenticado, sincronizando...
        {:else if $botStatus.status === 'initializing'}
          Iniciando WhatsApp Web...
        {:else}
          Desconectado
        {/if}
      </span>
    </div>

    <!-- Botón QR -->
    {#if $hasPermission('whatsapp:connect')}
      <button 
        type="button" 
        class="btn btn-qr-prominent {$botStatus.status === 'ready' ? 'is-connected' : 'needs-scan'}" 
        onclick={() => isQrModalOpen.set(true)}
        title="Vincular WhatsApp de esta empresa o ver Código QR"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7"></rect>
          <rect x="14" y="3" width="7" height="7"></rect>
          <rect x="14" y="14" width="7" height="7"></rect>
          <rect x="3" y="14" width="7" height="7"></rect>
        </svg>
        <span>
          {#if $botStatus.status === 'ready'}
            ✅ {$botStatus.phone ? `+${$botStatus.phone}` : 'Conectado'}
          {:else if $botStatus.status === 'qr_ready'}
            📱 Escanear Código QR
          {:else if $botStatus.status === 'initializing'}
            ⏳ Generando QR...
          {:else}
            📱 Vincular WhatsApp
          {/if}
        </span>
      </button>
    {/if}

    <!-- Bot Toggle -->
    {#if $hasPermission('whatsapp:toggle')}
      <div class="bot-toggle-wrapper">
        <label class="switch">
          <input 
            type="checkbox" 
            checked={$botStatus.botEnabled} 
            onchange={toggleBot} 
          />
          <span class="slider round"></span>
        </label>
        <span class="toggle-label">
          {$botStatus.botEnabled ? 'Bot Activo' : 'Bot Pausado'}
        </span>
      </div>
    {/if}

    <!-- Reconnect -->
    {#if $hasPermission('whatsapp:connect')}
      <button 
        type="button" 
        class="btn btn-outline-sm" 
        onclick={restartBot}
        title="Reiniciar conexión con WhatsApp"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
        </svg>
        Reconectar
      </button>
    {/if}

    <!-- User Profile & Session -->
    {#if $currentUser}
      <div class="user-header-profile">
        <div class="user-badge" title="Usuario activo">
          <span class="user-avatar">
            {($currentUser.fullName || $currentUser.username || 'U').charAt(0).toUpperCase()}
          </span>
          <div class="user-info-text">
            <span class="user-name">{$currentUser.fullName || $currentUser.username}</span>
            <span class="user-role-pill">
              {$userMembership?.roleName || '👑 Administrador'}
            </span>
          </div>
        </div>

        <button 
          type="button" 
          class="btn btn-outline-sm btn-icon-only" 
          onclick={() => isChangePasswordModalOpen.set(true)}
          title="Cambiar mi contraseña"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </button>

        <button 
          type="button" 
          class="btn btn-outline-sm btn-icon" 
          onclick={() => logout(true)}
          title="Cerrar Sesión"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          <span>Salir</span>
        </button>
      </div>
    {/if}
  </div>
</header>

<style>
  .bot-toggle-wrapper {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 6px 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-full);
    user-select: none;
  }

  .toggle-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .switch {
    position: relative;
    display: inline-flex;
    align-items: center;
    width: 40px;
    height: 22px;
    flex-shrink: 0;
    cursor: pointer;
  }

  .switch input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
    margin: 0;
    pointer-events: none;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #334155;
    border-radius: 22px;
    transition: all 0.25s ease;
  }

  .slider:before {
    position: absolute;
    content: "";
    height: 16px;
    width: 16px;
    left: 3px;
    top: 3px;
    background-color: #ffffff;
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
    transition: all 0.25s ease;
  }

  input:checked + .slider {
    background-color: var(--wa-primary);
  }

  input:checked + .slider:before {
    transform: translateX(18px);
  }
</style>
