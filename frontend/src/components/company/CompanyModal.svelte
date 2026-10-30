<script>
  import { 
    isCompanyModalOpen, 
    companyModalMode, 
    activeCompany, 
    companies, 
    currentCompanyId, 
    createCompany, 
    updateCompany, 
    deleteCompany 
  } from '../../stores/company';
  import { isQrModalOpen, restartBot } from '../../stores/botStatus';
  import Modal from '../common/Modal.svelte';

  let companyName = $state('');
  let isSubmitting = $state(false);

  $effect(() => {
    if ($isCompanyModalOpen) {
      if ($companyModalMode === 'edit' && $activeCompany) {
        companyName = $activeCompany.name || '';
      } else {
        companyName = '';
      }
    }
  });

  function handleClose() {
    isCompanyModalOpen.set(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!companyName.trim()) return;

    isSubmitting = true;
    if ($companyModalMode === 'create') {
      const res = await createCompany({ name: companyName.trim() });
      if (res.success) {
        isQrModalOpen.set(true); // Open QR modal immediately so they can scan
      }
    } else {
      await updateCompany($currentCompanyId, { name: companyName.trim() });
    }
    isSubmitting = false;
  }

  async function handleDelete() {
    if ($companies.length <= 1) {
      alert('No puedes eliminar la única empresa activa');
      return;
    }
    const name = $activeCompany?.name || 'esta empresa';
    if (!confirm(`¿Estás SEGURO de eliminar la empresa "${name}"?\nSe borrarán todas sus rutas, biblioteca, prospectos y se cerrará su sesión de WhatsApp.`)) {
      return;
    }
    await deleteCompany($currentCompanyId);
  }
</script>

<Modal 
  isOpen={$isCompanyModalOpen}
  title={$companyModalMode === 'create' ? '➕ Nueva Empresa / Bot' : `⚙️ Gestionar: ${$activeCompany?.name || 'Empresa'}`}
  subtitle={$companyModalMode === 'create' ? 'Crea un nuevo bot con número de WhatsApp y datos aislados' : 'Configura los detalles de esta empresa'}
  maxWidth="500px"
  onClose={handleClose}
>
  <form onsubmit={handleSubmit} class="form-body">
    <div class="form-group">
      <label for="company-name-input">Nombre de la Empresa o Marca</label>
      <input 
        type="text" 
        id="company-name-input" 
        placeholder="Ej: Digital Pass Express" 
        bind:value={companyName} 
        required 
      />
    </div>

    {#if $companyModalMode === 'edit'}
      <div class="company-edit-details">
        <div class="detail-row">
          <span>Estado del WhatsApp:</span>
          <strong>{$activeCompany?.status === 'ready' ? '✅ Conectado' : '⏳ Pendiente / Desconectado'}</strong>
        </div>
        <div class="detail-row">
          <span>Número Vinculado:</span>
          <strong>{$activeCompany?.phone ? `+${$activeCompany.phone}` : 'Sin vincular'}</strong>
        </div>
      </div>

      <div class="company-action-buttons">
        <button 
          type="button" 
          class="btn btn-outline-sm" 
          onclick={() => { handleClose(); isQrModalOpen.set(true); }}
        >
          📱 Ver / Cambiar QR de WhatsApp
        </button>

        <button 
          type="button" 
          class="btn btn-outline-sm" 
          onclick={restartBot}
        >
          🔄 Reiniciar Bot de esta Empresa
        </button>
      </div>

      {#if $companies.length > 1}
        <div class="danger-zone" style="margin-top: 20px; padding-top: 14px; border-top: 1px solid rgba(244, 63, 94, 0.2);">
          <button 
            type="button" 
            class="btn btn-outline-sm btn-delete-company" 
            onclick={handleDelete}
          >
            🗑️ Eliminar esta Empresa
          </button>
        </div>
      {/if}
    {/if}

    <div class="modal-actions" style="margin-top: 24px;">
      <button type="button" class="btn btn-secondary" onclick={handleClose}>Cancelar</button>
      <button type="submit" class="btn btn-primary" disabled={isSubmitting}>
        {isSubmitting ? 'Guardando...' : ($companyModalMode === 'create' ? 'Crear Empresa' : 'Guardar Cambios')}
      </button>
    </div>
  </form>
</Modal>

<style>
  .company-edit-details {
    background: rgba(15, 23, 42, 0.5);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 12px 14px;
    margin: 14px 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 0.86rem;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .company-action-buttons {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 10px;
  }

  .btn-delete-company {
    color: var(--accent-rose);
    border-color: rgba(244, 63, 94, 0.4);
    width: 100%;
  }
  .btn-delete-company:hover {
    background: rgba(244, 63, 94, 0.15);
  }
</style>
