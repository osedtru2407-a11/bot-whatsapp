<!-- frontend/src/components/superadmin/PlanModalAdmin.svelte -->
<script>
  import { untrack } from 'svelte';
  import Modal from '../common/Modal.svelte';
  import { savePlan } from '../../stores/plans';
  import { showToast } from '../../stores/toast';

  let { plan = null, isOpen = false, onClose } = $props();

  let isSaving = $state(false);

  // Form fields
  let id = $state('');
  let name = $state('');
  let description = $state('');
  let price = $state(0);
  let currency = $state('USD');
  let geminiLimitType = $state('monthly'); // 'monthly' | 'total'
  let geminiLimit = $state(100);
  let isGeminiUnlimited = $state(false);

  let autoMessagesLimitType = $state('monthly'); // 'monthly' | 'total'
  let autoMessagesLimit = $state(500);
  let isAutoUnlimited = $state(false);

  let customWarningMessage = $state('');
  let isDefault = $state(false);
  let isActive = $state(true);

  $effect(() => {
    if (isOpen) {
      untrack(() => {
        if (plan) {
          id = plan.id || '';
          name = plan.name || '';
          description = plan.description || '';
          price = Number(plan.price !== undefined ? plan.price : 0);
          currency = plan.currency || 'USD';
          geminiLimitType = plan.gemini_limit_type || plan.geminiLimitType || 'monthly';
          const gLimit = Number(plan.gemini_limit !== undefined ? plan.gemini_limit : (plan.geminiLimit !== undefined ? plan.geminiLimit : 100));
          isGeminiUnlimited = gLimit <= 0;
          geminiLimit = gLimit <= 0 ? 1000 : gLimit;

          const rawAutoType = plan.auto_messages_limit_type || plan.autoMessagesLimitType || 'monthly';
          const aLimit = Number(plan.auto_messages_limit !== undefined ? plan.auto_messages_limit : (plan.autoMessagesLimit !== undefined ? plan.autoMessagesLimit : 500));
          isAutoUnlimited = aLimit <= 0 || rawAutoType === 'unlimited';
          autoMessagesLimitType = rawAutoType === 'total' ? 'total' : 'monthly';
          autoMessagesLimit = aLimit <= 0 ? 2000 : aLimit;

          customWarningMessage = plan.custom_warning_message || plan.customWarningMessage || '';
          isDefault = Boolean(plan.is_default !== undefined ? plan.is_default : plan.isDefault);
          isActive = plan.is_active !== undefined ? Boolean(plan.is_active) : (plan.isActive !== undefined ? Boolean(plan.isActive) : true);
        } else {
          id = '';
          name = '';
          description = '';
          price = 0;
          currency = 'USD';
          geminiLimitType = 'monthly';
          geminiLimit = 500;
          isGeminiUnlimited = false;
          autoMessagesLimitType = 'monthly';
          autoMessagesLimit = 1000;
          isAutoUnlimited = false;
          customWarningMessage = '';
          isDefault = false;
          isActive = true;
        }
      });
    }
  });

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      showToast('El nombre del plan es obligatorio', 'error');
      return;
    }

    isSaving = true;
    try {
      const payload = {
        id: id || undefined,
        isNew: !plan,
        name: name.trim(),
        description: description.trim() || null,
        price: Number(price),
        currency: currency.trim() || 'USD',
        geminiLimitType,
        geminiLimit: isGeminiUnlimited ? -1 : Number(geminiLimit),
        autoMessagesLimitType: isAutoUnlimited ? 'unlimited' : autoMessagesLimitType,
        autoMessagesLimit: isAutoUnlimited ? -1 : Number(autoMessagesLimit),
        customWarningMessage: customWarningMessage.trim() || null,
        isDefault,
        isActive
      };

      const res = await savePlan(payload);
      if (res.success) {
        onClose();
      }
    } finally {
      isSaving = false;
    }
  }
</script>

<Modal
  {isOpen}
  title={plan ? '✏️ Editar Plan SaaS' : '💎 Crear Nuevo Plan SaaS'}
  subtitle="Configura los límites de IA Gemini, respuestas automáticas y precio del plan."
  maxWidth="640px"
  {onClose}
>
  <form onsubmit={handleSubmit} class="modal-form">
    <!-- Nombre y Precio -->
        <div class="form-row">
          <div class="form-group flex-2">
            <label for="plan-name">Nombre del Plan *</label>
            <input
              id="plan-name"
              type="text"
              placeholder="Ej. Plan Emprendedor, Versión Gratuita"
              bind:value={name}
              required
            />
          </div>

          <div class="form-group flex-1">
            <label for="plan-price">Precio *</label>
            <div class="input-with-addon">
              <input
                id="plan-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                bind:value={price}
                required
              />
              <select bind:value={currency} class="addon-select">
                <option value="USD">USD</option>
                <option value="COP">COP</option>
                <option value="MXN">MXN</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Descripción -->
        <div class="form-group">
          <label for="plan-desc">Descripción Breve</label>
          <input
            id="plan-desc"
            type="text"
            placeholder="Ej. Ideal para pequeñas empresas con volumen regular de ventas"
            bind:value={description}
          />
        </div>

        <!-- SECCIÓN: LÍMITES DE GEMINI IA -->
        <div class="quota-box gemini-quota-box">
          <div class="quota-header">
            <span class="quota-icon">🤖</span>
            <div class="quota-title">
              <strong>Límite de Consultas a Gemini IA</strong>
              <small>Cuántas respuestas generadas por Inteligencia Artificial permite este plan</small>
            </div>
          </div>

          <div class="quota-controls">
            <div class="control-row">
              <label class="radio-label">
                <input
                  type="checkbox"
                  bind:checked={isGeminiUnlimited}
                />
                <span>Ilimitado (Sin tope de cuota para Gemini)</span>
              </label>
            </div>

            {#if !isGeminiUnlimited}
              <div class="form-row mt-2">
                <div class="form-group flex-1">
                  <label for="gemini-limit-type">Tipo de Límite</label>
                  <select id="gemini-limit-type" bind:value={geminiLimitType}>
                    <option value="monthly">Mensual (Se reinicia el 1 de cada mes)</option>
                    <option value="total">Total / Vitalicio (Ej: Demo de 100 llamados y nada más)</option>
                  </select>
                </div>

                <div class="form-group flex-1">
                  <label for="gemini-limit-qty">Cantidad de Consultas</label>
                  <input
                    id="gemini-limit-qty"
                    type="number"
                    min="1"
                    bind:value={geminiLimit}
                    placeholder="Ej. 100 ó 2500"
                  />
                </div>
              </div>
            {/if}
          </div>
        </div>

        <!-- SECCIÓN: LÍMITES DE MENSAJES AUTOMÁTICOS -->
        <div class="quota-box auto-quota-box">
          <div class="quota-header">
            <span class="quota-icon">⚡</span>
            <div class="quota-title">
              <strong>Límite de Mensajes Automáticos (Reglas)</strong>
              <small>Respuestas automáticas disparadas por palabras clave o menús</small>
            </div>
          </div>

          <div class="quota-controls">
            <div class="control-row">
              <label class="radio-label">
                <input
                  type="checkbox"
                  bind:checked={isAutoUnlimited}
                />
                <span>Ilimitado (Sin tope de respuestas automáticas)</span>
              </label>
            </div>

            {#if !isAutoUnlimited}
              <div class="form-row mt-2">
                <div class="form-group flex-1">
                  <label for="auto-limit-type">Tipo de Límite</label>
                  <select id="auto-limit-type" bind:value={autoMessagesLimitType}>
                    <option value="monthly">Mensual (Se reinicia el 1 de cada mes)</option>
                    <option value="total">Total / Vitalicio (Ej: Demo de 200 mensajes y nada más)</option>
                  </select>
                </div>

                <div class="form-group flex-1">
                  <label for="auto-limit-qty">Cantidad de Mensajes</label>
                  <input
                    id="auto-limit-qty"
                    type="number"
                    min="1"
                    bind:value={autoMessagesLimit}
                    placeholder="Ej. 200 ó 5000"
                  />
                </div>
              </div>
            {/if}
          </div>
        </div>

        <!-- MENSAJE DE AGOTAMIENTO DE CUOTA -->
        <div class="form-group">
          <label for="warning-msg">
            Mensaje al Cliente al Agotar Cuota de IA (Opcional)
            <small class="label-hint">(Si se deja vacío, NO se enviará ningún mensaje al cliente para no revelar que se agotó la cuota)</small>
          </label>
          <textarea
            id="warning-msg"
            rows="2"
            bind:value={customWarningMessage}
            placeholder="Dejar en blanco para silenciar el bot sin notificar al cliente, o escribe un mensaje personalizado..."
          ></textarea>
        </div>

        <!-- Checkboxes de Estado -->
        <div class="checkbox-options">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={isDefault} />
            <span class="checkbox-text">
              <strong>Plan Predeterminado para Nuevas Empresas</strong>
              <small>Se asignará automáticamente a cualquier empresa recién registrada</small>
            </span>
          </label>

          <label class="checkbox-label">
            <input type="checkbox" bind:checked={isActive} />
            <span class="checkbox-text">
              <strong>Plan Activo</strong>
              <small>Visible y disponible para asignación</small>
            </span>
          </label>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick={onClose} disabled={isSaving}>
            Cancelar
          </button>
          <button type="submit" class="btn btn-primary" disabled={isSaving}>
            {isSaving ? 'Guardando...' : (plan ? 'Guardar Cambios' : 'Crear Plan')}
          </button>
        </div>
      </form>
</Modal>

<style>
  .modal-form {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.15rem;
  }

  .form-row {
    display: flex;
    gap: 1rem;
  }
  .flex-1 { flex: 1; }
  .flex-2 { flex: 2; }
  .mt-2 { margin-top: 0.5rem; }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .form-group label {
    font-size: 0.825rem;
    font-weight: 600;
    color: #d1d5db;
  }

  .label-hint {
    font-size: 0.75rem;
    color: #9ca3af;
    font-weight: normal;
  }

  input[type="text"],
  input[type="number"],
  select,
  textarea {
    background: #1f2937;
    border: 1px solid #374151;
    color: #f9fafb;
    border-radius: 0.5rem;
    padding: 0.55rem 0.75rem;
    font-size: 0.875rem;
    outline: none;
    transition: border-color 0.15s ease;
  }

  input:focus,
  select:focus,
  textarea:focus {
    border-color: #38bdf8;
  }

  .input-with-addon {
    display: flex;
    gap: 0.5rem;
  }
  .input-with-addon input {
    flex: 1;
  }
  .addon-select {
    width: 80px;
  }

  .quota-box {
    border-radius: 0.75rem;
    padding: 1rem;
    border: 1px solid #1f2937;
    background: #161e2e;
  }
  .gemini-quota-box {
    border-color: rgba(56, 189, 248, 0.3);
    background: rgba(14, 165, 233, 0.05);
  }
  .auto-quota-box {
    border-color: rgba(234, 179, 8, 0.3);
    background: rgba(234, 179, 8, 0.05);
  }

  .quota-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }
  .quota-icon {
    font-size: 1.5rem;
  }
  .quota-title strong {
    display: block;
    color: #f3f4f6;
    font-size: 0.9rem;
  }
  .quota-title small {
    color: #9ca3af;
    font-size: 0.775rem;
  }

  .radio-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: #e5e7eb;
    cursor: pointer;
  }

  .checkbox-options {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem 0;
    border-top: 1px solid #1f2937;
    border-bottom: 1px solid #1f2937;
  }

  .checkbox-label {
    display: flex;
    align-items: flex-start;
    gap: 0.65rem;
    cursor: pointer;
  }
  .checkbox-label input[type="checkbox"] {
    margin-top: 0.2rem;
  }
  .checkbox-text strong {
    display: block;
    color: #f3f4f6;
    font-size: 0.85rem;
  }
  .checkbox-text small {
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
  .btn-secondary:hover:not(:disabled) {
    background: #4b5563;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
