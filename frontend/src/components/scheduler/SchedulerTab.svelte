<script>
  import { schedules, isScheduleModalOpen, sendScheduleNow, deleteSchedule } from '../../stores/schedules';
  import { hasPermission } from '../../stores/auth';
  import { formatDate } from '../../utils/formatters';

  const statusLabels = {
    pending: 'Pendiente',
    sent: 'Enviado con Éxito',
    failed: 'Fallido'
  };

  let sendingIds = $state(new Set());

  async function handleSendNow(id) {
    sendingIds.add(id);
    await sendScheduleNow(id);
    sendingIds.delete(id);
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
      <h2>Programación de Envíos Automáticos</h2>
      <p class="section-desc">Programa mensajes masivos o recordatorios con fecha y hora específicas para tus clientes.</p>
    </div>
    {#if $hasPermission('schedules:create')}
      <button type="button" class="btn btn-primary" onclick={() => isScheduleModalOpen.set(true)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        Programar Envío
      </button>
    {/if}
  </div>

  {#if $schedules.length === 0}
    <div class="empty-schedules-state">
      <div style="font-size: 40px; margin-bottom: 12px;">⏰</div>
      <h3>No hay envíos programados actualmente</h3>
      <p>Crea un envío para notificar a tus clientes con fechas límites, recordatorios de citas o lanzamientos.</p>
      {#if $hasPermission('schedules:create')}
        <button type="button" class="btn btn-primary" style="margin-top: 16px;" onclick={() => isScheduleModalOpen.set(true)}>
          Programar Primer Envío
        </button>
      {/if}
    </div>
  {:else}
    <div class="schedules-list">
      {#each $schedules as item (item.id)}
        <div class="sched-item">
          <div class="sched-header">
            <div>
              <div class="sched-title">{item.name}</div>
              <div class="sched-phone">Destino: +{item.recipient}</div>
            </div>
            <span class="sched-badge {item.status}">
              {statusLabels[item.status] || item.status}
            </span>
          </div>

          <div class="sched-time">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            Programado para: <strong>{formatDate(item.scheduledTime)}</strong>
          </div>

          {#if item.media}
            <div class="rule-media-badge" style="margin-bottom: 6px;">
              📎 Archivo adjunto: {item.media.filename}
            </div>
          {/if}

          <div class="sched-msg">{item.message || '(Solo archivo adjunto)'}</div>

          <div class="sched-actions">
            {#if item.status === 'pending'}
              <button 
                type="button" 
                class="btn btn-outline-sm btn-send-now" 
                onclick={() => handleSendNow(item.id)}
                disabled={sendingIds.has(item.id)}
              >
                {sendingIds.has(item.id) ? 'Enviando...' : '🚀 Enviar Ahora'}
              </button>
            {/if}
            {#if $hasPermission('schedules:delete')}
              <button 
                type="button" 
                class="icon-btn delete-btn" 
                onclick={() => handleDelete(item.id)} 
                title="Eliminar"
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
</style>
