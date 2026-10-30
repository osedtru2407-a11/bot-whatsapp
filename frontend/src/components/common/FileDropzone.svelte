<script>
  import { api } from '../../services/api';
  import { showToast } from '../../stores/toast';
  import { formatBytes } from '../../utils/formatters';

  let { 
    category = 'rules', 
    media = null, 
    label = 'Arrastra una foto, catálogo en PDF o audio aquí',
    sublabel = 'o haz clic para explorar en tu dispositivo',
    accept = 'image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,audio/*',
    onMediaChange 
  } = $props();

  let isDragging = $state(false);
  let isUploading = $state(false);
  let fileInput = $state();

  function handleDragOver(e) {
    e.preventDefault();
    isDragging = true;
  }

  function handleDragLeave(e) {
    e.preventDefault();
    isDragging = false;
  }

  function handleDrop(e) {
    e.preventDefault();
    isDragging = false;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFile(e.dataTransfer.files[0]);
    }
  }

  function handleFileSelect(e) {
    if (e.target.files && e.target.files.length > 0) {
      uploadFile(e.target.files[0]);
    }
  }

  async function uploadFile(file) {
    isUploading = true;
    try {
      const res = await api.upload(file, category);
      if (res && res.file) {
        onMediaChange?.(res.file);
        showToast(`Archivo "${file.name}" cargado con éxito`, 'success');
      }
    } catch (err) {
      showToast(`Error al subir archivo: ${err.message}`, 'error');
    } finally {
      isUploading = false;
      if (fileInput) fileInput.value = '';
    }
  }

  function removeMedia(e) {
    e.stopPropagation();
    onMediaChange?.(null);
  }
</script>

<div class="dropzone-container">
  {#if !media}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div 
      class="file-dropzone {isDragging ? 'dragover' : ''} {isUploading ? 'uploading' : ''}"
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      ondrop={handleDrop}
      onclick={() => fileInput?.click()}
    >
      <input 
        type="file" 
        bind:this={fileInput} 
        {accept}
        style="display: none;" 
        onchange={handleFileSelect} 
      />

      {#if isUploading}
        <div class="dropzone-spinner"></div>
        <p class="dropzone-text">Subiendo archivo al servidor...</p>
      {:else}
        <div class="dropzone-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
        </div>
        <p class="dropzone-title">{label}</p>
        <span class="dropzone-sub">{sublabel}</span>
      {/if}
    </div>
  {:else}
    <div class="file-preview-card">
      <div class="file-preview-left">
        {#if (media.mimetype || '').startsWith('image/')}
          <img src={media.url} alt={media.filename} class="preview-thumbnail" />
        {:else if (media.mimetype || '').includes('pdf')}
          <span class="file-type-icon">📄</span>
        {:else if (media.mimetype || '').startsWith('audio/')}
          <span class="file-type-icon">🎵</span>
        {:else}
          <span class="file-type-icon">📁</span>
        {/if}
        <div class="file-preview-info">
          <strong class="file-preview-name" title={media.filename || media.originalName}>
            {media.filename || media.originalName}
          </strong>
          <span class="file-preview-size">{formatBytes(media.size || 0)}</span>
        </div>
      </div>
      <button type="button" class="btn-remove-media" onclick={removeMedia} title="Quitar archivo">
        &times;
      </button>
    </div>
  {/if}
</div>

<style>
  .dropzone-container {
    width: 100%;
  }

  .file-dropzone {
    border: 2px dashed rgba(255, 255, 255, 0.15);
    background: rgba(15, 23, 42, 0.4);
    border-radius: var(--radius-md);
    padding: 24px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .file-dropzone:hover, .file-dropzone.dragover {
    border-color: var(--wa-primary);
    background: rgba(37, 211, 102, 0.05);
  }

  .dropzone-icon {
    color: var(--wa-primary);
    margin-bottom: 4px;
  }

  .dropzone-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-main);
  }

  .dropzone-sub {
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  .dropzone-spinner {
    width: 24px;
    height: 24px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-top-color: var(--wa-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .file-preview-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(37, 211, 102, 0.3);
    border-radius: var(--radius-md);
    padding: 12px 16px;
    gap: 12px;
  }

  .file-preview-left {
    display: flex;
    align-items: center;
    gap: 12px;
    overflow: hidden;
  }

  .preview-thumbnail {
    width: 44px;
    height: 44px;
    object-fit: cover;
    border-radius: 6px;
    border: 1px solid var(--border-subtle);
  }

  .file-type-icon {
    font-size: 26px;
    line-height: 1;
  }

  .file-preview-info {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .file-preview-name {
    font-size: 0.85rem;
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 320px;
  }

  .file-preview-size {
    font-size: 0.75rem;
    color: var(--text-dim);
    font-family: var(--font-mono);
  }

  .btn-remove-media {
    background: rgba(244, 63, 94, 0.15);
    color: #fb7185;
    border: none;
    border-radius: 50%;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-remove-media:hover {
    background: rgba(244, 63, 94, 0.3);
    color: #fff;
  }
</style>
