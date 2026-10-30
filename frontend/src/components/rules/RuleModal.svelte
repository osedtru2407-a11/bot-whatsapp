<script>
  import { isRuleModalOpen, editingRule, saveRule, rules } from '../../stores/rules';
  import { showToast } from '../../stores/toast';
  import Modal from '../common/Modal.svelte';
  import FileDropzone from '../common/FileDropzone.svelte';

  let name = $state('');
  let parentRuleId = $state('');
  let triggerType = $state('text');
  let mediaTypeFilter = $state('any');
  let matchType = $state('contains_any');
  let triggersRaw = $state('');
  let responseText = $state('');
  let attachedMedia = $state(null);
  let leadTag = $state('Interesado');
  let pauseBot = $state(false);
  let isSubmitting = $state(false);

  let responseTextarea;

  $effect(() => {
    if ($isRuleModalOpen) {
      if ($editingRule) {
        name = $editingRule.name || '';
        parentRuleId = $editingRule.parentRuleId || '';
        triggerType = $editingRule.triggerType || 'text';
        mediaTypeFilter = $editingRule.mediaTypeFilter || 'any';
        matchType = $editingRule.matchType || 'contains_any';
        triggersRaw = ($editingRule.triggers || []).join(', ');
        responseText = $editingRule.response || '';
        attachedMedia = $editingRule.media || null;
        leadTag = $editingRule.leadTag || 'Interesado';
        pauseBot = Boolean($editingRule.pauseBot);
      } else {
        name = '';
        parentRuleId = '';
        triggerType = 'text';
        mediaTypeFilter = 'any';
        matchType = 'contains_any';
        triggersRaw = '';
        responseText = '';
        attachedMedia = null;
        leadTag = 'Interesado';
        pauseBot = false;
      }
    }
  });

  function handleClose() {
    isRuleModalOpen.set(false);
    editingRule.set(null);
  }

  function insertTool(textToInsert, wrapTag = null) {
    if (!responseTextarea) return;
    const start = responseTextarea.selectionStart;
    const end = responseTextarea.selectionEnd;
    const selected = responseText.substring(start, end);

    if (wrapTag) {
      const wrapped = `${wrapTag}${selected || 'texto'}${wrapTag}`;
      responseText = responseText.substring(0, start) + wrapped + responseText.substring(end);
    } else if (textToInsert) {
      responseText = responseText.substring(0, start) + textToInsert + responseText.substring(end);
    }
    responseTextarea.focus();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Ingresa un nombre para la ruta', 'warning');
      return;
    }

    const triggers = triggersRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    if (triggerType === 'text' && !triggers.length) {
      showToast('Ingresa al menos una palabra clave para rutas de texto', 'warning');
      return;
    }

    if (!responseText.trim() && !attachedMedia) {
      showToast('Ingresa un texto de respuesta o adjunta un archivo para enviar', 'warning');
      return;
    }

    isSubmitting = true;

    const payload = {
      name: name.trim(),
      parentRuleId: parentRuleId || null,
      triggerType,
      mediaTypeFilter,
      matchType,
      triggers,
      response: responseText.trim(),
      media: attachedMedia,
      leadTag: leadTag.trim() || 'Interesado',
      pauseBot,
      enabled: $editingRule ? ($editingRule.enabled !== false) : true
    };

    const res = await saveRule(payload, $editingRule?.id || null);
    isSubmitting = false;

    if (res.success) {
      handleClose();
    }
  }
</script>

<Modal 
  isOpen={$isRuleModalOpen}
  title={$editingRule ? 'Editar Ruta de Venta' : 'Nueva Ruta de Venta'}
  subtitle="Configura disparadores por palabras clave, archivos recibidos y respuestas enriquecidas"
  maxWidth="720px"
  onClose={handleClose}
>
  <form onsubmit={handleSubmit} class="form-body">
    <div class="form-row">
      <div class="form-group flex-2">
        <label for="rule-name-input">Nombre Descriptivo de la Ruta</label>
        <input 
          type="text" 
          id="rule-name-input" 
          placeholder="Ej: Menú de Precios, Bienvenida o Catálogo PDF" 
          bind:value={name} 
          required 
        />
      </div>

      <div class="form-group flex-1">
        <label for="rule-parent-select">Submenú de (Opcional)</label>
        <select id="rule-parent-select" bind:value={parentRuleId}>
          <option value="">(Ninguno - Ruta Principal)</option>
          {#each $rules.filter(r => !$editingRule || r.id !== $editingRule.id) as r}
            <option value={r.id}>{r.name}</option>
          {/each}
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group flex-1">
        <label for="rule-trigger-type-select">Tipo de Disparador</label>
        <select id="rule-trigger-type-select" bind:value={triggerType}>
          <option value="text">💬 Por Palabras Clave (Texto)</option>
          <option value="media">📥 Por Archivo Recibido (Foto / Audio / PDF)</option>
          <option value="both">🔄 Ambos (Texto O Archivo)</option>
        </select>
      </div>

      {#if triggerType === 'media' || triggerType === 'both'}
        <div class="form-group flex-1">
          <label for="rule-media-filter-select">Tipo de Archivo Esperado</label>
          <select id="rule-media-filter-select" bind:value={mediaTypeFilter}>
            <option value="any">Cualquier tipo de archivo</option>
            <option value="image">Solo Fotos / Comprobantes</option>
            <option value="document">Solo Documentos / PDFs</option>
            <option value="audio">Solo Audios / Notas de Voz</option>
          </select>
        </div>
      {/if}

      {#if triggerType === 'text' || triggerType === 'both'}
        <div class="form-group flex-1">
          <label for="rule-match-type-select">Tipo de Coincidencia</label>
          <select id="rule-match-type-select" bind:value={matchType}>
            <option value="contains_any">Contiene cualquiera de las palabras</option>
            <option value="exact">Coincidencia Exacta</option>
            <option value="starts_with">Empieza con la palabra</option>
          </select>
        </div>
      {/if}
    </div>

    {#if triggerType === 'text' || triggerType === 'both'}
      <div class="form-group">
        <label for="rule-triggers-input">
          Palabras Clave Disparadoras <span class="label-hint">(Separadas por comas)</span>
        </label>
        <input 
          type="text" 
          id="rule-triggers-input" 
          placeholder="ej: precio, costo, valor, catalogo, hola" 
          bind:value={triggersRaw} 
        />
      </div>
    {/if}

    <div class="form-group">
      <div class="form-label-with-tools">
        <label for="rule-response-input">Mensaje de Respuesta de WhatsApp</label>
        <div class="editor-quick-tools">
          <button type="button" class="tool-btn" onclick={() => insertTool(null, '*')} title="Negrita">*B*</button>
          <button type="button" class="tool-btn" onclick={() => insertTool(null, '_')} title="Cursiva">_I_</button>
          <button type="button" class="tool-btn" onclick={() => insertTool(null, '~')} title="Tachado">~S~</button>
          <button type="button" class="tool-btn" onclick={() => insertTool('{nombre}')} title="Insertar variable nombre">👤 &#123;nombre&#125;</button>
          <button type="button" class="tool-btn" onclick={() => insertTool('\n\n')} title="Salto de línea">↵ Salto</button>
          <button type="button" class="tool-btn" onclick={() => insertTool('💰 Precios: ')} title="Icono Precios">💰 Precios</button>
          <button type="button" class="tool-btn" onclick={() => insertTool('📞 En breve un asesor te atenderá.')} title="Atención Asesor">📞 Asesor</button>
        </div>
      </div>
      <textarea 
        id="rule-response-input" 
        bind:this={responseTextarea}
        rows="5" 
        placeholder="¡Hola! Gracias por comunicarte con nosotros. ¿En qué podemos ayudarte?" 
        bind:value={responseText}
      ></textarea>
    </div>

    <div class="form-group">
      <div style="margin-bottom: 6px; font-weight: 600; font-size: 0.86rem; color: var(--text-muted);">Adjuntar Archivo al Responder (Opcional)</div>
      <FileDropzone 
        category="rules" 
        media={attachedMedia} 
        onMediaChange={(newMedia) => attachedMedia = newMedia} 
      />
    </div>

    <div class="form-row">
      <div class="form-group flex-1">
        <label for="rule-lead-tag-input">Etiqueta para el CRM de Leads</label>
        <input 
          type="text" 
          id="rule-lead-tag-input" 
          placeholder="ej: Interesado, Comprobante Recibido" 
          bind:value={leadTag} 
        />
      </div>

      <div class="form-group flex-1" style="display: flex; align-items: center; padding-top: 22px;">
        <label class="checkbox-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input type="checkbox" bind:checked={pauseBot} />
          <span style="font-size: 0.88rem; font-weight: 500;">
            👤 Pausar bot y transferir a asesor humano tras responder
          </span>
        </label>
      </div>
    </div>

    <div class="modal-actions" style="margin-top: 24px;">
      <button type="button" class="btn btn-secondary" onclick={handleClose}>Cancelar</button>
      <button type="submit" class="btn btn-primary" disabled={isSubmitting}>
        {isSubmitting ? 'Guardando...' : ($editingRule ? 'Actualizar Ruta' : 'Crear Ruta')}
      </button>
    </div>
  </form>
</Modal>

<style>
  .form-row {
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }
  .flex-1 { flex: 1; }
  .flex-2 { flex: 2; }

  .form-label-with-tools {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .editor-quick-tools {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .tool-btn {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    color: var(--text-muted);
    font-size: 11px;
    padding: 3px 7px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .tool-btn:hover {
    background: rgba(37, 211, 102, 0.15);
    color: #fff;
    border-color: rgba(37, 211, 102, 0.4);
  }

  .label-hint {
    font-size: 0.78rem;
    color: var(--text-muted);
    font-weight: normal;
  }
</style>
