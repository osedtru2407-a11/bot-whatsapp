<script>
  import { untrack } from 'svelte';
  import { isImportModalOpen, leads } from '../../stores/leads';
  import { importContactsCsv, syncContactsFromWhatsApp } from '../../stores/contacts';
  import { groups, loadGroups } from '../../stores/groups';
  import { showToast } from '../../stores/toast';
  import Modal from '../common/Modal.svelte';

  let activeTab = $state('csv'); // 'csv' | 'whatsapp'
  let defaultPrefix = $state('57');
  let defaultTag = $state('Importado Google');
  let selectedGroupId = $state('');
  let isProcessing = $state(false);

  // Estado para el archivo CSV
  let csvFile = $state(null);
  let csvFileName = $state('');
  let csvTextContent = $state('');
  let previewStats = $state(null);

  // Derivar etiquetas existentes
  const existingTags = $derived(
    Array.from(new Set($leads.map(l => l.tag || 'Nuevo'))).filter(Boolean)
  );

  let wasModalOpen = false;
  $effect(() => {
    const isOpen = $isImportModalOpen;
    if (isOpen && !wasModalOpen) {
      wasModalOpen = true;
      untrack(() => {
        loadGroups();
        csvFile = null;
        csvFileName = '';
        csvTextContent = '';
        previewStats = null;
        isProcessing = false;
      });
    } else if (!isOpen) {
      wasModalOpen = false;
    }
  });

  function handleClose() {
    isImportModalOpen.set(false);
  }

  function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    csvFileName = file.name;
    const reader = new FileReader();
    reader.onload = (event) => {
      csvTextContent = event.target?.result || '';
      // Conteo rápido de líneas aproximadas
      const lines = csvTextContent.split('\n').filter(l => l.trim().length > 0);
      previewStats = {
        totalLines: Math.max(0, lines.length - 1)
      };
    };
    reader.readAsText(file);
  }

  async function handleImportCsv(e) {
    e.preventDefault();
    if (!csvTextContent) {
      showToast('Selecciona un archivo CSV para importar', 'warning');
      return;
    }

    isProcessing = true;
    const res = await importContactsCsv({
      csv: csvTextContent,
      defaultPrefix,
      defaultTag: defaultTag.trim() || 'Importado Google',
      groupId: selectedGroupId || null
    });
    isProcessing = false;

    if (res.success) {
      handleClose();
    }
  }

  async function handleSyncWhatsApp(e) {
    e.preventDefault();
    isProcessing = true;
    const res = await syncContactsFromWhatsApp({
      defaultTag: defaultTag.trim() || 'Agenda WhatsApp',
      groupId: selectedGroupId || null
    });
    isProcessing = false;

    if (res.success) {
      handleClose();
    }
  }
</script>

<Modal 
  isOpen={$isImportModalOpen}
  title="📥 Importar Contactos a la Agenda de Difusión"
  subtitle="Importa contactos desde Google Contacts o sincroniza la agenda de WhatsApp para difusiones (no se mezclan con los prospectos del embudo CRM)"
  maxWidth="640px"
  onClose={handleClose}
>
  <!-- Pestañas de origen -->
  <div class="import-tabs">
    <button 
      type="button" 
      class="import-tab-btn {activeTab === 'csv' ? 'active' : ''}" 
      onclick={() => activeTab = 'csv'}
    >
      📄 Archivo CSV (Google Contacts)
    </button>
    <button 
      type="button" 
      class="import-tab-btn {activeTab === 'whatsapp' ? 'active' : ''}" 
      onclick={() => activeTab = 'whatsapp'}
    >
      📱 Sincronizar desde WhatsApp
    </button>
  </div>

  {#if activeTab === 'csv'}
    <form onsubmit={handleImportCsv} class="import-form">
      <div class="upload-dropzone">
        <label for="csv-file-input" class="dropzone-label">
          <div style="font-size: 32px; margin-bottom: 8px;">📂</div>
          {#if csvFileName}
            <div class="file-name-pill">✅ {csvFileName}</div>
            {#if previewStats}
              <div class="file-stats">Aproximadamente {previewStats.totalLines} fila(s) detectadas</div>
            {/if}
            <span style="font-size: 0.78rem; color: #38bdf8; margin-top: 6px;">Clic para cambiar de archivo</span>
          {:else}
            <strong>Haz clic para seleccionar tu archivo CSV</strong>
            <span>Compatible con el archivo exportado desde contactos de Google</span>
          {/if}
        </label>
        <input 
          type="file" 
          id="csv-file-input" 
          accept=".csv,text/csv" 
          class="hidden-file-input" 
          onchange={handleFileSelected} 
        />
      </div>

      <div class="form-row" style="margin-top: 16px;">
        <div class="form-group flex-1">
          <label for="imp-prefix-input">Código de País por Defecto</label>
          <input 
            type="text" 
            id="imp-prefix-input" 
            placeholder="57" 
            bind:value={defaultPrefix} 
            title="Se agregará si el número telefónico en el CSV no tiene código de país"
          />
          <small class="field-hint">Ej: 57 para Colombia, 52 para México</small>
        </div>

        <div class="form-group flex-1">
          <label for="imp-tag-input">Etiqueta a Asignar</label>
          <input 
            type="text" 
            id="imp-tag-input" 
            list="imp-tag-datalist"
            placeholder="Ej: Clientes VIP, Google..." 
            bind:value={defaultTag} 
          />
          <datalist id="imp-tag-datalist">
            {#each existingTags as t}
              <option value={t}>{t}</option>
            {/each}
          </datalist>
        </div>
      </div>

      <div class="form-group">
        <label for="imp-group-select">Agregar a un Grupo de Difusión (Opcional)</label>
        <select id="imp-group-select" class="form-select" bind:value={selectedGroupId}>
          <option value="">Ninguno (Solo importar a contactos generales)</option>
          {#each $groups as g}
            <option value={g.id}>👥 {g.name} ({g.memberCount || 0} miembros actuales)</option>
          {/each}
        </select>
      </div>

      <div class="modal-actions" style="margin-top: 24px;">
        <button type="button" class="btn btn-secondary" onclick={handleClose}>Cancelar</button>
        <button type="submit" class="btn btn-primary" disabled={isProcessing || !csvTextContent}>
          {isProcessing ? 'Importando...' : 'Importar Contactos a PostgreSQL'}
        </button>
      </div>
    </form>
  {:else}
    <form onsubmit={handleSyncWhatsApp} class="import-form">
      <div class="sync-info-box">
        <div style="font-size: 32px; margin-bottom: 8px;">📲</div>
        <h4>Sincronización Directa de Agenda</h4>
        <p>
          Esta opción lee los contactos que tienes guardados en la agenda del teléfono conectado a WhatsApp Web
          y los incorpora automáticamente como prospectos en la base de datos de tu empresa.
        </p>
      </div>

      <div class="form-row" style="margin-top: 16px;">
        <div class="form-group flex-1">
          <label for="sync-tag-input">Etiqueta para los contactos de WhatsApp</label>
          <input 
            type="text" 
            id="sync-tag-input" 
            placeholder="Agenda WhatsApp" 
            bind:value={defaultTag} 
          />
        </div>

        <div class="form-group flex-1">
          <label for="sync-group-select">Agregar al Grupo (Opcional)</label>
          <select id="sync-group-select" class="form-select" bind:value={selectedGroupId}>
            <option value="">Ninguno (Solo importar)</option>
            {#each $groups as g}
              <option value={g.id}>👥 {g.name} ({g.memberCount || 0} miembros)</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="modal-actions" style="margin-top: 24px;">
        <button type="button" class="btn btn-secondary" onclick={handleClose}>Cancelar</button>
        <button type="submit" class="btn btn-primary" disabled={isProcessing}>
          {isProcessing ? 'Sincronizando...' : 'Traer Contactos desde WhatsApp'}
        </button>
      </div>
    </form>
  {/if}
</Modal>

<style>
  .import-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 10px;
  }

  .import-tab-btn {
    flex: 1;
    padding: 10px 14px;
    background: transparent;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    color: var(--text-muted);
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .import-tab-btn:hover {
    color: #fff;
    border-color: rgba(56, 189, 248, 0.4);
  }

  .import-tab-btn.active {
    background: rgba(56, 189, 248, 0.15);
    border-color: #38bdf8;
    color: #38bdf8;
  }

  .upload-dropzone {
    border: 2px dashed rgba(56, 189, 248, 0.3);
    border-radius: var(--radius-md);
    padding: 24px 16px;
    text-align: center;
    background: rgba(15, 23, 42, 0.4);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .upload-dropzone:hover {
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.05);
  }

  .dropzone-label {
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .hidden-file-input {
    display: none;
  }

  .file-name-pill {
    background: rgba(34, 197, 94, 0.15);
    color: #4ade80;
    padding: 4px 12px;
    border-radius: 9999px;
    font-size: 0.88rem;
    font-weight: 600;
  }

  .file-stats {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-top: 4px;
  }

  .field-hint {
    display: block;
    font-size: 0.74rem;
    color: var(--text-dim);
    margin-top: 4px;
  }

  .sync-info-box {
    text-align: center;
    padding: 24px;
    background: rgba(15, 23, 42, 0.5);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
  }

  .sync-info-box h4 {
    color: #fff;
    margin-bottom: 6px;
  }

  .sync-info-box p {
    font-size: 0.86rem;
    color: var(--text-muted);
    max-width: 480px;
    margin: 0 auto;
  }

  .form-row {
    display: flex;
    gap: 16px;
  }

  .flex-1 { flex: 1; }

  .form-select {
    width: 100%;
    padding: 10px 12px;
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    color: #fff;
    font-size: 0.9rem;
    outline: none;
  }
</style>

