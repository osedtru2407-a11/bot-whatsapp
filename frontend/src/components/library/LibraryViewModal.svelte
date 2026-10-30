<script>
  import { viewingDoc, isLibraryViewModalOpen, updateLibraryDocContent } from '../../stores/library';
  import { hasPermission } from '../../stores/auth';
  import Modal from '../common/Modal.svelte';

  let contentText = $state('');
  let isSaving = $state(false);

  $effect(() => {
    if ($isLibraryViewModalOpen && $viewingDoc) {
      contentText = $viewingDoc.content || '';
    }
  });

  function handleClose() {
    isLibraryViewModalOpen.set(false);
    viewingDoc.set(null);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!$viewingDoc) return;

    isSaving = true;
    const res = await updateLibraryDocContent($viewingDoc.id, contentText);
    isSaving = false;

    if (res.success) {
      handleClose();
    }
  }
</script>

<Modal 
  isOpen={$isLibraryViewModalOpen}
  title={`Markdown Limpio: ${$viewingDoc?.name || 'Documento'}`}
  subtitle={`Archivo original: ${$viewingDoc?.originalFilename || ''} (${$viewingDoc?.wordCount || 0} palabras convertidas)`}
  maxWidth="800px"
  onClose={handleClose}
>
  <form onsubmit={handleSave} class="form-body">
    <div class="form-group">
      <label for="lib-edit-textarea">Contenido de Conocimiento para Gemini (Markdown)</label>
      <textarea 
        id="lib-edit-textarea" 
        rows="16" 
        style="font-family: var(--font-mono); font-size: 0.85rem; line-height: 1.5;"
        bind:value={contentText}
      ></textarea>
    </div>

    <div class="modal-actions" style="margin-top: 20px;">
      <button type="button" class="btn btn-secondary" onclick={handleClose}>Cerrar</button>
      {#if $hasPermission('library:edit')}
        <button type="submit" class="btn btn-primary" disabled={isSaving}>
          {isSaving ? 'Guardando...' : 'Guardar Cambios de Texto'}
        </button>
      {/if}
    </div>
  </form>
</Modal>
