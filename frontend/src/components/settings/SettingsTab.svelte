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
    let phoneUsageType = $state('business_only');
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
            phoneUsageType = $settings.phoneUsageType || $settings.phone_usage_type || 'business_only';
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
            phoneUsageType,
            phone_usage_type: phoneUsageType,
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

            <!-- Configuración del Tipo de Uso de la Línea de WhatsApp (Tarea 11) -->
            <div class="phone-usage-card">
                <div class="phone-usage-header">
                    <span class="phone-usage-icon">📱</span>
                    <div>
                        <h4 class="phone-usage-title">Propósito / Uso de la Línea de WhatsApp</h4>
                        <p class="phone-usage-subtitle">
                            Configura si este número de WhatsApp es exclusivo para tu empresa o si también lo usas de forma personal/familiar.
                        </p>
                    </div>
                </div>

                <div class="phone-usage-options">
                    <button
                        type="button"
                        class="usage-option-card {phoneUsageType === 'business_only' ? 'selected' : ''}"
                        onclick={() => { phoneUsageType = 'business_only'; }}
                    >
                        <div class="usage-radio-col">
                            <input
                                type="radio"
                                name="phoneUsage"
                                value="business_only"
                                checked={phoneUsageType === 'business_only'}
                                onchange={() => { phoneUsageType = 'business_only'; }}
                            />
                        </div>
                        <div class="usage-content-col">
                            <div class="usage-badge-title">
                                <strong>🏢 Solo Negocio (Línea Comercial Exclusiva)</strong>
                                <span class="badge-recommended">Recomendado</span>
                            </div>
                            <p class="usage-desc">
                                Este número es usado <strong>únicamente para ventas y atención a clientes</strong>.
                                Se desactiva el filtrado de mensajes personales, <strong>agilizando la respuesta del bot y optimizando el consumo de tokens de IA</strong> al no sobrecargar a Gemini con análisis de parentesco o vida privada.
                            </p>
                        </div>
                    </button>

                    <button
                        type="button"
                        class="usage-option-card {phoneUsageType === 'personal_and_business' ? 'selected' : ''}"
                        onclick={() => { phoneUsageType = 'personal_and_business'; }}
                    >
                        <div class="usage-radio-col">
                            <input
                                type="radio"
                                name="phoneUsage"
                                value="personal_and_business"
                                checked={phoneUsageType === 'personal_and_business'}
                                onchange={() => { phoneUsageType = 'personal_and_business'; }}
                            />
                        </div>
                        <div class="usage-content-col">
                            <div class="usage-badge-title">
                                <strong>👥 Uso Mixto (Personal y Negocio)</strong>
                            </div>
                            <p class="usage-desc">
                                Compartes este número entre tu empresa y tus conversaciones con <strong>familiares, amigos o parejas</strong>.
                                Activa el análisis de Gemini para <strong>detectar y silenciar automáticamente al bot</strong> ante mensajes domésticos o afectivos ("Hijo la bendición", "Amor ya vienes?"), protegiendo tu privacidad.
                            </p>
                        </div>
                    </button>
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

    .phone-usage-card {
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        padding: 16px 20px;
        margin-bottom: 20px;
    }
    .phone-usage-header {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 14px;
    }
    .phone-usage-icon {
        font-size: 22px;
        line-height: 1;
    }
    .phone-usage-title {
        margin: 0 0 4px 0;
        font-size: 14.5px;
        font-weight: 600;
        color: var(--text-primary);
    }
    .phone-usage-subtitle {
        margin: 0;
        font-size: 12px;
        color: var(--text-secondary);
        line-height: 1.4;
    }
    .phone-usage-options {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
    }
    @media (max-width: 768px) {
        .phone-usage-options {
            grid-template-columns: 1fr;
        }
    }
    .usage-option-card {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        background: rgba(30, 41, 59, 0.4);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        padding: 12px 14px;
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: left;
        font-family: inherit;
        color: inherit;
        width: 100%;
    }
    .usage-option-card:hover {
        background: rgba(30, 41, 59, 0.8);
        border-color: rgba(56, 189, 248, 0.4);
    }
    .usage-option-card.selected {
        background: rgba(56, 189, 248, 0.1);
        border-color: #38bdf8;
        box-shadow: 0 0 10px rgba(56, 189, 248, 0.12);
    }
    .usage-radio-col {
        padding-top: 2px;
    }
    .usage-content-col {
        flex: 1;
    }
    .usage-badge-title {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
    }
    .usage-badge-title strong {
        font-size: 13.5px;
        color: #fff;
    }
    .badge-recommended {
        background: rgba(34, 197, 94, 0.2);
        color: #4ade80;
        font-size: 10px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 4px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .usage-desc {
        margin: 0;
        font-size: 11.5px;
        color: var(--text-muted);
        line-height: 1.4;
    }
    .usage-desc strong {
        color: #e2e8f0;
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
