<script>
    import { companyPlanUsage, loadCompanyPlanUsage } from '../../stores/plans';
    import { activeTab } from '../../stores/ui';
    import { isSuperadmin } from '../../stores/auth';
    import { onMount, onDestroy } from 'svelte';

    let isDismissed = $state(false);
    let pollInterval = null;

    onMount(() => {
        loadCompanyPlanUsage();
        pollInterval = setInterval(() => {
            loadCompanyPlanUsage();
        }, 10000);
    });

    onDestroy(() => {
        if (pollInterval) clearInterval(pollInterval);
    });

    function goToSettings() {
        activeTab.set('tab-settings');
    }

    function goToSuperadmin() {
        activeTab.set('tab-superadmin');
    }

    function toggleDismiss() {
        isDismissed = !isDismissed;
    }
</script>

{#if $companyPlanUsage && ($companyPlanUsage.geminiUsage?.isExhausted || $companyPlanUsage.autoMessagesUsage?.isExhausted)}
    {#if !isDismissed}
        <div class="quota-alert-banner" role="alert">
            <div class="banner-left">
                <div class="alert-icon-wrapper">
                    <span class="alert-pulse-ring"></span>
                    <span class="alert-icon">⚠️</span>
                </div>
                <div class="alert-content">
                    <div class="alert-title-row">
                        <h4 class="alert-title">¡Atención! Límite de Plan Superado</h4>
                        <span class="plan-tag">Plan: {$companyPlanUsage.plan?.name || 'Actual'}</span>
                    </div>

                    <p class="alert-description">
                        {#if $companyPlanUsage.geminiUsage?.isExhausted && $companyPlanUsage.autoMessagesUsage?.isExhausted}
                            Has alcanzado el 100% de tu cupo en <strong>Consultas a Gemini IA</strong> ({$companyPlanUsage.geminiUsage.current}/{$companyPlanUsage.geminiUsage.limit}) y en <strong>Mensajes Automáticos</strong> ({$companyPlanUsage.autoMessagesUsage.current}/{$companyPlanUsage.autoMessagesUsage.limit}). Las respuestas automáticas se encuentran pausadas.
                        {:else if $companyPlanUsage.geminiUsage?.isExhausted}
                            Has alcanzado el límite de <strong>Consultas a Gemini IA</strong> ({$companyPlanUsage.geminiUsage.current}/{$companyPlanUsage.geminiUsage.limit}). El bot ha pausado temporalmente las respuestas automáticas de este servicio.
                        {:else}
                            Has alcanzado el límite de <strong>Mensajes Automáticos con Reglas</strong> ({$companyPlanUsage.autoMessagesUsage.current}/{$companyPlanUsage.autoMessagesUsage.limit}). El bot ha pausado el envío de respuestas automáticas basadas en palabras clave.
                        {/if}
                    </p>
                </div>
            </div>

            <div class="banner-actions">
                <button
                    type="button"
                    class="btn-banner-action"
                    onclick={goToSettings}
                >
                    ⚙️ Ver Mi Consumo
                </button>

                {#if $isSuperadmin}
                    <button
                        type="button"
                        class="btn-banner-admin"
                        onclick={goToSuperadmin}
                    >
                        💎 Gestionar Plan
                    </button>
                {/if}

                <button
                    type="button"
                    class="btn-banner-close"
                    onclick={toggleDismiss}
                    title="Minimizar aviso"
                    aria-label="Minimizar aviso"
                >
                    ✕
                </button>
            </div>
        </div>
    {:else}
        <div class="quota-alert-pill" role="status">
            <span class="pill-dot"></span>
            <span class="pill-text">
                ⚠️ Límites de plan superados — Atención automática restringida
            </span>
            <button
                type="button"
                class="btn-pill-expand"
                onclick={toggleDismiss}
            >
                Ver detalles
            </button>
        </div>
    {/if}
{/if}

<style>
    .quota-alert-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        background: linear-gradient(90deg, rgba(239, 68, 68, 0.16) 0%, rgba(245, 158, 11, 0.14) 100%);
        border: 1px solid rgba(239, 68, 68, 0.4);
        border-left: 5px solid #ef4444;
        border-radius: 12px;
        padding: 14px 18px;
        margin-bottom: 20px;
        box-shadow: 0 4px 18px rgba(239, 68, 68, 0.12);
        animation: slideDownBanner 0.25s ease-out;
        position: relative;
        z-index: 20;
    }

    @keyframes slideDownBanner {
        from {
            opacity: 0;
            transform: translateY(-8px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .banner-left {
        display: flex;
        align-items: flex-start;
        gap: 14px;
        flex: 1;
        min-width: 0;
    }

    .alert-icon-wrapper {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        flex-shrink: 0;
        background: rgba(239, 68, 68, 0.2);
        border-radius: 50%;
    }

    .alert-pulse-ring {
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        border: 2px solid rgba(239, 68, 68, 0.6);
        animation: pulseRing 2s infinite ease-out;
    }

    @keyframes pulseRing {
        0% {
            transform: scale(0.9);
            opacity: 0.8;
        }
        70% {
            transform: scale(1.35);
            opacity: 0;
        }
        100% {
            transform: scale(1.35);
            opacity: 0;
        }
    }

    .alert-icon {
        font-size: 1.15rem;
        line-height: 1;
    }

    .alert-content {
        flex: 1;
        min-width: 0;
    }

    .alert-title-row {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 4px;
    }

    .alert-title {
        margin: 0;
        font-size: 0.98rem;
        font-weight: 700;
        color: #fca5a5;
    }

    .plan-tag {
        font-size: 0.75rem;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 9999px;
        background: rgba(239, 68, 68, 0.25);
        color: #fee2e2;
        border: 1px solid rgba(239, 68, 68, 0.35);
    }

    .alert-description {
        margin: 0;
        font-size: 0.86rem;
        color: #e2e8f0;
        line-height: 1.45;
    }

    .alert-description strong {
        color: #fff;
    }

    .banner-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0;
    }

    .btn-banner-action {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        color: #fff;
        font-size: 0.825rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
    }

    .btn-banner-action:hover {
        background: rgba(255, 255, 255, 0.2);
        border-color: rgba(255, 255, 255, 0.35);
        transform: translateY(-1px);
    }

    .btn-banner-admin {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        background: linear-gradient(135deg, rgba(99, 102, 241, 0.35), rgba(168, 85, 247, 0.35));
        border: 1px solid rgba(168, 85, 247, 0.5);
        border-radius: 8px;
        color: #e9d5ff;
        font-size: 0.825rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
    }

    .btn-banner-admin:hover {
        background: linear-gradient(135deg, rgba(99, 102, 241, 0.5), rgba(168, 85, 247, 0.5));
        color: #fff;
        transform: translateY(-1px);
    }

    .btn-banner-close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 6px;
        color: #94a3b8;
        font-size: 1rem;
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .btn-banner-close:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
    }

    /* Versión compacta minimizada */
    .quota-alert-pill {
        display: flex;
        align-items: center;
        gap: 10px;
        background: rgba(239, 68, 68, 0.12);
        border: 1px solid rgba(239, 68, 68, 0.35);
        border-radius: 9999px;
        padding: 6px 16px;
        margin-bottom: 16px;
        font-size: 0.825rem;
        color: #fca5a5;
        width: fit-content;
        animation: slideDownBanner 0.2s ease-out;
    }

    .pill-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #ef4444;
        box-shadow: 0 0 6px #ef4444;
    }

    .pill-text {
        font-weight: 500;
    }

    .btn-pill-expand {
        background: none;
        border: none;
        color: #38bdf8;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        text-decoration: underline;
        padding: 0 4px;
    }

    .btn-pill-expand:hover {
        color: #7dd3fc;
    }

    @media (max-width: 768px) {
        .quota-alert-banner {
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
        }

        .banner-actions {
            justify-content: flex-end;
            width: 100%;
        }
    }
</style>

