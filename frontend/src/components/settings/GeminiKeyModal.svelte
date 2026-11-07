<!-- frontend/src/components/settings/GeminiKeyModal.svelte -->
<script>
    import Modal from '../common/Modal.svelte';
    import {
        geminiStatus,
        saveGeminiConfig,
        testGeminiApiKey,
    } from '../../stores/settings';
    import { activeCompany } from '../../stores/company';

    let { isOpen = false, onClose = () => {} } = $props();

    let inputApiKey = $state('');
    let selectedModel = $state('gemini-3.5-flash-lite');
    let showPassword = $state(false);
    let isTesting = $state(false);
    let isSaving = $state(false);
    let testResult = $state(null); // { success: boolean, message: string }

    // Al abrir el modal o cambiar geminiStatus, sincronizar modelo
    $effect(() => {
        if (isOpen) {
            inputApiKey = '';
            selectedModel = $geminiStatus.model || 'gemini-3.5-flash-lite';
            testResult = null;
            showPassword = false;
        }
    });

    async function handleTest() {
        isTesting = true;
        testResult = null;

        try {
            const keyToTest = inputApiKey.trim() || null;
            const res = await testGeminiApiKey(keyToTest, selectedModel);
            testResult = {
                success: true,
                message:
                    res.message ||
                    `¡Conexión exitosa! El modelo ${selectedModel} respondió correctamente.`,
            };
        } catch (err) {
            testResult = {
                success: false,
                message:
                    err.message ||
                    'Error al validar la clave con Google Gemini.',
            };
        } finally {
            isTesting = false;
        }
    }

    async function handleSave() {
        isSaving = true;
        testResult = null;

        try {
            const keyToSave = inputApiKey.trim()
                ? inputApiKey.trim()
                : $geminiStatus.isCustom
                  ? undefined
                  : null;
            // Si el input está vacío y ya tenía clave personalizada, no cambiamos la clave, solo el modelo
            const apiKeyPayload =
                inputApiKey.trim() !== ''
                    ? inputApiKey.trim()
                    : $geminiStatus.isCustom
                      ? $geminiStatus.maskedKey
                      : null;

            const res = await saveGeminiConfig(apiKeyPayload, selectedModel);
            if (res.success) {
                onClose();
            }
        } finally {
            isSaving = false;
        }
    }

    async function handleRevertToGlobal() {
        if (
            confirm(
                '¿Deseas eliminar la clave exclusiva de esta empresa y usar la clave global del sistema (.env)?',
            )
        ) {
            isSaving = true;
            try {
                const res = await saveGeminiConfig(null, selectedModel);
                if (res.success) {
                    onClose();
                }
            } finally {
                isSaving = false;
            }
        }
    }
</script>

<Modal
    {isOpen}
    title="🤖 API Key de Google Gemini"
    subtitle={`Configuración de Inteligencia Artificial para: ${$activeCompany?.name || 'Esta Empresa'}`}
    maxWidth="640px"
    {onClose}
>
    <div class="gemini-modal-body">
        <!-- Banner de estado actual -->
        <div
            class="status-box {$geminiStatus.isCustom
                ? 'custom-active'
                : $geminiStatus.hasGlobalKey
                  ? 'global-active'
                  : 'no-key-active'}"
        >
            <div class="status-box-header">
                <span class="status-indicator-dot"></span>
                {#if $geminiStatus.isCustom}
                    <strong>🔑 Clave Exclusiva de esta Empresa Activa</strong>
                {:else if $geminiStatus.hasGlobalKey}
                    <strong>🌐 Clave Global Compartida - Activa</strong>
                {:else}
                    <strong>⚠️ Sin Clave de Gemini Configurada</strong>
                {/if}
            </div>
            <p class="status-desc">
                {#if $geminiStatus.isCustom}
                    Esta empresa tiene su propia cuota y límite de Gemini
                    independiente ({$geminiStatus.maskedKey}). No se satura con
                    otras empresas.
                {:else if $geminiStatus.hasGlobalKey}
                    Esta empresa está usando la clave compartida del servidor.
                    Puedes asignarle su propia clave abajo para aislar sus
                    consumos y cuotas.
                {:else}
                    El bot no podrá responder preguntas automáticas ni procesar
                    notas de voz hasta que configures una API Key.
                {/if}
            </p>
        </div>

        <!-- Campo API Key -->
        <div class="form-group">
            <div class="label-row">
                <label for="gemini-key-input"
                    >Clave de API de Gemini (Google AI Studio)</label
                >
                {#if $geminiStatus.isCustom}
                    <span class="masked-badge"
                        >Actual: {$geminiStatus.maskedKey}</span
                    >
                {/if}
            </div>
            <div class="input-with-button">
                <input
                    id="gemini-key-input"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={$geminiStatus.isCustom
                        ? 'Dejar vacío para mantener la clave actual o escribe una nueva'
                        : 'Pega aquí tu API Key (AIzaSy...)'}
                    bind:value={inputApiKey}
                    autocomplete="off"
                />
                <button
                    type="button"
                    class="btn-toggle-eye"
                    onclick={() => (showPassword = !showPassword)}
                    title={showPassword ? 'Ocultar clave' : 'Mostrar clave'}
                    aria-label={showPassword
                        ? 'Ocultar clave'
                        : 'Mostrar clave'}
                >
                    {showPassword ? '🙈' : '👁️'}
                </button>
            </div>
            <small class="field-hint">
                Puedes usar la misma clave en varias empresas o asignar una
                distinta para empresas de alto tráfico. Obtén tu clave en <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer">Google AI Studio</a
                >.
            </small>
        </div>

        <!-- Selector de Modelo -->
        <div class="form-group">
            <label for="gemini-model-select">Modelo Preferido de Gemini</label>
            <select id="gemini-model-select" bind:value={selectedModel}>
                <option value="gemini-3.5-flash-lite"
                    >Gemini 3.5 Flash-Lite (Recomendado - Ultrarrápido, respuesta en &lt;1s, bajo consumo de cuota)</option
                >
                <option value="gemini-3.5-flash"
                    >Gemini 3.5 Flash (Gran precisión y razonamiento balanceado)</option
                >
                <option value="gemini-3.1-flash-lite"
                    >Gemini 3.1 Flash-Lite (Ultra veloz de baja latencia)</option
                >
                <option value="gemini-3.8-flash"
                    >Gemini 3.8 Flash (Modelo de última generación de Google)</option
                >
            </select>
            <small class="field-hint">
                Si el modelo seleccionado llegara a tener saturación temporal de
                Google, el sistema automáticamente intentará con los modelos de
                respaldo.
            </small>
        </div>

        <!-- Botón Probar Conexión -->
        <div class="test-row">
            <button
                type="button"
                class="btn btn-secondary btn-test"
                onclick={handleTest}
                disabled={isTesting ||
                    (!inputApiKey.trim() && !$geminiStatus.configured)}
            >
                {#if isTesting}
                    <span class="spinner-small"></span> Probando conexión con Google...
                {:else}
                    🧪 Probar Conexión con Gemini
                {/if}
            </button>
            {#if !inputApiKey.trim() && $geminiStatus.configured}
                <span class="test-hint"
                    >Probará la clave actualmente activa</span
                >
            {/if}
        </div>

        <!-- Resultado de la prueba -->
        {#if testResult}
            <div
                class="test-alert {testResult.success
                    ? 'alert-success'
                    : 'alert-error'}"
            >
                <span class="alert-icon"
                    >{testResult.success ? '✅' : '❌'}</span
                >
                <div class="alert-text">{testResult.message}</div>
            </div>
        {/if}

        <!-- Botones de Acción -->
        <div class="modal-footer-row">
            <div class="left-actions">
                {#if $geminiStatus.isCustom}
                    <button
                        type="button"
                        class="btn btn-outline-danger btn-sm"
                        onclick={handleRevertToGlobal}
                        disabled={isSaving}
                        title="Quitar clave exclusiva y volver a la Clave Global Compartida -"
                    >
                        🗑️ Usar Clave Global Compartida -
                    </button>
                {/if}
            </div>

            <div class="right-actions">
                <button
                    type="button"
                    class="btn btn-secondary"
                    onclick={onClose}
                    disabled={isSaving}
                >
                    Cancelar
                </button>
                <button
                    type="button"
                    class="btn btn-primary"
                    onclick={handleSave}
                    disabled={isSaving ||
                        (inputApiKey.trim() === '' &&
                            !$geminiStatus.isCustom &&
                            !selectedModel)}
                >
                    <span
                        >{isSaving
                            ? 'Guardando...'
                            : '💾 Guardar en esta Empresa'}</span
                    >
                </button>
            </div>
        </div>
    </div>
</Modal>

<style>
    .gemini-modal-body {
        display: flex;
        flex-direction: column;
        gap: 20px;
        padding: 6px 0;
    }

    .status-box {
        border-radius: var(--radius-md);
        padding: 14px 18px;
        border: 1px solid var(--border-subtle);
    }
    .status-box.custom-active {
        background: rgba(16, 185, 129, 0.08);
        border-color: rgba(16, 185, 129, 0.3);
        color: #10b981;
    }
    .status-box.global-active {
        background: rgba(56, 189, 248, 0.08);
        border-color: rgba(56, 189, 248, 0.3);
        color: #38bdf8;
    }
    .status-box.no-key-active {
        background: rgba(239, 68, 68, 0.08);
        border-color: rgba(239, 68, 68, 0.3);
        color: #ef4444;
    }

    .status-box-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        margin-bottom: 4px;
    }

    .status-indicator-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: currentColor;
        display: inline-block;
    }

    .status-desc {
        margin: 0;
        font-size: 12.5px;
        color: var(--text-secondary);
        line-height: 1.45;
    }

    .label-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
    }

    .label-row label {
        margin-bottom: 0;
    }

    .masked-badge {
        font-family: monospace;
        font-size: 11px;
        padding: 2px 7px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid var(--border-subtle);
        border-radius: 4px;
        color: var(--text-secondary);
    }

    .input-with-button {
        display: flex;
        gap: 8px;
        position: relative;
    }

    .input-with-button input {
        flex: 1;
        font-family: monospace;
        font-size: 13px;
    }

    .btn-toggle-eye {
        background: var(--bg-card);
        border: 1px solid var(--border-subtle);
        color: var(--text-primary);
        border-radius: var(--radius-sm);
        padding: 0 12px;
        cursor: pointer;
        font-size: 14px;
        transition: background 0.15s ease;
    }
    .btn-toggle-eye:hover {
        background: var(--bg-card-hover);
    }

    .field-hint {
        display: block;
        margin-top: 6px;
        font-size: 12px;
        color: var(--text-secondary);
    }
    .field-hint a {
        color: var(--color-primary, #38bdf8);
        text-decoration: underline;
    }

    .test-row {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .btn-test {
        padding: 8px 16px;
        font-size: 13px;
    }

    .test-hint {
        font-size: 12px;
        color: var(--text-secondary);
    }

    .test-alert {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 12px 16px;
        border-radius: var(--radius-sm);
        font-size: 13px;
        line-height: 1.4;
    }
    .test-alert.alert-success {
        background: rgba(16, 185, 129, 0.12);
        border: 1px solid rgba(16, 185, 129, 0.35);
        color: #34d399;
    }
    .test-alert.alert-error {
        background: rgba(239, 68, 68, 0.12);
        border: 1px solid rgba(239, 68, 68, 0.35);
        color: #f87171;
    }

    .alert-icon {
        font-size: 16px;
        flex-shrink: 0;
    }

    .modal-footer-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 10px;
        padding-top: 16px;
        border-top: 1px solid var(--border-subtle);
    }

    .right-actions {
        display: flex;
        gap: 10px;
        margin-left: auto;
    }

    .spinner-small {
        display: inline-block;
        width: 12px;
        height: 12px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        vertical-align: middle;
        margin-right: 4px;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
