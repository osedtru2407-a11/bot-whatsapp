<script>
  import { 
    documents, 
    libraryStats, 
    isLibraryUploadModalOpen, 
    toggleLibraryDoc, 
    deleteLibraryDoc, 
    getLibraryDocDetails,
    loadLibrary 
  } from '../../stores/library';
  import { hasPermission } from '../../stores/auth';
  import { formatBytes, formatDate } from '../../utils/formatters';

  function handleDelete(id, name) {
    if (confirm(`¿Deseas eliminar el documento "${name}" de la biblioteca? Gemini ya no tendrá acceso a esta información.`)) {
      deleteLibraryDoc(id);
    }
  }
</script>

<section id="tab-library" class="tab-content active">
  <div class="content-toolbar">
    <div>
      <h2>Biblioteca de Conocimiento (Contexto IA)</h2>
      <p class="section-desc">Entrena a Gemini con tus documentos oficiales para que responda con la información real de tu empresa sin inventar datos.</p>
    </div>
    <div style="display: flex; gap: 8px;">
      <button type="button" class="btn btn-secondary" onclick={loadLibrary} title="Actualizar lista">
        🔄 Refrescar
      </button>
      {#if $hasPermission('library:upload')}
        <button type="button" class="btn btn-primary" onclick={() => isLibraryUploadModalOpen.set(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Subir Documento
        </button>
      {/if}
    </div>
  </div>

  <!-- Stats Bar -->
  <div class="library-stats-bar">
    <div class="lib-stat-card">
      <span class="lib-stat-label">Documentos Activos</span>
      <strong class="lib-stat-val">{$libraryStats.activeDocuments || 0}</strong>
    </div>
    <div class="lib-stat-card">
      <span class="lib-stat-label">Total de Palabras Aprendidas</span>
      <strong class="lib-stat-val">{Number($libraryStats.totalWords || 0).toLocaleString('es-CO')}</strong>
    </div>
  </div>

  {#if ($libraryStats.activeDocuments === 0 && $documents.length > 0)}
    <div class="lib-banner-warning">
      <span>⚠️ <strong>Todos los documentos están pausados:</strong> Gemini no responderá mensajes para esta empresa hasta que actives al menos un documento.</span>
    </div>
  {/if}

  {#if $documents.length === 0}
    <div class="empty-library-state">
      <div style="font-size: 40px; margin-bottom: 12px;">📚</div>
      <h3>La biblioteca de conocimiento está vacía</h3>
      <p>Sube tus documentos Word (.docx) o notas para que Gemini aprenda sobre tus productos, servicios, precios y políticas sin dar información falsa.</p>
      {#if $hasPermission('library:upload')}
        <button type="button" class="btn btn-primary" style="margin-top: 16px;" onclick={() => isLibraryUploadModalOpen.set(true)}>
          Subir Primer Documento
        </button>
      {/if}
    </div>
  {:else}
    <div class="library-cards-grid">
      {#each $documents as doc (doc.id)}
        {@const isWord = (doc.originalFilename || '').endsWith('.docx')}
        {@const isActive = doc.active !== false}

        <div class="library-card {isActive ? '' : 'disabled'}">
          <div class="lib-card-top">
            <div class="lib-card-title-group">
              <span class="lib-doc-icon">{isWord ? '📘' : '📑'}</span>
              <div>
                <strong class="lib-doc-name">{doc.name || doc.originalFilename}</strong>
                <div class="lib-doc-orig">{doc.originalFilename}</div>
              </div>
            </div>

            <div class="lib-toggle-group">
              {#if $hasPermission('library:toggle')}
                <label class="switch switch-sm" title="Activar/Desactivar para Gemini">
                  <input 
                    type="checkbox" 
                    checked={isActive} 
                    onchange={() => toggleLibraryDoc(doc.id)} 
                  />
                  <span class="slider round"></span>
                </label>
              {/if}
              <span class="lib-status-text {isActive ? 'active' : 'paused'}">
                {isActive ? 'Activo en IA' : 'Pausado'}
              </span>
            </div>
          </div>

          <div class="lib-chips-row">
            <span class="lib-chip">📊 <strong>{doc.wordCount || 0}</strong> palabras</span>
            <span class="lib-chip">🔤 <strong>{doc.charCount || 0}</strong> caracteres</span>
            <span class="lib-chip">💾 {formatBytes(doc.size || 0)}</span>
            <span class="lib-chip">📅 {formatDate(doc.createdAt, { dateStyle: 'short', timeStyle: undefined })}</span>
          </div>

          <div class="lib-card-actions">
            <button 
              type="button" 
              class="btn btn-outline-sm" 
              onclick={() => getLibraryDocDetails(doc.id)}
            >
              👁️ Ver / Editar Markdown Limpio
            </button>

            {#if $hasPermission('library:delete')}
              <button 
                type="button" 
                class="icon-btn delete-btn" 
                onclick={() => handleDelete(doc.id, doc.name || doc.originalFilename)} 
                title="Eliminar de la biblioteca"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .library-stats-bar {
    display: flex;
    gap: 16px;
    margin: 20px 0;
  }

  .lib-stat-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    max-width: 280px;
  }

  .lib-stat-label {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .lib-stat-val {
    font-size: 1.4rem;
    color: #fff;
    font-family: var(--font-mono);
  }

  .lib-banner-warning {
    margin-bottom: 16px;
    font-size: 13px;
    color: #fbbf24;
    background: rgba(251, 191, 36, 0.12);
    border: 1px solid rgba(251, 191, 36, 0.3);
    border-radius: var(--radius-sm);
    padding: 12px 16px;
  }

  .empty-library-state {
    text-align: center;
    padding: 60px 20px;
    background: rgba(15, 23, 42, 0.4);
    border: 2px dashed var(--border-subtle);
    border-radius: var(--radius-lg);
    color: var(--text-muted);
    max-width: 600px;
    margin: 40px auto;
  }
  .empty-library-state h3 {
    color: #fff;
    margin-bottom: 6px;
    font-size: 1.15rem;
  }

  .library-cards-grid {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .library-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: all 0.2s ease;
  }
  .library-card.disabled {
    opacity: 0.7;
    border-color: rgba(255, 255, 255, 0.04);
  }

  .lib-card-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .lib-card-title-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .lib-doc-icon {
    font-size: 26px;
    line-height: 1;
  }

  .lib-doc-name {
    font-size: 0.95rem;
    color: #fff;
  }

  .lib-doc-orig {
    font-size: 0.76rem;
    color: var(--text-muted);
  }

  .lib-toggle-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .lib-status-text {
    font-size: 11px;
    font-weight: 600;
  }
  .lib-status-text.active { color: var(--wa-teal); }
  .lib-status-text.paused { color: var(--text-dim); }

  .lib-chips-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .lib-chip {
    font-size: 11.5px;
    color: var(--text-dim);
    background: rgba(255, 255, 255, 0.04);
    padding: 3px 8px;
    border-radius: 4px;
  }

  .lib-card-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }
</style>
