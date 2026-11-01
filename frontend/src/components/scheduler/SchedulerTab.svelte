<script>
  import { 
    schedules, 
    openCreateScheduleModal, 
    openEditScheduleModal, 
    openDuplicateScheduleModal, 
    sendScheduleNow, 
    cancelSchedule, 
    deleteSchedule, 
    loadSchedules 
  } from '../../stores/schedules';
  import { hasPermission } from '../../stores/auth';
  import { formatDate } from '../../utils/formatters';

  const statusLabels = {
    pending: 'Pendiente',
    sending: 'Enviando en Proceso...',
    sent: 'Completado',
    failed: 'Fallido',
    cancelled: 'Cancelado'
  };

  const recurrenceLabels = {
    daily: '🔁 Diario',
    weekly: '🔁 Semanal',
    monthly: '🔁 Mensual',
    yearly: '🔁 Anual'
  };

  let sendingIds = $state(new Set());

  // Polling automático cada 4s si hay alguna campaña en estado 'sending'
  $effect(() => {
    const hasActiveSending = $schedules.some(s => s.status === 'sending');
    if (!hasActiveSending) return;

    const timer = setInterval(() => {
      loadSchedules();
    }, 3500);

    return () => clearInterval(timer);
  });

  async function handleSendNow(id) {
    sendingIds.add(id);
    await sendScheduleNow(id);
    sendingIds.delete(id);
  }

  async function handleCancel(id) {
    if (confirm('¿Deseas detener y cancelar esta campaña de difusión?')) {
      await cancelSchedule(id);
    }
  }

  function handleDelete(id) {
    if (confirm('¿Deseas eliminar este registro de envío programado?')) {
      deleteSchedule(id);
    }
  }
</script>

<section id="tab-scheduler" class="tab-content active">
  <div class="content-toolbar">
    <div>
      <h2>Programación de Envíos & Difusiones de Contenido</h2>
      <p class="section-desc">Programa mensajes masivos segmentados por etiquetas CRM o grupos personalizados con protección anti-baneo.</p>
    </div>
    {#if $hasPermission('schedules:create')}
      <button type="button" class="btn btn-primary" onclick={openCreateScheduleModal}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        Programar Envío / Difusión
      </button>
    {/if}
  </div>

  {#if $schedules.length === 0}
    <div class="empty-schedules-state">
      <div style="font-size: 40px; margin-bottom: 12px;">⏰</div>
      <h3>No hay envíos programados actualmente</h3>
      <p>Crea un envío individual o una campaña de difusión para promociones, recordatorios o anuncios masivos.</p>
      {#if $hasPermission('schedules:create')}
        <button type="button" class="btn btn-primary" style="margin-top: 16px;" onclick={openCreateScheduleModal}>
          Programar Primer Envío
        </button>
      {/if}
    </div>
  {:else}
    <div class="schedules-list">
      {#each $schedules as item (item.id)}
        {@const isCampaign = item.targetType === 'tag' || item.targetType === 'group' || (item.totalRecipients > 1)}
        {@const total = item.totalRecipients || 1}
        {@const sent = item.sentRecipients || 0}
        {@const failed = item.failedRecipients || 0}
        {@const progressPct = Math.min(100, Math.round(((sent + failed) / total) * 100))}

        <div class="sched-item">
          <div class="sched-header">
            <div>
              <div class="sched-title-row">
                <span class="sched-title">{item.name}</span>
                {#if item.targetType === 'tag'}
                  <span class="audience-badge tag">🏷️ Etiqueta: {item.targetValue}</span>
                {:else if item.targetType === 'group'}
                  <span class="audience-badge group">👥 Grupo de Difusión</span>
                {:else}
                  <span class="audience-badge single">👤 Individual</span>
                {/if}
                {#if item.recurrence && item.recurrence !== 'none'}
                  <span class="audience-badge recurrence" title="Campaña periódica recurrente">
                    {recurrenceLabels[item.recurrence] || item.recurrence}
                  </span>
                {/if}
              </div>
              <div class="sched-phone">
                {#if item.targetType === 'single'}
                  Destino: +{item.recipient}
                {:else}
                  Audiencia: {total} destinatario{total !== 1 ? 's' : ''} • Pausa: {item.delaySeconds || 10}s
                {/if}
              </div>
            </div>
            <span class="sched-badge {item.status}">
              {statusLabels[item.status] || item.status}
            </span>
          </div>

          <!-- Barra de Progreso para Campañas Masivas -->
          {#if isCampaign}
            <div class="campaign-progress-box">
              <div class="progress-labels">
                <span>Progreso de entrega: <strong>{sent} de {total}</strong> ({progressPct}%)</span>
                {#if failed > 0}
                  <span class="failed-count">⚠️ {failed} fallido{failed !== 1 ? 's' : ''}</span>
                {/if}
              </div>
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: {progressPct}%;"></div>
              </div>
            </div>
          {/if}

          <div class="sched-time">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            {#if item.recurrence && item.recurrence !== 'none'}
              <span>
                Próximo ciclo: <strong>{formatDate(item.scheduledTime)}</strong>
                {#if item.lastSentAt}
                  <span class="last-cycle-note"> • Último envío realizado: {formatDate(item.lastSentAt)}</span>
                {/if}
              </span>
            {:else if item.status === 'sent' && item.sentAt}
              <span>Completado el: <strong>{formatDate(item.sentAt)}</strong></span>
            {:else}
              <span>Programado para: <strong>{formatDate(item.scheduledTime)}</strong></span>
            {/if}
          </div>

          {#if item.media}
            <div class="rule-media-badge" style="margin-bottom: 6px;">
              📎 Archivo adjunto: {item.media.filename}
            </div>
          {/if}

          <div class="sched-msg">{item.message || '(Solo archivo adjunto)'}</div>

          <div class="sched-actions">
            <!-- Botón Editar / Reprogramar (Disponible siempre que no esté enviando activamente) -->
            {#if item.status !== 'sending'}
              <button 
                type="button" 
                class="btn btn-outline-sm btn-edit-sched" 
                onclick={() => openEditScheduleModal(item)}
                title="Editar audiencia, mensaje o definir nueva fecha para reactivar esta campaña"
              >
                ✏️ Editar / Reprogramar
              </button>
            {/if}

            <!-- Botón Duplicar (Para lanzar una copia mensual/anual conservando el historial) -->
            <button 
              type="button" 
              class="btn btn-outline-sm btn-duplicate-sched" 
              onclick={() => openDuplicateScheduleModal(item)}
              title="Crear una copia de esta campaña como nueva plantilla"
            >
              📋 Duplicar
            </button>

            <!-- Botón Enviar Ahora / Relanzar Ahora -->
            {#if item.status === 'pending'}
              <button 
                type="button" 
                class="btn btn-outline-sm btn-send-now" 
                onclick={() => handleSendNow(item.id)}
                disabled={sendingIds.has(item.id)}
              >
                {sendingIds.has(item.id) ? 'Iniciando...' : '🚀 Enviar Ahora'}
              </button>
            {:else if item.status === 'sent' || item.status === 'failed' || item.status === 'cancelled'}
              <button 
                type="button" 
                class="btn btn-outline-sm btn-relaunch-now" 
                onclick={() => handleSendNow(item.id)}
                disabled={sendingIds.has(item.id)}
                title="Volver a lanzar esta campaña de inmediato"
              >
                {sendingIds.has(item.id) ? 'Iniciando...' : '🔄 Relanzar Ahora'}
              </button>
            {/if}

            {#if item.status === 'pending' || item.status === 'sending'}
              <button 
                type="button" 
                class="btn btn-outline-sm btn-cancel-camp" 
                onclick={() => handleCancel(item.id)}
                title="Detener la campaña de difusión"
              >
                🛑 Cancelar
              </button>
            {/if}

            {#if $hasPermission('schedules:delete')}
              <button 
                type="button" 
                class="icon-btn delete-btn" 
                onclick={() => handleDelete(item.id)} 
                title="Eliminar registro"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .empty-schedules-state {
    text-align: center;
    padding: 60px 20px;
    background: rgba(15, 23, 42, 0.4);
    border: 2px dashed var(--border-subtle);
    border-radius: var(--radius-lg);
    color: var(--text-muted);
    max-width: 600px;
    margin: 40px auto;
  }
  .empty-schedules-state h3 {
    color: #fff;
    margin-bottom: 6px;
    font-size: 1.15rem;
  }

  .schedules-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 20px;
  }

  .sched-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .audience-badge {
    font-size: 0.72rem;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 9999px;
  }

  .audience-badge.single {
    background: rgba(148, 163, 184, 0.15);
    color: #cbd5e1;
  }

  .audience-badge.tag {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
  }

  .audience-badge.group {
    background: rgba(168, 85, 247, 0.15);
    color: #c084fc;
  }

  .audience-badge.recurrence {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.35);
  }

  .last-cycle-note {
    color: #94a3b8;
    font-size: 0.8rem;
  }

  .campaign-progress-box {
    margin: 10px 0;
    padding: 8px 12px;
    background: rgba(15, 23, 42, 0.6);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-subtle);
  }

  .progress-labels {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-bottom: 6px;
  }

  .failed-count {
    color: #fb7185;
    font-weight: 600;
  }

  .progress-bar-bg {
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 9999px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #38bdf8, #22c55e);
    border-radius: 9999px;
    transition: width 0.3s ease;
  }

  .btn-cancel-camp {
    color: #fb7185 !important;
    border-color: rgba(244, 63, 94, 0.3) !important;
  }

  .btn-cancel-camp:hover {
    background: rgba(244, 63, 94, 0.15) !important;
    border-color: #fb7185 !important;
  }

  .btn-edit-sched {
    color: #38bdf8 !important;
    border-color: rgba(56, 189, 248, 0.35) !important;
  }

  .btn-edit-sched:hover {
    background: rgba(56, 189, 248, 0.15) !important;
    border-color: #38bdf8 !important;
  }

  .btn-duplicate-sched {
    color: #c084fc !important;
    border-color: rgba(192, 132, 252, 0.35) !important;
  }

  .btn-duplicate-sched:hover {
    background: rgba(192, 132, 252, 0.15) !important;
    border-color: #c084fc !important;
  }

  .btn-relaunch-now {
    color: #4ade80 !important;
    border-color: rgba(74, 222, 128, 0.35) !important;
  }

  .btn-relaunch-now:hover {
    background: rgba(74, 222, 128, 0.15) !important;
    border-color: #4ade80 !important;
  }
</style>
