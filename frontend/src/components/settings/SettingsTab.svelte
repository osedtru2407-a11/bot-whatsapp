<script>
    import {
        settings,
        geminiStatus,
        saveSettings,
    } from '../../stores/settings';
    import { hasPermission, isSuperadmin } from '../../stores/auth';
    import GeminiKeyModal from './GeminiKeyModal.svelte';

    let businessName = $state('');
    let geminiEnabled = $state(true);
    let simulateTyping = $state(true);
    let typingDelaySeconds = $state(2);
    let ignoreGroups = $state(true);
    let fallbackMessage = $state('');
    let isSaving = $state(false);
    let isKeyModalOpen = $state(false);

    $effect(() => {
        if ($settings) {
            businessName = $settings.businessName || '';
            geminiEnabled = $settings.geminiEnabled ?? true;
            simulateTyping = $settings.simulateTyping ?? true;
            typingDelaySeconds = $settings.typingDelaySeconds || 2;
            ignoreGroups = $settings.ignoreGroups ?? true;
            fallbackMessage = $settings.fallbackMessage || '';
        }
    });

    async function handleSubmit(e) {
        e.preventDefault();
        isSaving = true;

        await saveSettings({
            businessName: businessName.trim(),
            geminiEnabled: Boolean(geminiEnabled),
            simulateTyping: Boolean(simulateTyping),
            typingDelaySeconds: parseInt(typingDelaySeconds, 10) || 2,
            ignoreGroups: Boolean(ignoreGroups),
            fallbackMessage: fallbackMessage.trim(),
        });

        isSaving = false;
    }
</script>

<section id="tab-settings" class="tab-content active">
    <div class="content-toolbar">
        <div>
            <h2>Configuración General de la Empresa y del Bot</h2>
            <p class="section-desc">
                Personaliza el comportamiento de atención, delays de digitación
                humana e inteligencia artificial por empresa.
            </p>
        </div>
    </div>

    <div class="settings-card">
        <form onsubmit={handleSubmit} class="form-body">
            <div class="form-group">
                <label for="biz-name">Nombre Comercial del Negocio</label>
                <input
                    type="text"
                    id="biz-name"
                    placeholder="Ej: Digital Pass Express"
                    bind:value={businessName}
                    required
                />
            </div>

            <!-- Sección destacada de Inteligencia Artificial Gemini -->
            <div class="gemini-card-box">
                <div class="gemini-card-header">
                    <div class="gemini-title-group">
                        <span class="gemini-icon">🤖</span>
                        <div>
                            <h3 class="gemini-title">
                                Inteligencia Artificial Gemini Flash
                            </h3>
                            <p class="gemini-subtitle">
                                Atiende consultas automáticamente fuera de tus
                                reglas y procesa notas de voz con la información
                                de tu Biblioteca.
                            </p>
                        </div>
                    </div>
                    <div class="gemini-badges-col">
                        <!-- 1. status-badge encima de la aclaración -->
                        <div class="badge-wrapper">
                            {#if $geminiStatus.isCustom}
                                <span
                                    class="status-badge is-custom"
                                    title="Esta empresa tiene su propia API Key"
                                >
                                    🔑 Clave Exclusiva ({$geminiStatus.maskedKey ||
                                        'Configurada'})
                                </span>
                            {:else if $geminiStatus.hasGlobalKey}
                                <span
                                    class="status-badge is-global"
                                    title="Esta empresa comparte la clave global del servidor"
                                >
                                    🌐 Clave Global
                                </span>
                            {:else}
                                <span
                                    class="status-badge no-key"
                                    title="No hay ninguna clave configurada"
                                >
                                    ⚠️ Sin Clave de Gemini
                                </span>
                            {/if}
                        </div>

                        <!-- 2. Subtítulo con las implicaciones de la key usada -->
                        {#if $geminiStatus.isCustom}
                            <p class="gemini-subtitle key-implications">
                                Estás usando la versión premium de nuestro
                                servicio de chatbot, esto implica que tienes
                                un bot dedicado exclusivamente a tu
                                servicio, por lo que tendrás velocidades de
                                respuesta más rápidas.
                            </p>
                        {:else if $geminiStatus.hasGlobalKey}
                            <p class="gemini-subtitle key-implications">
                                Estás usando la versión regular de nuestro
                                servicio de chatbot, esto implica que las
                                velocidades de respuesta se pueden ver
                                afectadas, si quieres más velocidad de
                                respuesta paga por nuestra versión premium.
                            </p>
                        {/if}

                        <!-- 3. model-badge debajo de esa aclaración -->
                        <div class="badge-wrapper">
                            <span class="model-badge"
                                >⚡ {$geminiStatus.model ||
                                    'gemini-3.5-flash-lite'}</span
                            >
                        </div>
                    </div>
                </div>

                <div class="gemini-card-body">
                    <div class="form-group flex-1" style="margin-bottom: 0;">
                        <label for="gemini-toggle"
                            >Estado del Asistente IA para esta Empresa</label
                        >
                        <select id="gemini-toggle" bind:value={geminiEnabled}>
                            <option value={true}
                                >Habilitado (Usa IA cuando no coincida una regla
                                manual)</option
                            >
                            <option value={false}
                                >Deshabilitado (Solo responde reglas exactas)</option
                            >
                        </select>
                    </div>

                    <div class="gemini-key-action-col">
                        <div class="btn-spacer" aria-hidden="true"></div>
                        {#if $isSuperadmin}
                            <button
                                type="button"
                                class="btn btn-secondary btn-configure-key"
                                onclick={() => (isKeyModalOpen = true)}
                            >
                                <span>🔑 Configurar API Key de Gemini</span>
                            </button>
                        {/if}
                    </div>
                </div>
            </div>

            <div class="form-row" style="margin-top: 16px;">
                <div class="form-group flex-1">
                    <label for="simulate-typing"
                        >Simular "Escribiendo..." en WhatsApp</label
                    >
                    <select id="simulate-typing" bind:value={simulateTyping}>
                        <option value={true}
                            >Sí (Da apariencia 100% humana)</option
                        >
                        <option value={false}
                            >No (Envía respuestas al instante)</option
                        >
                    </select>
                </div>

                <div class="form-group flex-1">
                    <label for="delay-sec"
                        >Segundos de Simulación de Digitación</label
                    >
                    <input
                        type="number"
                        id="delay-sec"
                        min="1"
                        max="15"
                        bind:value={typingDelaySeconds}
                    />
                </div>
            </div>

            <div class="form-group">
                <label for="ignore-groups"
                    >Ignorar Mensajes de Grupos de WhatsApp</label
                >
                <select id="ignore-groups" bind:value={ignoreGroups}>
                    <option value={true}
                        >Sí (Recomendado - Solo atiende chats individuales)</option
                    >
                    <option value={false}
                        >No (Responder también en grupos)</option
                    >
                </select>
            </div>

            <div class="form-group">
                <label for="fallback-msg"
                    >Mensaje por Defecto (Fallback si no hay coincidencia ni IA)</label
                >
                <textarea
                    id="fallback-msg"
                    rows="4"
                    placeholder="¡Hola! Gracias por comunicarte con nosotros. Escribe *menu* para ver las opciones disponibles..."
                    bind:value={fallbackMessage}></textarea>
            </div>

            {#if $hasPermission('settings:edit')}
                <div style="margin-top: 24px;">
                    <button
                        type="submit"
                        class="btn btn-primary"
                        disabled={isSaving}
                    >
                        <span
                            >{isSaving
                                ? 'Guardando...'
                                : '💾 Guardar Cambios de Configuración'}</span
                        >
                    </button>
                </div>
            {/if}
        </form>
    </div>
</section>

<!-- Modal de Configuración de API Key de Gemini -->
<GeminiKeyModal
    isOpen={isKeyModalOpen}
    onClose={() => (isKeyModalOpen = false)}
/>

<style>
    .settings-card {
        background: var(--bg-card);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        padding: 32px;
        max-width: 780px;
        margin-top: 20px;
    }

    .form-row {
        display: flex;
        gap: 16px;
    }
    .flex-1 {
        flex: 1;
    }

    /* Caja visual destacada para Gemini */
    .gemini-card-box {
        background: rgba(15, 23, 42, 0.45);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        padding: 20px;
        margin: 18px 0;
    }

    .gemini-card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 16px;
        flex-wrap: wrap;
    }

    .gemini-title-group {
        display: flex;
        gap: 12px;
        align-items: flex-start;
    }

    .gemini-icon {
        font-size: 24px;
        line-height: 1;
        margin-top: 2px;
    }

    .gemini-title {
        margin: 0 0 4px 0;
        font-size: 15px;
        font-weight: 600;
        color: var(--text-primary);
    }

    .gemini-subtitle {
        margin: 0;
        font-size: 12.5px;
        color: var(--text-secondary);
        max-width: 480px;
        line-height: 1.4;
    }

    .gemini-badges-col {
        display: flex;
        flex-direction: column;
        gap: 6px;
        align-items: flex-start;
        max-width: 480px;
    }
    .badge-wrapper {
        display: inline-flex;
    }
    .key-implications {
        margin: 2px 0 !important;
        font-size: 12px !important;
        line-height: 1.35 !important;
    }

    .gemini-card-body {
        display: flex;
        gap: 16px;
        align-items: flex-end;
    }

    .gemini-key-action-col {
        display: flex;
        flex-direction: column;
    }

    .btn-spacer {
        display: block;
        margin-bottom: 6px;
        height: 17px;
    }

    .btn-configure-key {
        white-space: nowrap;
        padding: 9px 16px;
        font-size: 13px;
        font-weight: 500;
    }

    .status-badge {
        font-size: 11.5px;
        font-weight: 600;
        padding: 3px 10px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }
    .status-badge.is-custom {
        background: rgba(16, 185, 129, 0.15);
        color: #10b981;
        border: 1px solid rgba(16, 185, 129, 0.35);
    }
    .status-badge.is-global {
        background: rgba(56, 189, 248, 0.15);
        color: #38bdf8;
        border: 1px solid rgba(56, 189, 248, 0.35);
    }
    .status-badge.no-key {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
        border: 1px solid rgba(239, 68, 68, 0.35);
    }

    .model-badge {
        font-size: 11px;
        font-family: monospace;
        font-weight: 500;
        padding: 3px 8px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--border-subtle);
        color: var(--text-secondary);
    }

    @media (max-width: 640px) {
        .gemini-card-body {
            flex-direction: column;
            align-items: stretch;
        }
        .btn-spacer {
            display: none;
        }
    }
</style>
