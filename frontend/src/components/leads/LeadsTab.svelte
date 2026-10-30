<script>
  import { leads, togglePauseLead, openLeadFiles, openLeadChat } from '../../stores/leads';
  import { hasPermission } from '../../stores/auth';
  import { formatDate } from '../../utils/formatters';

  let searchQuery = $state('');

  const filteredLeads = $derived(
    $leads.filter(l => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (l.name || '').toLowerCase().includes(q) ||
             (l.phone || '').includes(q) ||
             (l.lastMessage || '').toLowerCase().includes(q) ||
             (l.tag || '').toLowerCase().includes(q);
    })
  );
</script>

<section id="tab-leads" class="tab-content active">
  <div class="content-toolbar">
    <div>
      <h2>Prospectos & Archivos Recibidos (CRM)</h2>
      <p class="section-desc">Historial de clientes que han interactuado con tu WhatsApp, con detección de comprobantes y notas de voz recibidas.</p>
    </div>
    <div class="toolbar-search">
      <input 
        type="search" 
        class="search-input" 
        placeholder="🔍 Buscar por nombre, teléfono o mensaje..." 
        bind:value={searchQuery} 
      />
    </div>
  </div>

  {#if filteredLeads.length === 0}
    <div class="empty-leads-state">
      <div style="font-size: 40px; margin-bottom: 12px;">👥</div>
      <h3>No hay prospectos {searchQuery ? 'que coincidan con la búsqueda' : 'registrados aún'}</h3>
      <p>Cuando tus clientes escriban o envíen archivos a tu número de WhatsApp aparecerán automáticamente organizados aquí.</p>
    </div>
  {:else}
    <div class="leads-table-container">
      <table class="leads-table">
        <thead>
          <tr>
            <th>Contacto</th>
            <th>Etiqueta</th>
            <th>Último Mensaje</th>
            <th>Archivos</th>
            <th>Última Interacción</th>
            <th>Estado del Bot</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredLeads as lead (lead.phone)}
            {@const filesCount = lead.receivedFiles?.length || 0}
            <tr>
              <td>
                <div class="lead-name-box">
                  <strong>{lead.name || 'Sin Nombre'}</strong>
                  <span class="lead-phone-text">+{lead.phone}</span>
                </div>
              </td>
              <td>
                <span class="badge-tag badge-tag-{(lead.tag || 'nuevo').toLowerCase().replace(/\s+/g, '')}">
                  🏷️ {lead.tag || 'Nuevo'}
                </span>
              </td>
              <td class="last-msg-cell" title={lead.lastMessage || ''}>
                {lead.lastMessage || '-'}
              </td>
              <td>
                {#if filesCount > 0}
                  <button 
                    type="button" 
                    class="btn-view-files" 
                    onclick={() => openLeadFiles(lead)}
                  >
                    📁 Ver {filesCount} archivo(s)
                  </button>
                {:else}
                  <span class="badge-no-files">Sin archivos</span>
                {/if}
              </td>
              <td class="date-cell">{formatDate(lead.lastInteraction)}</td>
              <td>
                {#if lead.humanPaused}
                  <span style="color: #fb7185; font-weight: 600;">🛑 Pausado (Humano)</span>
                {:else}
                  <span style="color: #4ade80;">🤖 Bot Activo</span>
                {/if}
              </td>
              <td>
                <div class="lead-actions-row">
                  <button 
                    type="button" 
                    class="btn btn-outline-sm btn-view-chat" 
                    onclick={() => openLeadChat(lead)}
                    title="Ver historial de conversación y contexto"
                  >
                    💬 Ver Chat
                  </button>
                  {#if $hasPermission('leads:pause')}
                    <button 
                      type="button" 
                      class="btn btn-outline-sm btn-toggle-lead" 
                      onclick={() => togglePauseLead(lead.phone)}
                      title={lead.humanPaused ? 'Reactivar atención automática del bot' : 'Pausar bot para atención humana'}
                    >
                      {lead.humanPaused ? 'Reactivar' : 'Pausar'}
                    </button>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  .toolbar-search {
    display: flex;
    align-items: center;
  }
  .search-input {
    min-width: 320px;
  }

  .empty-leads-state {
    text-align: center;
    padding: 60px 20px;
    background: rgba(15, 23, 42, 0.4);
    border: 2px dashed var(--border-subtle);
    border-radius: var(--radius-lg);
    color: var(--text-muted);
    max-width: 600px;
    margin: 40px auto;
  }
  .empty-leads-state h3 {
    color: #fff;
    margin-bottom: 6px;
    font-size: 1.15rem;
  }

  .last-msg-cell {
    max-width: 240px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .date-cell {
    font-size: 0.82rem;
    color: var(--text-muted);
  }

  .lead-actions-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .btn-view-chat {
    color: #38bdf8 !important;
    border-color: rgba(56, 189, 248, 0.3) !important;
  }
  .btn-view-chat:hover {
    background: rgba(56, 189, 248, 0.12) !important;
    border-color: #38bdf8 !important;
  }
</style>
