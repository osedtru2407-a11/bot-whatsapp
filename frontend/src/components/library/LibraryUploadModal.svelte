<script>
  import { isLibraryUploadModalOpen, uploadLibraryDoc } from '../../stores/library';
  import { showToast } from '../../stores/toast';
  import { readFileAsBase64, formatBytes } from '../../utils/formatters';
  import Modal from '../common/Modal.svelte';

  let customTitle = $state('');
  let selectedFile = $state(null);
  let isUploading = $state(false);
  let fileInput;

  function handleClose() {
    isLibraryUploadModalOpen.set(false);
    customTitle = '';
    selectedFile = null;
    isUploading = false;
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      selectedFile = file;
      if (!customTitle) {
        customTitle = file.name.replace(/\.[^/.]+$/, '');
      }
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedFile) {
      showToast('Selecciona un archivo de documento (.docx, .txt)', 'warning');
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
  subtitle="Sube archivos de Word (.docx) o texto plano para que Gemini aprenda las respuestas de tu negocio"
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
      <label for="lib-file-picker">Archivo de Documento (.docx, .txt)</label>
      <input 
        type="file" 
        id="lib-file-picker" 
        bind:this={fileInput} 
        accept=".docx,.txt" 
        onchange={handleFileChange} 
        required 
      />
      {#if selectedFile}
        <div style="font-size: 0.8rem; color: var(--wa-primary); margin-top: 6px;">
          ✓ {selectedFile.name} ({formatBytes(selectedFile.size)})
        </div>
      {/if}
    </div>

    <div class="library-notice">
      <span>💡 El sistema convertirá automáticamente el archivo en Markdown limpio y estructurado, calculando el número de palabras y añadiéndolo a la memoria de contexto de Gemini.</span>
    </div>

    <div class="modal-actions" style="margin-top: 24px;">
      <button type="button" class="btn btn-secondary" onclick={handleClose}>Cancelar</button>
      <button type="submit" class="btn btn-primary" disabled={isUploading}>
        {isUploading ? 'Procesando Documento...' : 'Subir y Aprender'}
      </button>
    </div>
  </form>
</Modal>

<style>
  .library-notice {
    font-size: 0.82rem;
    color: var(--text-muted);
    background: rgba(15, 23, 42, 0.6);
    padding: 12px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-subtle);
  }
</style>
