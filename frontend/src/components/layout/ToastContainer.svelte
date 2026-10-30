<script>
  import { toasts, removeToast } from '../../stores/toast';
</script>

<div class="toast-container">
  {#each $toasts as toast (toast.id)}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div 
      class="toast toast-{toast.type}" 
      onclick={() => removeToast(toast.id)}
    >
      <span class="toast-icon">
        {#if toast.type === 'success'}
          ✓
        {:else if toast.type === 'error'}
          ✕
        {:else if toast.type === 'warning'}
          ⚠️
        {:else}
          ℹ
        {/if}
      </span>
      <span class="toast-message">{toast.message}</span>
      <button type="button" class="toast-close" onclick={() => removeToast(toast.id)}>&times;</button>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 420px;
    pointer-events: none;
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 18px;
    border-radius: var(--radius-md);
    background: #0f172a;
    color: #fff;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    border: 1px solid var(--border-subtle);
    font-size: 0.88rem;
    cursor: pointer;
    animation: slideIn 0.25s ease-out;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .toast-success {
    border-color: rgba(37, 211, 102, 0.4);
    background: #0a2119;
  }
  .toast-success .toast-icon {
    color: var(--wa-primary);
  }

  .toast-error {
    border-color: rgba(244, 63, 94, 0.4);
    background: #240d15;
  }
  .toast-error .toast-icon {
    color: #fb7185;
  }

  .toast-warning {
    border-color: rgba(245, 158, 11, 0.4);
    background: #241c09;
  }
  .toast-warning .toast-icon {
    color: #fbbf24;
  }

  .toast-info {
    border-color: rgba(56, 189, 248, 0.4);
    background: #0c1c2e;
  }
  .toast-info .toast-icon {
    color: #38bdf8;
  }

  .toast-icon {
    font-weight: bold;
    font-size: 1.1rem;
    line-height: 1;
  }

  .toast-message {
    flex: 1;
    line-height: 1.4;
  }

  .toast-close {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 1.2rem;
    cursor: pointer;
    line-height: 1;
  }
  .toast-close:hover {
    color: #fff;
  }
</style>
