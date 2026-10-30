<script>
  let { isOpen = false, title = '', subtitle = '', maxWidth = '650px', onClose, children, actions } = $props();

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget && onClose) {
      onClose();
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape' && onClose && isOpen) {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={handleBackdropClick}>
    <div class="modal-card" style="max-width: {maxWidth};" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <div>
          {#if title}
            <h3>{title}</h3>
          {/if}
          {#if subtitle}
            <span class="lead-modal-subtitle">{subtitle}</span>
          {/if}
        </div>
        {#if onClose}
          <button type="button" class="btn-close" onclick={onClose} aria-label="Cerrar">&times;</button>
        {/if}
      </div>

      <div class="modal-body-scrollable">
        {@render children?.()}
      </div>

      {#if actions}
        <div class="modal-actions">
          {@render actions()}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .modal-body-scrollable {
    max-height: calc(85vh - 140px);
    overflow-y: auto;
    padding-right: 4px;
  }
</style>
