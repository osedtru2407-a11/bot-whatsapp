<script>
  import { activeTab } from '../../stores/ui';
  import { botStatus } from '../../stores/botStatus';
  import { libraryStats } from '../../stores/library';
  import { teamMembers } from '../../stores/team';
  import { hasPermission } from '../../stores/auth';

  function setTab(tabId) {
    activeTab.set(tabId);
  }
</script>

<nav class="nav-tabs">
  {#if $hasPermission('rules:view')}
    <button 
      type="button" 
      class="tab-btn {$activeTab === 'tab-rules' ? 'active' : ''}" 
      onclick={() => setTab('tab-rules')}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      Rutas de Respuesta (Flujos de Venta)
    </button>
  {/if}

  {#if $hasPermission('schedules:view')}
    <button 
      type="button" 
      class="tab-btn {$activeTab === 'tab-scheduler' ? 'active' : ''}" 
      onclick={() => setTab('tab-scheduler')}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
      Programar Envíos
      <span class="badge-counter">{$botStatus.pendingSchedulesCount || 0}</span>
    </button>
  {/if}

  {#if $hasPermission('simulator:use')}
    <button 
      type="button" 
      class="tab-btn {$activeTab === 'tab-simulator' ? 'active' : ''}" 
      onclick={() => setTab('tab-simulator')}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
        <line x1="12" y1="18" x2="12.01" y2="18"></line>
      </svg>
      Simulador en Vivo
    </button>
  {/if}

  {#if $hasPermission('quick_send:use')}
    <button 
      type="button" 
      class="tab-btn {$activeTab === 'tab-quick-send' ? 'active' : ''}" 
      onclick={() => setTab('tab-quick-send')}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
      </svg>
      Envío Directo / Prueba
    </button>
  {/if}

  {#if $hasPermission('leads:view')}
    <button 
      type="button" 
      class="tab-btn {$activeTab === 'tab-leads' ? 'active' : ''}" 
      onclick={() => setTab('tab-leads')}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
      </svg>
      Prospectos & Archivos Recibidos
    </button>
  {/if}

  {#if $hasPermission('library:view')}
    <button 
      type="button" 
      class="tab-btn {$activeTab === 'tab-library' ? 'active' : ''}" 
      onclick={() => setTab('tab-library')}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
      </svg>
      Biblioteca (Contexto IA)
      <span class="badge-counter">{$libraryStats.activeDocuments || 0}</span>
    </button>
  {/if}

  {#if $hasPermission('settings:view')}
    <button 
      type="button" 
      class="tab-btn {$activeTab === 'tab-settings' ? 'active' : ''}" 
      onclick={() => setTab('tab-settings')}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
      Configuración
    </button>
  {/if}

  {#if $hasPermission('team:view')}
    <button 
      type="button" 
      class="tab-btn {$activeTab === 'tab-team' ? 'active' : ''}" 
      onclick={() => setTab('tab-team')}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
      </svg>
      Equipo & Roles
      <span class="badge-counter">{$teamMembers.length || 0}</span>
    </button>
  {/if}
</nav>
