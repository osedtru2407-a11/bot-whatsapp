<!-- frontend/src/components/superadmin/AssignPlanModalAdmin.svelte -->
<script>
  import Modal from '../common/Modal.svelte';
  import { plans, assignPlanToCompany, resetCompanyQuota } from '../../stores/plans';
  import { loadAdminCompanies } from '../../stores/superadmin';
  import { showToast } from '../../stores/toast';

  let { company = null, isOpen = false, onClose } = $props();

  let selectedPlanId = $state('');
  let isSaving = $state(false);
  let isResetting = $state(false);

  $effect(() => {
    if (isOpen && company) {
      selectedPlanId = company.planId || 'plan_demo';
    }
  });

  async function handleAssign(e) {
    e.preventDefault();
    if (!company) return;

    isSaving = true;
    try {
      const res = await assignPlanToCompany(company.id, selectedPlanId);
      if (res.success) {
        await loadAdminCompanies();
        onClose();
      }
    } finally {
      isSaving = false;
    }
  }

  async function handleResetQuota() {
    if (!company) return;
    const confirmReset = window.confirm(`¿Estás seguro de reiniciar a 0 el consumo de cuota de la empresa "${company.name}"?`);
    if (!confirmReset) return;

    isResetting = true;
    try {
      const res = await resetCompanyQuota(company.id);
      if (res.success) {
        await loadAdminCompanies();
        onClose();
      }
    } finally {
      isResetting = false;
    }
  }
</script>

{#if company}
  <Modal
    {isOpen}
    title="💎 Asignar Plan SaaS"
    subtitle="Empresa: {company.name} ({company.id})"
    maxWidth="520px"
    {onClose}
  >
    <form onsubmit={handleAssign} class="modal-form">
      <div class="current-plan-card">
        <span class="info-label">Plan Actual:</span>
        <strong>{company.planName || 'Versión Demo'}</strong>
        <div class="counters-preview">
          <span>IA Gemini: <strong>{company.geminiCallsCount || 0}</strong> / {company.geminiLimit <= 0 ? '∞' : company.geminiLimit}</span>
          <span>Mensajes Auto: <strong>{company.autoMessagesCount || 0}</strong> / {company.autoMessagesLimit <= 0 ? '∞' : company.autoMessagesLimit}</span>
        </div>
      </div>

      <div class="form-group">
        <label for="select-plan">Seleccionar Nuevo Plan SaaS *</label>
        <select id="select-plan" bind:value={selectedPlanId} required>
          {#each $plans as p}
            <option value={p.id}>
              {p.name} — {p.price > 0 ? `$${p.price} ${p.currency || 'USD'}/mes` : 'Gratuito'}
              ({p.gemini_limit <= 0 || p.geminiLimit <= 0 ? 'Gemini ∞' : `${p.gemini_limit || p.geminiLimit} Gemini`} / {p.auto_messages_limit <= 0 || p.autoMessagesLimit <= 0 ? 'Reglas ∞' : `${p.auto_messages_limit || p.autoMessagesLimit} Reglas`})
            </option>
          {/each}
        </select>
        <small class="helper-text">Al cambiar el plan, los contadores de consumo de la empresa se reiniciarán a 0 automáticamente.</small>
      </div>

      <div class="quota-reset-section">
        <div class="reset-info">
          <strong>Reiniciar Cuota sin Cambiar Plan</strong>
          <small>Pone en 0 las llamadas de IA y mensajes automáticos consumidos en el ciclo actual.</small>
        </div>
        <button
          type="button"
          class="btn btn-warning"
          onclick={handleResetQuota}
          disabled={isResetting}
        >
          {isResetting ? 'Reiniciando...' : '🔄 Reiniciar a 0'}
        </button>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" onclick={onClose} disabled={isSaving}>
          Cancelar
        </button>
        <button type="submit" class="btn btn-primary" disabled={isSaving}>
          {isSaving ? 'Guardando...' : 'Guardar y Asignar Plan'}
        </button>
      </div>
    </form>
  </Modal>
{/if}

<style>
  .modal-form {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .current-plan-card {
    background: rgba(31, 41, 55, 0.6);
    border: 1px solid #374151;
    border-radius: 0.625rem;
    padding: 0.875rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .info-label {
    font-size: 0.75rem;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .counters-preview {
    display: flex;
    gap: 1rem;
    font-size: 0.8rem;
    color: #cbd5e1;
    margin-top: 0.25rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .form-group label {
    font-size: 0.85rem;
    font-weight: 600;
    color: #d1d5db;
  }

  select {
    background: #1f2937;
    border: 1px solid #374151;
    color: #f9fafb;
    border-radius: 0.5rem;
    padding: 0.6rem 0.75rem;
    font-size: 0.875rem;
    outline: none;
  }
  select:focus {
    border-color: #38bdf8;
  }

  .helper-text {
    font-size: 0.75rem;
    color: #9ca3af;
  }

  .quota-reset-section {
    border-top: 1px solid #1f2937;
    padding-top: 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .reset-info strong {
    display: block;
    color: #f3f4f6;
    font-size: 0.85rem;
  }

  .reset-info small {
    display: block;
    color: #9ca3af;
    font-size: 0.75rem;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .btn {
    padding: 0.6rem 1.25rem;
    border-radius: 0.5rem;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    border: none;
    transition: all 0.15s ease;
  }
  .btn-primary {
    background: #0284c7;
    color: white;
  }
  .btn-primary:hover:not(:disabled) {
    background: #0369a1;
  }
  .btn-secondary {
    background: #374151;
    color: #d1d5db;
  }
  .btn-warning {
    background: rgba(234, 179, 8, 0.15);
    color: #facc15;
    border: 1px solid rgba(234, 179, 8, 0.3);
    padding: 0.45rem 0.85rem;
    font-size: 0.8rem;
    white-space: nowrap;
  }
  .btn-warning:hover:not(:disabled) {
    background: rgba(234, 179, 8, 0.25);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
