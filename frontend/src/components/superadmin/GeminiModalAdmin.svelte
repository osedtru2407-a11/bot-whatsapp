<!-- frontend/src/components/superadmin/GeminiModalAdmin.svelte -->
<script>
  import Modal from '../common/Modal.svelte';
  import { saveCompanyGeminiConfig } from '../../stores/superadmin';
  import { testGeminiApiKey } from '../../stores/settings';

  let { isOpen = false, onClose = () => {}, company = null } = $props();

  let apiKeyInput = $state('');
  let selectedModel = $state('gemini-3.5-flash-lite');
  let showKey = $state(false);
  let isTesting = $state(false);
  let isSaving = $state(false);
  let testResult = $state(null);

  $effect(() => {
    if (isOpen && company) {
      apiKeyInput = '';
      selectedModel = company.geminiModel || 'gemini-3.5-flash-lite';
      showKey = false;
      testResult = null;
    }
  });

  async function handleTest() {
    isTesting = true;
    testResult = null;
    try {
      const keyToTest = apiKeyInput.trim() || null;
      const res = await testGeminiApiKey(keyToTest, selectedModel);
      testResult = {
        success: true,
        message: res.message || `¡Conexión exitosa! El modelo ${selectedModel} respondió correctamente.`
      };
    } catch (err) {
      testResult = {
        success: false,
        message: err.message || 'Error al validar la clave con Google Gemini.'
      };
    } finally {
      isTesting = false;
    }
  }

  async function handleSave() {
    if (!company) return;
    isSaving = true;
    try {
      let keyToSave = apiKeyInput.trim();
      if (!keyToSave && company.isCustomGeminiKey) {
        // Dejar clave previa intacta
        keyToSave = undefined;
      } else if (!keyToSave) {
        keyToSave = null;
      }

      await saveCompanyGeminiConfig(company.id, keyToSave, selectedModel);
      onClose();
    } finally {
      isSaving = false;
    }
  }

  async function handleClearKey() {
    if (!company) return;
    if (!confirm(`¿Eliminar la API Key exclusiva de "${company.name}"?\nLa empresa pasará a usar la clave global del sistema (si existe).`)) {
      return;
    }
    isSaving = true;
    try {
      await saveCompanyGeminiConfig(company.id, null, selectedModel);
      onClose();
    } finally {
      isSaving = false;
    }
  }
</script>

<Modal
  {isOpen}
  title={company ? `🤖 Configurar Gemini: ${company.name}` : '🤖 Configuración de Gemini'}
  subtitle="Configuración exclusiva de IA para esta empresa. Solo accesible por Superusuarios."
  maxWidth="540px"
  {onClose}
>
  <div class="gemini-admin-modal">
    <!-- Estado Actual -->
    <div class="status-summary-box">
      <div class="status-summary-header">
        <span class="status-summary-label">Estado de la IA en esta empresa:</span>
        {#if company?.isCustomGeminiKey}
          <span class="badge badge-custom">🔑 Clave Exclusiva ({company.geminiApiKeyMasked || 'Configurada'})</span>
        {:else}
          <span class="badge badge-global">🌐 Clave Global Compartida</span>
        {/if}
      </div>
      <p class="status-summary-desc">
        Como Superusuario, puedes asignarle a esta empresa su propia clave de Gemini para aislar su cuota o presupuesto de tokens.
      </p>
    </div>

    <!-- Formulario -->
    <div class="form-group">
      <label for="gemini-admin-key">API Key de Google Gemini</label>
      <div class="input-with-action">
        <input
          type={showKey ? 'text' : 'password'}
          id="gemini-admin-key"
          bind:value={apiKeyInput}
          placeholder={company?.isCustomGeminiKey ? `Mantener clave actual (${company.geminiApiKeyMasked})` : 'AIzaSy... (o deja vacío para clave global)'}
          autocomplete="off"
          spellcheck="false"
        />
        <button
          type="button"
          class="btn-toggle-show"
          onclick={() => showKey = !showKey}
          title={showKey ? 'Ocultar clave' : 'Mostrar clave'}
        >
          {showKey ? '🙈' : '👁️'}
        </button>
      </div>
      <span class="field-hint">
        {#if company?.isCustomGeminiKey}
          Deja este campo en blanco si solo deseas cambiar el modelo sin modificar la clave guardada.
        {:else}
          Ingresa una clave que comience con <code>AIzaSy...</code> de Google AI Studio.
        {/if}
      </span>
    </div>

    <div class="form-group">
      <label for="gemini-admin-model">Modelo de Lenguaje</label>
      <select id="gemini-admin-model" bind:value={selectedModel}>
        <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite (Ultra Rápido y Económico - Recomendado)</option>
        <option value="gemini-2.5-flash">gemini-2.5-flash (Equilibrado para Ventas y Soporte)</option>
        <option value="gemini-2.5-pro">gemini-2.5-pro (Máximo Razonamiento Complejo)</option>
      </select>
    </div>

    <!-- Test de Conexión -->
    <div class="test-row">
      <button
        type="button"
        class="btn btn-secondary btn-sm"
        onclick={handleTest}
        disabled={isTesting || isSaving}
      >
        <span>{isTesting ? 'Validando...' : '🧪 Probar Conexión con Gemini'}</span>
      </button>

      {#if company?.isCustomGeminiKey}
        <button
          type="button"
          class="btn-clear-key"
          onclick={handleClearKey}
          disabled={isSaving || isTesting}
          title="Eliminar la clave exclusiva y volver a usar la clave global"
        >
          🗑️ Eliminar Clave Exclusiva
        </button>
      {/if}
    </div>

    {#if testResult}
      <div class="test-feedback {testResult.success ? 'feedback-success' : 'feedback-error'}">
        <span class="feedback-icon">{testResult.success ? '✅' : '❌'}</span>
        <span class="feedback-text">{testResult.message}</span>
      </div>
    {/if}

    <!-- Botones de Acción -->
    <div class="modal-footer-btns">
      <button type="button" class="btn btn-secondary" onclick={onClose} disabled={isSaving}>
        Cancelar
      </button>
      <button
        type="button"
        class="btn btn-primary"
        onclick={handleSave}
        disabled={isSaving || isTesting}
      >
        <span>{isSaving ? 'Guardando...' : '💾 Guardar Configuración'}</span>
      </button>
    </div>
  </div>
</Modal>

<style>
  .gemini-admin-modal {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 8px;
  }
  .status-summary-box {
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 12px 14px;
  }
  .status-summary-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    flex-wrap: wrap;
  }
  .status-summary-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-secondary);
  }
  .status-summary-desc {
    margin: 0;
    font-size: 0.76rem;
    color: var(--text-muted);
    line-height: 1.4;
  }
  .badge {
    padding: 3px 8px;
    border-radius: 9999px;
    font-size: 0.72rem;
    font-weight: 700;
  }
  .badge-custom {
    background: rgba(245, 158, 11, 0.18);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.35);
  }
  .badge-global {
    background: rgba(56, 189, 248, 0.18);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.35);
  }

  .input-with-action {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .input-with-action input {
    flex: 1;
    font-family: monospace;
    font-size: 0.85rem;
  }
  .btn-toggle-show {
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 1rem;
    color: var(--text-secondary);
  }
  .btn-toggle-show:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .field-hint {
    display: block;
    font-size: 0.74rem;
    color: var(--text-muted);
    margin-top: 4px;
  }
  .field-hint code {
    background: rgba(255, 255, 255, 0.08);
    padding: 1px 4px;
    border-radius: 3px;
    color: #38bdf8;
  }

  .test-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .btn-clear-key {
    background: none;
    border: none;
    color: #f87171;
    font-size: 0.76rem;
    font-weight: 600;
    cursor: pointer;
    text-decoration: underline;
    padding: 4px 6px;
  }
  .btn-clear-key:hover {
    color: #ef4444;
  }

  .test-feedback {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    font-size: 0.8rem;
    line-height: 1.4;
  }
  .feedback-success {
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.3);
    color: #86efac;
  }
  .feedback-error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
  }
  .feedback-icon {
    font-size: 1rem;
    line-height: 1;
  }

  .modal-footer-btns {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 10px;
  }
</style>

