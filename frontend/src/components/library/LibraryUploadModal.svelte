<script>
  import { isLibraryUploadModalOpen, uploadLibraryDoc, pendingUploadFile } from '../../stores/library';
  import { showToast } from '../../stores/toast';
  import { readFileAsBase64, formatBytes } from '../../utils/formatters';
  import Modal from '../common/Modal.svelte';

  let customTitle = $state('');
  let selectedFile = $state(null);
  let isUploading = $state(false);
  let isDragging = $state(false);
  let fileInput = $state();

  const ALLOWED_EXTENSIONS = ['.docx', '.txt', '.md'];

  $effect(() => {
    if ($pendingUploadFile) {
      validateAndSetFile($pendingUploadFile);
      pendingUploadFile.set(null);
    }
  });

  function handleClose() {
    isLibraryUploadModalOpen.set(false);
    customTitle = '';
    selectedFile = null;
    isUploading = false;
    isDragging = false;
    if (fileInput) fileInput.value = '';
  }

  function isValidFileType(filename) {
    if (!filename) return false;
    const lower = filename.toLowerCase();
    return ALLOWED_EXTENSIONS.some(ext => lower.endsWith(ext));
  }

  function validateAndSetFile(file) {
    if (!file) return;

    if (!isValidFileType(file.name)) {
      showToast('Formato no compatible. Por favor sube archivos Word (.docx), Markdown (.md) o Texto (.txt)', 'warning');
      return;
    }

    selectedFile = file;
    if (!customTitle.trim()) {
      customTitle = file.name.replace(/\.[^/.]+$/, '');
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    isDragging = false;
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    isDragging = false;

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      validateAndSetFile(files[0]);
    }
  }

  function handleRemoveFile(e) {
    e?.stopPropagation();
    selectedFile = null;
    if (fileInput) fileInput.value = '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedFile) {
      showToast('Arrastra o selecciona un archivo (.docx, .txt, .md)', 'warning');
      return;
    }

    isUploading = true;
    try {
      const base64Data = await readFileAsBase64(selectedFile);
      const res = await uploadLibraryDoc(selectedFile.name, base64Data, customTitle.trim());
      if (res.success) {
        handleClose();
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      isUploading = false;
    }
  }
</script>

<Modal 
  isOpen={$isLibraryUploadModalOpen}
  title="📚 Agregar Documento a la Biblioteca IA"
  subtitle="Sube archivos de Word (.docx), Markdown (.md) o texto (.txt) para entrenar a Gemini"
  maxWidth="540px"
  onClose={handleClose}
>
  <form onsubmit={handleSubmit} class="form-body">
    <div class="form-group">
      <label for="lib-custom-title">Título o Tema del Documento</label>
      <input 
        type="text" 
        id="lib-custom-title" 
        placeholder="Ej: Catálogo de Servicios 2026, Preguntas Frecuentes, Políticas de Garantía" 
        bind:value={customTitle} 
      />
    </div>

    <div class="form-group">
      <span class="lib-label">Archivo del Documento</span>
      
      {#if !selectedFile}
        <!-- Dropzone interactivo cuando NO hay archivo seleccionado -->
        <div 
          class="lib-dropzone {isDragging ? 'dragover' : ''}"
          ondragover={handleDragOver}
          ondragleave={handleDragLeave}
          ondrop={handleDrop}
          onclick={() => fileInput?.click()}
          role="button"
          tabindex="0"
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInput?.click(); }}
        >
          <input 
            type="file" 
            bind:this={fileInput} 
            accept=".docx,.txt,.md,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
            style="display: none;" 
            onchange={handleFileChange} 
          />

          <div class="lib-dropzone-icon">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path>
              <path d="M12 12v9"></path>
              <path d="m16 16-4-4-4 4"></path>
            </svg>
          </div>

          <div class="lib-dropzone-main">
            <strong>Arrastra tu documento aquí</strong>
            <span>o haz clic para buscar en tu computadora</span>
          </div>

          <div class="lib-format-badges">
            <span class="badge-fmt docx">📘 Word (.docx)</span>
            <span class="badge-fmt md">📑 Markdown (.md)</span>
            <span class="badge-fmt txt">📄 Texto (.txt)</span>
          </div>
        </div>

      {:else}
        <!-- Tarjeta de archivo seleccionado -->
        <div class="lib-file-card">
          <div class="lib-file-left">
            <span class="lib-file-ext-icon">
              {selectedFile.name.endsWith('.docx') ? '📘' : (selectedFile.name.endsWith('.md') ? '📑' : '📄')}
            </span>
            <div class="lib-file-meta">
              <strong class="lib-file-name" title={selectedFile.name}>{selectedFile.name}</strong>
              <div class="lib-file-sub">
                <span>{formatBytes(selectedFile.size)}</span>
                <span class="lib-file-badge-ready">✓ Listo para aprender</span>
              </div>
            </div>
          </div>

          <div class="lib-file-actions">
            <button 
              type="button" 
              class="btn btn-outline-sm btn-change-file" 
              onclick={() => fileInput?.click()}
            >
              Cambiar
            </button>
            <button 
              type="button" 
              class="btn btn-outline-sm btn-remove-file" 
              onclick={handleRemoveFile} 
              title="Quitar archivo"
            >
              &times;
            </button>
          </div>

          <input 
            type="file" 
            bind:this={fileInput} 
            accept=".docx,.txt,.md,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
            style="display: none;" 
            onchange={handleFileChange} 
          />
        </div>
      {/if}
    </div>

    <div class="library-notice">
      <span>💡 El sistema convertirá automáticamente el archivo en Markdown limpio y estructurado, calculando el número de palabras y añadiéndolo a la memoria de contexto de Gemini.</span>
    </div>

    <div class="modal-actions" style="margin-top: 24px;">
      <button type="button" class="btn btn-secondary" onclick={handleClose}>Cancelar</button>
      <button type="submit" class="btn btn-primary" disabled={isUploading || !selectedFile}>
        {isUploading ? 'Procesando Documento...' : 'Subir y Aprender'}
      </button>
    </div>
  </form>
</Modal>

<style>
  .lib-label {
    display: block;
    margin-bottom: 8px;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-main);
  }

  .lib-dropzone {
    border: 2px dashed rgba(255, 255, 255, 0.16);
    background: rgba(15, 23, 42, 0.45);
    border-radius: var(--radius-md);
    padding: 26px 20px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }

  .lib-dropzone:hover,
  .lib-dropzone.dragover {
    border-color: var(--wa-primary);
    background: rgba(37, 211, 102, 0.08);
    box-shadow: 0 0 20px rgba(37, 211, 102, 0.12);
    transform: translateY(-1px);
  }

  .lib-dropzone-icon {
    width: 54px;
    height: 54px;
    border-radius: 50%;
    background: rgba(37, 211, 102, 0.12);
    color: var(--wa-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s;
  }

  .lib-dropzone:hover .lib-dropzone-icon,
  .lib-dropzone.dragover .lib-dropzone-icon {
    transform: scale(1.1);
  }

  .lib-dropzone-main strong {
    display: block;
    font-size: 0.95rem;
    color: var(--text-main);
    margin-bottom: 3px;
  }

  .lib-dropzone-main span {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .lib-format-badges {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
    margin-top: 4px;
  }

  .badge-fmt {
    font-size: 0.72rem;
    font-weight: 500;
    padding: 3px 8px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: var(--text-muted);
  }

  .lib-file-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(15, 23, 42, 0.75);
    border: 1px solid rgba(37, 211, 102, 0.35);
    border-radius: var(--radius-md);
    padding: 14px 16px;
    gap: 12px;
  }

  .lib-file-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .lib-file-ext-icon {
    font-size: 28px;
    line-height: 1;
    flex-shrink: 0;
  }

  .lib-file-meta {
    min-width: 0;
  }

  .lib-file-name {
    display: block;
    font-size: 0.92rem;
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 270px;
  }

  .lib-file-sub {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 3px;
  }

  .lib-file-badge-ready {
    color: var(--wa-primary);
    font-weight: 600;
  }

  .lib-file-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .btn-change-file {
    font-size: 0.75rem;
    padding: 4px 10px;
    color: #38bdf8;
    border-color: rgba(56, 189, 248, 0.3);
  }
  .btn-change-file:hover {
    background: rgba(56, 189, 248, 0.15);
  }

  .btn-remove-file {
    font-size: 1.2rem;
    line-height: 1;
    padding: 2px 8px;
    color: var(--accent-rose);
    border-color: rgba(244, 63, 94, 0.3);
    cursor: pointer;
  }
  .btn-remove-file:hover {
    background: rgba(244, 63, 94, 0.15);
  }

  .library-notice {
    font-size: 0.82rem;
    color: var(--text-muted);
    background: rgba(15, 23, 42, 0.6);
    padding: 12px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-subtle);
  }
</style>