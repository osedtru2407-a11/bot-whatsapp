<script>
  import { toggleRule, deleteRule, editingRule, isRuleModalOpen, rules } from '../../stores/rules';
  import { hasPermission } from '../../stores/auth';
  import { formatBytes } from '../../utils/formatters';

  let { rule } = $props();

  const matchTypeLabels = {
    contains_any: 'Contiene palabra',
    exact: 'Coincidencia exacta',
    starts_with: 'Empieza con'
  };

  const mediaFilterLabels = {
    any: 'Cualquier archivo',
    image: 'Foto / Comprobante',
    document: 'Documento / PDF',
    audio: 'Audio / Nota de voz'
  };

  const parentRule = $derived(rule.parentRuleId ? $rules.find(r => r.id === rule.parentRuleId) : null);

  function handleToggle(e) {
    toggleRule(rule.id, e.target.checked);
  }

  function handleEdit() {
    editingRule.set(rule);
    isRuleModalOpen.set(true);
  }

  function handleDelete() {
    if (confirm(`¿Estás seguro de eliminar la ruta "${rule.name}"?`)) {
      deleteRule(rule.id, rule.name);
    }
  }
</script>

<div class="rule-card {rule.enabled === false ? 'disabled' : ''}">
  <div class="rule-card-header">
    <div class="rule-title-group">
      <h3>{rule.name}</h3>
      <span class="rule-meta-tag">
        {rule.triggerType === 'media' ? 'Por Archivo' : (matchTypeLabels[rule.matchType] || 'Palabra clave')}
      </span>
    </div>
    {#if $hasPermission('rules:edit')}
      <label class="switch" title="Activar/Desactivar regla">
        <input 
          type="checkbox" 
          checked={rule.enabled !== false} 
          onchange={handleToggle} 
        />
        <span class="slider round"></span>
      </label>
    {/if}
  </div>

  {#if rule.triggerType === 'media'}
    <div class="rule-trigger-badge">
      📥 Disparador: Al recibir {mediaFilterLabels[rule.mediaTypeFilter] || 'archivo'}
    </div>
  {:else if rule.triggerType === 'both'}
    <div class="rule-trigger-badge">
      🔄 Disparador: Texto O {mediaFilterLabels[rule.mediaTypeFilter] || 'archivo'}
    </div>
  {/if}

  {#if rule.triggers && rule.triggers.length > 0}
    <div class="rule-triggers-container">
      <span class="rule-label">Palabras Clave:</span>
      <div class="triggers-pills">
        {#each rule.triggers as trigger}
          <span class="trigger-pill">{trigger}</span>
        {/each}
      </div>
    </div>
  {/if}

  <div class="rule-response-container">
    <span class="rule-label">Respuesta del Bot:</span>
    <div class="rule-response-preview">{rule.response || '(Solo envía archivo adjunto)'}</div>
    {#if rule.media && rule.media.url}
      <div class="rule-media-badge" title={rule.media.filename}>
        📎 Envía adjunto: <strong>{rule.media.filename}</strong> ({formatBytes(rule.media.size)})
      </div>
    {/if}
  </div>

  <div class="rule-card-footer">
    <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
      <span class="badge-tag badge-tag-interesado">🏷️ {rule.leadTag || 'Lead'}</span>
      {#if rule.pauseBot}
        <span class="badge-tag badge-tag-requiereasesor">👤 Pausa para Asesor</span>
      {/if}
      {#if parentRule}
        <span class="badge-tag" style="background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3);">
          ↳ Submenú de: {parentRule.name}
        </span>
      {/if}
    </div>

    <div class="rule-card-actions">
      {#if $hasPermission('rules:edit')}
        <button type="button" class="icon-btn" onclick={handleEdit} title="Editar regla">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </button>
      {/if}
      {#if $hasPermission('rules:delete')}
        <button type="button" class="icon-btn delete-btn" onclick={handleDelete} title="Eliminar regla">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      {/if}
    </div>
  </div>
</div>
