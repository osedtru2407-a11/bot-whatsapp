<script>
  import { selectedLead, isLeadModalOpen } from '../../stores/leads';
  import { activeTab, quickSendInitialPhone } from '../../stores/ui';
  import { formatBytes, formatDate } from '../../utils/formatters';
  import Modal from '../common/Modal.svelte';

  function handleClose() {
    isLeadModalOpen.set(false);
    selectedLead.set(null);
  }

  function handleQuickReply() {
    if (!$selectedLead) return;
    const phone = $selectedLead.phone;
    handleClose();
    quickSendInitialPhone.set(phone);
    activeTab.set('tab-quick-send');
  }
</script>

<Modal 
  isOpen={$isLeadModalOpen}
  title={`Archivos recibidos de ${$selectedLead?.name || 'Cliente'}`}
  subtitle={`Número: +${$selectedLead?.phone || ''} • Total: ${$selectedLead?.receivedFiles?.length || 0} archivo(s)`}
  maxWidth="760px"
  onClose={handleClose}
>
  {#if !$selectedLead?.receivedFiles || $selectedLead.receivedFiles.length === 0}
    <div style="text-align: center; padding: 40px; color: var(--text-dim);">
      Este cliente no tiene archivos adjuntos recibidos.
    </div>
  {:else}
    <div class="lead-files-gallery">
      {#each $selectedLead.receivedFiles as file}
        {@const isImage = (file.mimetype || '').startsWith('image/')}
        {@const isAudio = (file.mimetype || '').startsWith('audio/') || (file.mimetype || '').includes('ogg')}

        <div class="gallery-card">
          <div class="gallery-media-preview">
            {#if isImage}
              <img src={file.url} alt={file.filename} loading="lazy" />
            {:else if isAudio}
              <span class="gallery-file-icon">🎵</span>
            {:else}
              <span class="gallery-file-icon">{(file.mimetype || '').includes('pdf') ? '📄' : '📁'}</span>
            {/if}
          </div>

          <div class="gallery-card-body">
            <span class="gallery-filename" title={file.filename}>{file.filename}</span>
            {#if file.caption}
              <div class="gallery-caption">"{file.caption}"</div>
            {/if}

            {#if isAudio}
              <!-- svelte-ignore a11y_media_has_caption -->
              <audio controls src={file.url} style="width: 100%; margin: 6px 0; height: 32px;"></audio>
            {/if}

            <div class="gallery-meta-row">
              <span>{formatBytes(file.size || 0)}</span>
              <span>{formatDate(file.receivedAt)}</span>
            </div>

            <a href={file.url} download={file.filename} target="_blank" rel="noopener noreferrer" class="gallery-download-btn">
              ⬇️ Descargar / Ver
            </a>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#snippet actions()}
    <div style="display: flex; justify-content: space-between; width: 100%;">
      <button type="button" class="btn btn-secondary" onclick={handleQuickReply}>
        💬 Responder por Envío Directo
      </button>
      <button type="button" class="btn btn-primary" onclick={handleClose}>
        Cerrar
      </button>
    </div>
  {/snippet}
</Modal>

<style>
  .lead-files-gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
    padding: 10px 0;
  }
</style>
