<!-- frontend/src/components/superadmin/CleanDataModalAdmin.svelte -->
<script>
  import Modal from '../common/Modal.svelte';
  import { cleanCompanyData } from '../../stores/superadmin';

  let { isOpen = false, onClose = () => {}, company = null } = $props();

  let confirmWord = $state('');
  let isCleaning = $state(false);

  $effect(() => {
    if (isOpen) {
      confirmWord = '';
    }
  });

  async function handleClean() {
    if (!company) return;
    if (confirmWord.trim().toUpperCase() !== 'LIMPIAR') return;

    isCleaning = true;
    try {
      await cleanCompanyData(company.id);
      onClose();
    } finally {
      isCleaning = false;
    }
  }
</script>

<Modal
  {isOpen}
  title={company ? `🧹 Limpiar Data: ${company.name}` : '🧹 Limpieza de Data'}
  subtitle="Purga de almacenamiento y base de datos (Solo Superusuario)"
  maxWidth="520px"
  {onClose}
>
  <div class="clean-modal-content">
    <div class="warning-alert-card">
      <div class="warning-header">
        <span class="warning-icon">⚠️</span>
        <h4 class="warning-title">Acción Irreversible de Mantenimiento</h4>
      </div>
      <p class="warning-desc">
        Como Superusuario, tienes el privilegio de liberar espacio y resetear las conversaciones de cualquier empresa.
      </p>
      <div class="warning-details">
        <div class="detail-item to-delete">
          <span class="detail-badge red">Se eliminarán permanentemente:</span>
          <ul>
            <li>Todos los mensajes guardados en el historial de chat ({company?.messagesCount || 0} mensajes).</li>
            <li>Todos los contactos y prospectos ({company?.leadsCount || 0} prospectos).</li>
            <li>Archivos adjuntos descargados en la carpeta temporal de esta empresa.</li>
          </ul>
        </div>
        <div class="detail-item to-keep">
          <span class="detail-badge green">Se conservarán intactos:</span>
          <ul>
            <li>Flujos y rutas de venta automatizadas.</li>
            <li>Biblioteca de documentos y conocimiento de la IA.</li>
            <li>Configuraciones del negocio y credenciales de Gemini.</li>
            <li>Usuarios vinculados y sus permisos.</li>
          </ul>
        </div>
      </div>
    </div>

    <div class="confirmation-input-box">
      <label for="clean-confirm-input">
        Para confirmar esta purga, escribe la palabra <strong class="highlight-word">LIMPIAR</strong> en mayúsculas:
      </label>
      <input
        type="text"
        id="clean-confirm-input"
        bind:value={confirmWord}
        placeholder="Escribe LIMPIAR..."
        autocomplete="off"
      />
    </div>

    <div class="modal-footer-btns">
      <button type="button" class="btn btn-secondary" onclick={onClose} disabled={isCleaning}>
        Cancelar
      </button>
      <button
        type="button"
        class="btn btn-danger"
        onclick={handleClean}
        disabled={isCleaning || confirmWord.trim().toUpperCase() !== 'LIMPIAR'}
      >
        <span>{isCleaning ? 'Purgando Data...' : '🧹 Purgar Mensajes y Prospectos'}</span>
      </button>
    </div>
  </div>
</Modal>

<style>
  .clean-modal-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 8px;
  }
  .warning-alert-card {
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius-sm);
    padding: 16px;
  }
  .warning-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  .warning-icon {
    font-size: 1.2rem;
  }
  .warning-title {
    margin: 0;
    color: #f87171;
    font-size: 0.95rem;
    font-weight: 700;
  }
  .warning-desc {
    margin: 0 0 12px 0;
    font-size: 0.8rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }
  .warning-details {
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 0.78rem;
  }
  .detail-badge {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 700;
    margin-bottom: 4px;
  }
  .detail-badge.red {
    background: rgba(239, 68, 68, 0.2);
    color: #fca5a5;
  }
  .detail-badge.green {
    background: rgba(34, 197, 94, 0.2);
    color: #86efac;
  }
  .warning-details ul {
    margin: 0;
    padding-left: 20px;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .confirmation-input-box {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .confirmation-input-box label {
    font-size: 0.8rem;
    color: var(--text-primary);
  }
  .highlight-word {
    color: #f87171;
    letter-spacing: 1px;
  }
  .confirmation-input-box input {
    font-family: monospace;
    font-weight: 700;
    letter-spacing: 1px;
    font-size: 0.95rem;
  }

  .modal-footer-btns {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 10px;
  }
  .btn-danger {
    background: #dc2626;
    color: #fff;
    border: none;
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s ease;
  }
  .btn-danger:hover:not(:disabled) {
    background: #b91c1c;
  }
  .btn-danger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>

