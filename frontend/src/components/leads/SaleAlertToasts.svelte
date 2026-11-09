<!-- frontend/src/components/leads/SaleAlertToasts.svelte -->
<script>
    import {
        saleAlerts,
        dismissSaleAlert,
        dismissAllSaleAlerts,
        openLeadChat,
    } from '../../stores/leads';
    import { activeTab } from '../../stores/ui';

    let alerts = $derived($saleAlerts);
    let totalCount = $derived(alerts.length);

    // Si hay hasta 5 alertas, se muestran todas individuales.
    // Si hay más de 5, se muestran las 4 más recientes y se agrupa el resto en una tarjeta resumen.
    let isGroupedMode = $derived(totalCount > 5);
    let visibleIndividualAlerts = $derived(isGroupedMode ? alerts.slice(0, 4) : alerts);
    let overflowCount = $derived(isGroupedMode ? totalCount - 4 : 0);

    let isExpandedGroup = $state(false);

    function handleAttend(alert) {
        if (alert?.lead) {
            dismissSaleAlert(alert.id);
            activeTab.set('tab-leads');
            openLeadChat(alert.lead);
        }
    }

    function handleViewAllInCRM() {
        activeTab.set('tab-leads');
    }

    function getCleanPhone(phone) {
        if (!phone) return '';
        const digits = phone.replace(/\D/g, '');
        if (phone.includes('@lid') || digits.length < 7 || digits.length > 14) {
            return null;
        }
        return digits;
    }
</script>

{#if totalCount > 0}
    <div class="sale-toasts-container" role="region" aria-label="Alertas de Venta Flotantes">
        <!-- Tarjeta de resumen agrupado cuando son más de 5 alertas -->
        {#if isGroupedMode}
            <div class="sale-toast-card grouped-card">
                <div class="toast-header">
                    <div class="toast-title-box">
                        <span class="pulse-dot-amber"></span>
                        <strong class="toast-title">🚨 +{overflowCount} VENTAS PENDIENTES MÁS</strong>
                    </div>
                    <button
                        type="button"
                        class="btn-toast-close"
                        onclick={dismissAllSaleAlerts}
                        title="Descartar todas las alertas"
                    >
                        ✕
                    </button>
                </div>
                <div class="grouped-body">
                    <p class="grouped-desc">
                        Tienes un total de <strong>{totalCount} ventas</strong> esperando atención inmediata en el CRM.
                    </p>
                    <div class="grouped-actions">
                        <button
                            type="button"
                            class="btn-toast-attend full"
                            onclick={handleViewAllInCRM}
                        >
                            📊 Ver todas en Prospectos & CRM
                        </button>
                        <button
                            type="button"
                            class="btn-toggle-group"
                            onclick={() => (isExpandedGroup = !isExpandedGroup)}
                        >
                            {isExpandedGroup ? 'Contraer lista ▲' : `Ver ${overflowCount} restantes ▼`}
                        </button>
                    </div>
                </div>

                <!-- Lista desplegable si el usuario desea ver las agrupadas sin irse de pantalla -->
                {#if isExpandedGroup}
                    <div class="overflow-alerts-list">
                        {#each alerts.slice(4) as extraAlert (extraAlert.id)}
                            <div class="overflow-item">
                                <div class="overflow-info">
                                    <strong>{extraAlert.lead?.name || 'Cliente'}</strong>
                                    <span class="overflow-summary">{extraAlert.summary || 'Pedido por concretar'}</span>
                                </div>
                                <div class="overflow-btns">
                                    <button
                                        type="button"
                                        class="btn-mini-attend"
                                        onclick={() => handleAttend(extraAlert)}
                                    >
                                        Atender
                                    </button>
                                    <button
                                        type="button"
                                        class="btn-mini-close"
                                        onclick={() => dismissSaleAlert(extraAlert.id)}
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}

        <!-- Toasts individuales (hasta 4 si está agrupado, o hasta 5 si son pocos) -->
        {#each visibleIndividualAlerts as alert (alert.id)}
            {@const validPhone = getCleanPhone(alert.lead?.phone)}
            <div class="sale-toast-card individual-card">
                <div class="toast-header">
                    <div class="toast-title-box">
                        <span class="pulse-dot"></span>
                        <strong class="toast-title">🚨 ¡VENTA PENDIENTE!</strong>
                    </div>
                    <button
                        type="button"
                        class="btn-toast-close"
                        onclick={() => dismissSaleAlert(alert.id)}
                        title="Descartar aviso"
                    >
                        ✕
                    </button>
                </div>

                <div class="toast-body">
                    <div class="toast-client-line">
                        <span class="client-avatar">👤</span>
                        <strong class="client-name">{alert.lead?.name || 'Cliente'}</strong>
                        <span class="client-phone">({alert.lead?.phone || 'WhatsApp'})</span>
                    </div>

                    <div class="toast-summary-box">
                        <span class="summary-icon">📋</span>
                        <p class="summary-text">{alert.summary || 'El cliente desea concretar su compra'}</p>
                    </div>

                    <div class="toast-meta-hint">
                        <span>🟢 Chat marcado no leído</span>
                        <span>•</span>
                        <span>⏱️ Bot en pausa 120m</span>
                    </div>
                </div>

                <div class="toast-actions">
                    <button
                        type="button"
                        class="btn-toast-attend"
                        onclick={() => handleAttend(alert)}
                    >
                        💬 Atender en Panel
                    </button>

                    {#if validPhone}
                        <a
                            href="https://wa.me/{validPhone}"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="btn-toast-wa"
                            title="Abrir directamente en WhatsApp"
                        >
                            WhatsApp ↗
                        </a>
                    {/if}
                </div>
            </div>
        {/each}
    </div>
{/if}

<style>
    .sale-toasts-container {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 99999;
        display: flex;
        flex-direction: column-reverse;
        gap: 12px;
        max-width: 390px;
        width: calc(100vw - 32px);
        pointer-events: none;
    }

    .sale-toast-card {
        pointer-events: auto;
        background: rgba(15, 23, 42, 0.96);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(245, 158, 11, 0.45);
        border-radius: 12px;
        padding: 14px 16px;
        box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.6), 0 0 16px rgba(245, 158, 11, 0.22);
        animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .sale-toast-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 14px 35px -5px rgba(0, 0, 0, 0.7), 0 0 22px rgba(245, 158, 11, 0.35);
    }

    .grouped-card {
        border-color: rgba(239, 68, 68, 0.6);
        box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.6), 0 0 18px rgba(239, 68, 68, 0.3);
    }

    .toast-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        padding-bottom: 6px;
    }

    .toast-title-box {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .toast-title {
        font-size: 0.84rem;
        font-weight: 800;
        letter-spacing: 0.5px;
        color: #fbbf24;
    }

    .grouped-card .toast-title {
        color: #f87171;
    }

    .pulse-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #f59e0b;
        box-shadow: 0 0 8px #f59e0b;
        animation: pulseDot 1.6s infinite ease-in-out;
    }

    .pulse-dot-amber {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #ef4444;
        box-shadow: 0 0 8px #ef4444;
        animation: pulseDot 1.6s infinite ease-in-out;
    }

    @keyframes pulseDot {
        0%, 100% {
            transform: scale(1);
            opacity: 1;
        }
        50% {
            transform: scale(1.4);
            opacity: 0.5;
        }
    }

    .btn-toast-close {
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 0.95rem;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        transition: color 0.15s, background 0.15s;
    }

    .btn-toast-close:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.1);
    }

    .toast-body {
        margin-bottom: 12px;
    }

    .toast-client-line {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.88rem;
        color: #f1f5f9;
        margin-bottom: 8px;
    }

    .client-avatar {
        font-size: 0.95rem;
    }

    .client-name {
        color: #fff;
    }

    .client-phone {
        font-size: 0.8rem;
        color: #94a3b8;
    }

    .toast-summary-box {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        background: rgba(0, 0, 0, 0.35);
        border: 1px solid rgba(245, 158, 11, 0.2);
        border-radius: 6px;
        padding: 8px 10px;
        margin-bottom: 8px;
    }

    .summary-icon {
        font-size: 0.85rem;
        flex-shrink: 0;
        margin-top: 2px;
    }

    .summary-text {
        font-size: 0.82rem;
        color: #e2e8f0;
        margin: 0;
        line-height: 1.35;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .toast-meta-hint {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.74rem;
        color: #64748b;
    }

    .toast-actions {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .btn-toast-attend {
        flex: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px 12px;
        background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
        border: 1px solid #f59e0b;
        border-radius: 6px;
        color: #fff;
        font-size: 0.82rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.15s ease;
        text-decoration: none;
    }

    .btn-toast-attend:hover {
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        box-shadow: 0 0 12px rgba(245, 158, 11, 0.4);
    }

    .btn-toast-attend.full {
        width: 100%;
        margin-bottom: 6px;
    }

    .btn-toast-wa {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 8px 12px;
        background: rgba(34, 197, 94, 0.15);
        border: 1px solid rgba(34, 197, 94, 0.35);
        border-radius: 6px;
        color: #4ade80;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
        text-decoration: none;
        white-space: nowrap;
    }

    .btn-toast-wa:hover {
        background: rgba(34, 197, 94, 0.28);
        border-color: #4ade80;
        color: #fff;
    }

    /* Grouped card styling */
    .grouped-body {
        font-size: 0.84rem;
    }

    .grouped-desc {
        color: #cbd5e1;
        margin: 0 0 10px 0;
        line-height: 1.4;
    }

    .btn-toggle-group {
        background: transparent;
        border: none;
        color: #38bdf8;
        font-size: 0.78rem;
        font-weight: 600;
        cursor: pointer;
        padding: 4px 6px;
        text-align: center;
        width: 100%;
    }

    .btn-toggle-group:hover {
        text-decoration: underline;
    }

    .overflow-alerts-list {
        margin-top: 10px;
        max-height: 160px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 6px;
        border-top: 1px dashed rgba(255, 255, 255, 0.1);
        padding-top: 8px;
    }

    .overflow-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(0, 0, 0, 0.25);
        border-radius: 6px;
        padding: 6px 8px;
        gap: 8px;
    }

    .overflow-info {
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .overflow-info strong {
        font-size: 0.78rem;
        color: #f1f5f9;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .overflow-summary {
        font-size: 0.72rem;
        color: #94a3b8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .overflow-btns {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
    }

    .btn-mini-attend {
        background: rgba(245, 158, 11, 0.25);
        border: 1px solid #f59e0b;
        color: #fbbf24;
        font-size: 0.72rem;
        font-weight: 700;
        padding: 3px 6px;
        border-radius: 4px;
        cursor: pointer;
    }

    .btn-mini-attend:hover {
        background: #f59e0b;
        color: #000;
    }

    .btn-mini-close {
        background: transparent;
        border: none;
        color: #64748b;
        font-size: 0.78rem;
        cursor: pointer;
        padding: 2px 4px;
    }

    .btn-mini-close:hover {
        color: #fff;
    }

    @keyframes slideInRight {
        from {
            opacity: 0;
            transform: translateX(40px) scale(0.96);
        }
        to {
            opacity: 1;
            transform: translateX(0) scale(1);
        }
    }
</style>

