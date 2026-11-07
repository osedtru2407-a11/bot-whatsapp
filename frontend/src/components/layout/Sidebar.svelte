<!-- frontend/src/components/layout/Sidebar.svelte -->
<script>
  import { activeTab, isSidebarCollapsed } from '../../stores/ui';
  import { botStatus, isQrModalOpen } from '../../stores/botStatus';
  import { libraryStats } from '../../stores/library';
  import { teamMembers } from '../../stores/team';
  import { hasPermission } from '../../stores/auth';

  function setTab(tabId) {
    activeTab.set(tabId);
  }

  function toggleCollapse() {
    isSidebarCollapsed.update(c => !c);
  }
</script>

<aside class="sidebar-wrapper {$isSidebarCollapsed ? 'collapsed' : ''}" aria-label="Navegación principal">
  <div class="sidebar-scroll-area">
    <!-- Grupo 1: Operación & Mensajes -->
    <div class="nav-section">
      {#if !$isSidebarCollapsed}
        <span class="nav-section-title">Comunicación & Ventas</span>
      {/if}

      {#if $hasPermission('rules:view')}
        <button 
          type="button" 
          class="sidebar-nav-item {$activeTab === 'tab-rules' ? 'active' : ''}" 
          onclick={() => setTab('tab-rules')}
          title="Rutas de Respuesta (Flujos de Venta)"
        >
          <div class="nav-icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          {#if !$isSidebarCollapsed}
            <span class="nav-label">Rutas de Respuesta</span>
          {/if}
        </button>
      {/if}

      {#if $hasPermission('schedules:view')}
        <button 
          type="button" 
          class="sidebar-nav-item {$activeTab === 'tab-scheduler' ? 'active' : ''}" 
          onclick={() => setTab('tab-scheduler')}
          title="Programar Envíos y Difusiones"
        >
          <div class="nav-icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          {#if !$isSidebarCollapsed}
            <span class="nav-label">Programar Envíos</span>
            {#if ($botStatus.pendingSchedulesCount || 0) > 0}
              <span class="sidebar-badge schedules">{$botStatus.pendingSchedulesCount}</span>
            {/if}
          {:else if ($botStatus.pendingSchedulesCount || 0) > 0}
            <span class="collapsed-dot schedules" title={`${$botStatus.pendingSchedulesCount} envíos pendientes`}></span>
          {/if}
        </button>
      {/if}

      {#if $hasPermission('leads:view')}
        <button 
          type="button" 
          class="sidebar-nav-item {$activeTab === 'tab-leads' ? 'active' : ''}" 
          onclick={() => setTab('tab-leads')}
          title="Prospectos, Contactos & CRM"
        >
          <div class="nav-icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          {#if !$isSidebarCollapsed}
            <span class="nav-label">Prospectos & CRM</span>
          {/if}
        </button>
      {/if}
    </div>

    <!-- Grupo 2: Herramientas de Prueba -->
    <div class="nav-section">
      {#if !$isSidebarCollapsed}
        <span class="nav-section-title">Pruebas & Operación</span>
      {/if}

      {#if $hasPermission('simulator:use')}
        <button 
          type="button" 
          class="sidebar-nav-item {$activeTab === 'tab-simulator' ? 'active' : ''}" 
          onclick={() => setTab('tab-simulator')}
          title="Simulador Interactivo en Vivo"
        >
          <div class="nav-icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
              <line x1="12" y1="18" x2="12.01" y2="18"></line>
            </svg>
          </div>
          {#if !$isSidebarCollapsed}
            <span class="nav-label">Simulador en Vivo</span>
          {/if}
        </button>
      {/if}

      {#if $hasPermission('quick_send:use')}
        <button 
          type="button" 
          class="sidebar-nav-item {$activeTab === 'tab-quick-send' ? 'active' : ''}" 
          onclick={() => setTab('tab-quick-send')}
          title="Envío Rápido de Prueba"
        >
          <div class="nav-icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </div>
          {#if !$isSidebarCollapsed}
            <span class="nav-label">Envío de Prueba</span>
          {/if}
        </button>
      {/if}
    </div>

    <!-- Grupo 3: Inteligencia Artificial -->
    <div class="nav-section">
      {#if !$isSidebarCollapsed}
        <span class="nav-section-title">Inteligencia Artificial</span>
      {/if}

      {#if $hasPermission('library:view')}
        <button 
          type="button" 
          class="sidebar-nav-item {$activeTab === 'tab-library' ? 'active' : ''}" 
          onclick={() => setTab('tab-library')}
          title="Biblioteca de Conocimiento de la IA"
        >
          <div class="nav-icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
          </div>
          {#if !$isSidebarCollapsed}
            <span class="nav-label">Biblioteca IA</span>
            {#if ($libraryStats.activeDocuments || 0) > 0}
              <span class="sidebar-badge library">{$libraryStats.activeDocuments}</span>
            {/if}
          {:else if ($libraryStats.activeDocuments || 0) > 0}
            <span class="collapsed-dot library" title={`${$libraryStats.activeDocuments} docs activos`}></span>
          {/if}
        </button>
      {/if}
    </div>

    <!-- Grupo 4: Configuración & Equipo -->
    <div class="nav-section">
      {#if !$isSidebarCollapsed}
        <span class="nav-section-title">Administración</span>
      {/if}

      {#if $hasPermission('settings:view')}
        <button 
          type="button" 
          class="sidebar-nav-item {$activeTab === 'tab-settings' ? 'active' : ''}" 
          onclick={() => setTab('tab-settings')}
          title="Configuración General del Bot"
        >
          <div class="nav-icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </div>
          {#if !$isSidebarCollapsed}
            <span class="nav-label">Configuración</span>
          {/if}
        </button>
      {/if}

      {#if $hasPermission('team:view')}
        <button 
          type="button" 
          class="sidebar-nav-item {$activeTab === 'tab-team' ? 'active' : ''}" 
          onclick={() => setTab('tab-team')}
          title="Equipo de Trabajo y Roles"
        >
          <div class="nav-icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
          </div>
          {#if !$isSidebarCollapsed}
            <span class="nav-label">Equipo & Roles</span>
            {#if ($teamMembers.length || 0) > 0}
              <span class="sidebar-badge team">{$teamMembers.length}</span>
            {/if}
          {:else if ($teamMembers.length || 0) > 0}
            <span class="collapsed-dot team" title={`${$teamMembers.length} colaboradores`}></span>
          {/if}
        </button>
      {/if}
    </div>
  </div>

  <!-- Pie de la barra lateral: Conexión rápida y botón de contraer -->
  <div class="sidebar-footer">
    {#if !$isSidebarCollapsed}
      <div class="bot-mini-status">
        <div class="status-indicator-dot {$botStatus.status === 'ready' ? 'ready' : ($botStatus.status === 'qr_ready' ? 'qr' : 'idle')}"></div>
        <div class="status-mini-text">
          <span class="status-title">
            {$botStatus.status === 'ready' ? 'WhatsApp Conectado' : ($botStatus.status === 'qr_ready' ? 'Esperando Escaneo QR' : 'WhatsApp Desconectado')}
          </span>
          {#if $botStatus.status === 'qr_ready'}
            <button type="button" class="mini-qr-link" onclick={() => isQrModalOpen.set(true)}>Escanear QR</button>
          {/if}
        </div>
      </div>
    {/if}

    <button 
      type="button" 
      class="sidebar-toggle-btn"
      onclick={toggleCollapse}
      title={$isSidebarCollapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
      aria-label={$isSidebarCollapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
    >
      <svg class="toggle-icon {$isSidebarCollapsed ? 'collapsed' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
      {#if !$isSidebarCollapsed}
        <span>Contraer menú</span>
      {/if}
    </button>
  </div>
</aside>

<style>
  .sidebar-wrapper {
    width: 260px;
    background: #0f172a;
    border-right: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: calc(100vh - 67px);
    position: sticky;
    top: 67px;
    flex-shrink: 0;
    transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 40;
    user-select: none;
  }

  .sidebar-wrapper.collapsed {
    width: 72px;
  }

  .sidebar-scroll-area {
    padding: 18px 12px;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    gap: 20px;
    flex: 1;
  }

  /* Scrollbar discreto */
  .sidebar-scroll-area::-webkit-scrollbar {
    width: 4px;
  }
  .sidebar-scroll-area::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
  }

  .nav-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .nav-section-title {
    font-size: 0.68rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #64748b;
    padding: 0 10px 6px 10px;
  }

  .sidebar-nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 10px 12px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    color: #94a3b8;
    font-family: inherit;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    transition: all 0.2s ease;
    position: relative;
    white-space: nowrap;
  }

  .sidebar-wrapper.collapsed .sidebar-nav-item {
    justify-content: center;
    padding: 10px 0;
  }

  .sidebar-nav-item:hover {
    color: #f8fafc;
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.04);
  }

  .sidebar-nav-item.active {
    background: rgba(37, 211, 102, 0.12);
    border-color: rgba(37, 211, 102, 0.3);
    color: var(--wa-primary);
    font-weight: 700;
  }

  .sidebar-nav-item.active::before {
    content: '';
    position: absolute;
    left: 0;
    top: 6px;
    bottom: 6px;
    width: 3px;
    background: var(--wa-primary);
    border-radius: 0 3px 3px 0;
  }

  .nav-icon-box {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 20px;
    height: 20px;
  }

  .nav-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sidebar-badge {
    padding: 2px 7px;
    border-radius: 9999px;
    font-size: 0.7rem;
    font-weight: 700;
    line-height: 1;
  }
  .sidebar-badge.schedules {
    background: rgba(56, 189, 248, 0.2);
    color: #38bdf8;
  }
  .sidebar-badge.library {
    background: rgba(168, 85, 247, 0.2);
    color: #c084fc;
  }
  .sidebar-badge.team {
    background: rgba(16, 185, 129, 0.2);
    color: #34d399;
  }

  .collapsed-dot {
    position: absolute;
    top: 6px;
    right: 14px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }
  .collapsed-dot.schedules { background: #38bdf8; }
  .collapsed-dot.library { background: #c084fc; }
  .collapsed-dot.team { background: #34d399; }

  /* Pie de la barra lateral */
  .sidebar-footer {
    padding: 12px;
    border-top: 1px solid var(--border-subtle);
    background: rgba(15, 23, 42, 0.85);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .bot-mini-status {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: var(--radius-sm);
  }

  .status-indicator-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .status-indicator-dot.ready {
    background: #22c55e;
    box-shadow: 0 0 8px rgba(34, 197, 94, 0.6);
  }
  .status-indicator-dot.qr {
    background: #eab308;
    box-shadow: 0 0 8px rgba(234, 179, 8, 0.6);
    animation: pulse 1.5s infinite;
  }
  .status-indicator-dot.idle {
    background: #64748b;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .status-mini-text {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .status-title {
    font-size: 0.72rem;
    font-weight: 600;
    color: #cbd5e1;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }

  .mini-qr-link {
    background: none;
    border: none;
    padding: 0;
    color: #38bdf8;
    font-size: 0.7rem;
    font-weight: 700;
    cursor: pointer;
    text-align: left;
    text-decoration: underline;
  }

  .sidebar-toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 8px;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-sm);
    color: #94a3b8;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .sidebar-toggle-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
    border-color: rgba(255, 255, 255, 0.12);
  }

  .toggle-icon {
    transition: transform 0.25s ease;
  }
  .toggle-icon.collapsed {
    transform: rotate(180deg);
  }
</style>

