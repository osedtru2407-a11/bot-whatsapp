<script>
  import { isScheduleModalOpen, createSchedule } from '../../stores/schedules';
  import { showToast } from '../../stores/toast';
  import Modal from '../common/Modal.svelte';
  import FileDropzone from '../common/FileDropzone.svelte';

  let name = $state('');
  let recipient = $state('');
  let scheduledTime = $state('');
  let message = $state('');
  let attachedMedia = $state(null);
  let isSubmitting = $state(false);

  $effect(() => {
    if ($isScheduleModalOpen) {
      name = '';
      recipient = '';
      message = '';
      attachedMedia = null;
      // Default to 1 hour from now
      const d = new Date(Date.now() + 60 * 60 * 1000 - new Date().getTimezoneOffset() * 60000);
      scheduledTime = d.toISOString().slice(0, 16);
    }
  });

  function handleClose() {
    isScheduleModalOpen.set(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!recipient.trim()) {
      showToast('Ingresa el número de destino', 'warning');
      return;
    }
    if (!message.trim() && !attachedMedia) {
      showToast('Ingresa un mensaje o adjunta un archivo para programar', 'warning');
      return;
    }
    if (!scheduledTime) {
      showToast('Selecciona la fecha y hora de envío', 'warning');
      return;
    }

    isSubmitting = true;
    const res = await createSchedule({
      name: name.trim() || 'Envío Programado',
      recipient: recipient.replace(/\D/g, ''),
      scheduledTime,
      message: message.trim(),
      media: attachedMedia
    });
    isSubmitting = false;

    if (res.success) {
      handleClose();
    }
  }
</script>

<Modal 
  isOpen={$isScheduleModalOpen}
  title="⏰ Programar Nuevo Envío"
  subtitle="Define un destinatario, fecha, hora y contenido con o sin archivos adjuntos"
  maxWidth="640px"
  onClose={handleClose}
>
  <form onsubmit={handleSubmit} class="form-body">
    <div class="form-row">
      <div class="form-group flex-1">
        <label for="sched-name-input">Nombre de la Campaña / Identificador</label>
        <input 
          type="text" 
          id="sched-name-input" 
          placeholder="Ej: Recordatorio Cita o Promo Fin de Mes" 
          bind:value={name} 
          required 
        />
      </div>

      <div class="form-group flex-1">
        <label for="sched-phone-input">Número de WhatsApp (con código de país)</label>
        <input 
          type="tel" 
          id="sched-phone-input" 
          placeholder="ej: 573001234567" 
          bind:value={recipient} 
          required 
        />
      </div>
    </div>

    <div class="form-group">
      <label for="sched-datetime-input">Fecha y Hora de Envío</label>
      <input 
        type="datetime-local" 
        id="sched-datetime-input" 
        bind:value={scheduledTime} 
        required 
      />
    </div>

    <div class="form-group">
      <label for="sched-message-input">Mensaje de Texto (Opcional si adjuntas archivo)</label>
      <textarea 
        id="sched-message-input" 
        rows="4" 
        placeholder="¡Hola! Te recordamos tu cita agendada para el día de hoy..." 
        bind:value={message}
      ></textarea>
    </div>

    <div class="form-group">
      <div style="margin-bottom: 6px; font-weight: 600; font-size: 0.86rem; color: var(--text-muted);">Adjuntar Archivo al Envío Programado (Opcional)</div>
      <FileDropzone 
        category="quick" 
        media={attachedMedia} 
        onMediaChange={(newMedia) => attachedMedia = newMedia} 
      />
    </div>

    <div class="modal-actions" style="margin-top: 24px;">
      <button type="button" class="btn btn-secondary" onclick={handleClose}>Cancelar</button>
      <button type="submit" class="btn btn-primary" disabled={isSubmitting}>
        {isSubmitting ? 'Programando...' : 'Programar Envío'}
      </button>
    </div>
  </form>
</Modal>

<style>
  .form-row {
    display: flex;
    gap: 16px;
  }
  .flex-1 { flex: 1; }
</style>
