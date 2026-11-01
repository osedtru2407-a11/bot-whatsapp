<script>
    import { untrack } from 'svelte';
    import {
        isScheduleModalOpen,
        selectedSchedule,
        modalMode,
        createSchedule,
        updateSchedule,
    } from '../../stores/schedules';
    import { leads, isImportModalOpen } from '../../stores/leads';
    import { groups, loadGroups, isGroupsModalOpen } from '../../stores/groups';
    import { showToast } from '../../stores/toast';
    import Modal from '../common/Modal.svelte';
    import FileDropzone from '../common/FileDropzone.svelte';

    let name = $state('');
    let targetType = $state('single'); // 'single' | 'tag' | 'group'
    let singleRecipient = $state('');
    let selectedTag = $state('');
    let selectedGroupId = $state('');
    let delaySeconds = $state(10);
    let scheduledTime = $state('');
    let recurrence = $state('none'); // 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
    let message = $state('');
    let attachedMedia = $state(null);
    let isSubmitting = $state(false);

    // Derivar etiquetas únicas con contador de prospectos
    const availableTags = $derived.by(() => {
        const counts = {};
        for (const l of $leads || []) {
            if (
                l.phone &&
                l.phone !== 'status@broadcast' &&
                !l.phone.includes('@broadcast')
            ) {
                const t = l.tag || 'Nuevo';
                counts[t] = (counts[t] || 0) + 1;
            }
        }
        return Object.entries(counts).map(([tag, count]) => ({ tag, count }));
    });

    // Calcular cantidad estimada de destinatarios
    const estimatedCount = $derived.by(() => {
        if (targetType === 'single') {
            return singleRecipient.trim() ? 1 : 0;
        }
        if (targetType === 'tag') {
            const match = availableTags.find((t) => t.tag === selectedTag);
            return match ? match.count : 0;
        }
        if (targetType === 'group') {
            const match = ($groups || []).find((g) => g.id === selectedGroupId);
            return match ? match.memberCount || 0 : 0;
        }
        return 0;
    });

    // Selección de tipo de audiencia con auto-selección inmediata
    function selectTargetType(type) {
        targetType = type;
        if (type === 'tag') {
            if (!selectedTag && availableTags.length > 0) {
                selectedTag = availableTags[0].tag;
            }
        } else if (type === 'group') {
            if (!selectedGroupId && ($groups || []).length > 0) {
                selectedGroupId = $groups[0].id;
            }
        }
    }

    // Reactividad para auto-seleccionar si llegan tags o grupos luego de abrir
    $effect(() => {
        if (targetType === 'tag' && !selectedTag && availableTags.length > 0) {
            selectedTag = availableTags[0].tag;
        }
    });

    $effect(() => {
        if (
            targetType === 'group' &&
            !selectedGroupId &&
            ($groups || []).length > 0
        ) {
            selectedGroupId = $groups[0].id;
        }
    });

    // Control estricto de apertura del modal con untrack para inicializar crear/editar/duplicar
    let wasModalOpen = false;
    $effect(() => {
        const isOpen = $isScheduleModalOpen;
        if (isOpen && !wasModalOpen) {
            wasModalOpen = true;
            untrack(() => {
                loadGroups();

                const currentItem = $selectedSchedule;
                const mode = $modalMode;

                if (currentItem && (mode === 'edit' || mode === 'duplicate')) {
                    // Pre-llenar campos desde el elemento existente
                    name =
                        mode === 'duplicate'
                            ? `${currentItem.name || 'Campaña'} (Copia)`
                            : currentItem.name || '';
                    targetType = currentItem.targetType || 'single';
                    singleRecipient =
                        currentItem.targetType === 'single'
                            ? currentItem.recipient ||
                              currentItem.targetValue ||
                              ''
                            : '';
                    selectedTag =
                        currentItem.targetType === 'tag'
                            ? currentItem.targetValue || ''
                            : availableTags[0]?.tag || '';
                    selectedGroupId =
                        currentItem.targetType === 'group'
                            ? currentItem.targetValue || ''
                            : ($groups || [])[0]?.id || '';
                    delaySeconds = currentItem.delaySeconds || 10;
                    recurrence = currentItem.recurrence || 'none';
                    message = currentItem.message || '';
                    attachedMedia = currentItem.media || null;

                    // Si es duplicar o si la campaña ya expiró/se envió, sugerir una fecha futura (1 hora desde ahora)
                    const isPast =
                        currentItem.status === 'sent' ||
                        currentItem.status === 'failed' ||
                        currentItem.status === 'cancelled' ||
                        new Date(currentItem.scheduledTime) <= new Date();
                    if (mode === 'duplicate' || isPast) {
                        const d = new Date(
                            Date.now() +
                                60 * 60 * 1000 -
                                new Date().getTimezoneOffset() * 60000,
                        );
                        scheduledTime = d.toISOString().slice(0, 16);
                    } else {
                        // Mantener fecha actual del schedule
                        try {
                            const d = new Date(
                                new Date(currentItem.scheduledTime).getTime() -
                                    new Date().getTimezoneOffset() * 60000,
                            );
                            scheduledTime = d.toISOString().slice(0, 16);
                        } catch {
                            const d = new Date(
                                Date.now() +
                                    60 * 60 * 1000 -
                                    new Date().getTimezoneOffset() * 60000,
                            );
                            scheduledTime = d.toISOString().slice(0, 16);
                        }
                    }
                } else {
                    // Modo Crear Nuevo limpio
                    name = '';
                    targetType = 'single';
                    singleRecipient = '';
                    delaySeconds = 10;
                    recurrence = 'none';
                    message = '';
                    attachedMedia = null;

                    if (availableTags.length > 0) {
                        selectedTag = availableTags[0].tag;
                    } else {
                        selectedTag = '';
                    }

                    const grps = $groups || [];
                    if (grps.length > 0) {
                        selectedGroupId = grps[0].id;
                    } else {
                        selectedGroupId = '';
                    }

                    const d = new Date(
                        Date.now() +
                            60 * 60 * 1000 -
                            new Date().getTimezoneOffset() * 60000,
                    );
                    scheduledTime = d.toISOString().slice(0, 16);
                }
            });
        } else if (!isOpen) {
            wasModalOpen = false;
        }
    });

    function handleClose() {
        isScheduleModalOpen.set(false);
        selectedSchedule.set(null);
    }

    function insertVariable(variable) {
        message = (message || '') + variable;
    }

    function openCreateGroup() {
        handleClose();
        isGroupsModalOpen.set(true);
    }

    function openImportContacts() {
        handleClose();
        isImportModalOpen.set(true);
    }

    async function handleSubmit(e) {
        e.preventDefault();

        let targetValue = '';
        if (targetType === 'single') {
            targetValue = singleRecipient.replace(/\D/g, '');
            if (!targetValue) {
                showToast(
                    'Ingresa el número de WhatsApp de destino',
                    'warning',
                );
                return;
            }
        } else if (targetType === 'tag') {
            targetValue = selectedTag;
            if (!targetValue) {
                showToast(
                    'Selecciona la etiqueta de clientes para la difusión',
                    'warning',
                );
                return;
            }
            if (estimatedCount === 0) {
                showToast(
                    `No hay prospectos registrados con la etiqueta "${targetValue}"`,
                    'warning',
                );
                return;
            }
        } else if (targetType === 'group') {
            targetValue = selectedGroupId;
            if (!targetValue) {
                showToast('Selecciona el grupo de difusión', 'warning');
                return;
            }
            if (estimatedCount === 0) {
                showToast(
                    'Este grupo no tiene miembros asignados aún. Agrega contactos primero.',
                    'warning',
                );
                return;
            }
        }

        if (!message.trim() && !attachedMedia) {
            showToast(
                'Ingresa un mensaje o adjunta un archivo para programar',
                'warning',
            );
            return;
        }
        if (!scheduledTime) {
            showToast('Selecciona la fecha y hora de envío', 'warning');
            return;
        }

        isSubmitting = true;
        const payload = {
            name:
                name.trim() ||
                (targetType === 'single'
                    ? 'Envío Individual'
                    : `Difusión a ${targetType}: ${targetValue}`),
            targetType,
            targetValue,
            recipient:
                targetType === 'single'
                    ? targetValue
                    : targetType === 'tag'
                      ? `[Etiqueta: ${targetValue}]`
                      : `[Grupo: ${targetValue}]`,
            delaySeconds: parseInt(delaySeconds, 10) || 10,
            recurrence,
            scheduledTime,
            message: message.trim(),
            media: attachedMedia,
            relaunch: true,
        };

        let res;
        if ($modalMode === 'edit' && $selectedSchedule) {
            res = await updateSchedule($selectedSchedule.id, payload);
        } else {
            res = await createSchedule(payload);
        }
        isSubmitting = false;

        if (res.success) {
            handleClose();
        }
    }
</script>

<Modal
    isOpen={$isScheduleModalOpen}
    title={$modalMode === 'edit'
        ? '✏️ Editar y Reprogramar Campaña'
        : $modalMode === 'duplicate'
          ? '📋 Duplicar Campaña de Difusión'
          : '⏰ Programar Envío o Difusión'}
    subtitle={$modalMode === 'edit'
        ? 'Modifica los destinatarios, ajusta el mensaje o define una nueva fecha/hora para reactivar esta campaña periódica.'
        : $modalMode === 'duplicate'
          ? 'Crea una nueva campaña a partir de esta plantilla con fecha actualizada.'
          : 'Programa mensajes para un contacto individual o difusiones masivas segmentadas por etiqueta o grupo.'}
    maxWidth="720px"
    onClose={handleClose}
>
    <form onsubmit={handleSubmit} class="form-body">
        <!-- Aviso si se está editando una campaña previamente ejecutada -->
        {#if $modalMode === 'edit' && $selectedSchedule && ($selectedSchedule.status === 'sent' || $selectedSchedule.status === 'failed' || $selectedSchedule.status === 'cancelled')}
            <div class="relaunch-banner">
                <span
                    >🔄 <strong>Campaña previamente finalizada:</strong> Al
                    guardarla con una nueva fecha y hora se reactivará
                    automáticamente como <em>Pendiente</em> para ejecutarse en su
                    nuevo ciclo (mensual, anual o inmediato).</span
                >
            </div>
        {/if}

        <!-- Tipo de Destinatario / Audiencia -->
        <div class="form-group">
            <div
                style="margin-bottom: 6px; font-weight: 600; font-size: 0.86rem; color: var(--text-muted);"
            >
                Tipo de Audiencia / Destinatarios
            </div>
            <div class="audience-selector">
                <button
                    type="button"
                    class="audience-pill"
                    class:active={targetType === 'single'}
                    onclick={() => selectTargetType('single')}
                >
                    <span class="pill-icon">👤</span>
                    <span class="pill-title">Cliente Individual</span>
                </button>
                <button
                    type="button"
                    class="audience-pill"
                    class:active={targetType === 'tag'}
                    onclick={() => selectTargetType('tag')}
                >
                    <span class="pill-icon">🏷️</span>
                    <span class="pill-title">Por Etiqueta CRM</span>
                </button>
                <button
                    type="button"
                    class="audience-pill"
                    class:active={targetType === 'group'}
                    onclick={() => selectTargetType('group')}
                >
                    <span class="pill-icon">👥</span>
                    <span class="pill-title">Por Grupo de Difusión</span>
                </button>
            </div>
        </div>

        <div class="form-row">
            <div class="form-group flex-1">
                <label for="sched-name-input"
                    >Nombre de la Campaña / Identificador</label
                >
                <input
                    type="text"
                    id="sched-name-input"
                    placeholder="Ej: Promo Fin de Mes, Recordatorio de Pago..."
                    bind:value={name}
                    required
                />
            </div>

            <!-- Campo dinámico según targetType -->
            {#if targetType === 'single'}
                <div class="form-group flex-1">
                    <label for="sched-phone-input"
                        >Número de WhatsApp (con código de país)</label
                    >
                    <input
                        type="tel"
                        id="sched-phone-input"
                        placeholder="ej: 573001234567"
                        bind:value={singleRecipient}
                        required
                    />
                </div>
            {:else if targetType === 'tag'}
                <div class="form-group flex-1">
                    <div
                        style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;"
                    >
                        <label for="sched-tag-select" style="margin-bottom: 0;"
                            >Selecciona la Etiqueta de Destino</label
                        >
                        <button
                            type="button"
                            class="btn-micro-action"
                            onclick={openImportContacts}
                            title="Importar o sincronizar más contactos"
                        >
                            📥 Importar contactos
                        </button>
                    </div>
                    {#if availableTags.length === 0}
                        <div class="audience-empty-notice">
                            <span
                                >⚠️ No hay prospectos con etiquetas en tu CRM
                                aún.</span
                            >
                            <button
                                type="button"
                                class="btn-action-inline"
                                onclick={openImportContacts}
                            >
                                📥 Importar Contactos (CSV / WhatsApp)
                            </button>
                        </div>
                    {:else}
                        <select
                            id="sched-tag-select"
                            class="form-select"
                            bind:value={selectedTag}
                        >
                            {#each availableTags as t}
                                <option value={t.tag}
                                    >{t.tag} ({t.count} contacto{t.count !== 1
                                        ? 's'
                                        : ''})</option
                                >
                            {/each}
                        </select>
                    {/if}
                </div>
            {:else if targetType === 'group'}
                <div class="form-group flex-1">
                    <div
                        style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;"
                    >
                        <label
                            for="sched-group-select"
                            style="margin-bottom: 0;"
                            >Selecciona el Grupo de Difusión</label
                        >
                        <button
                            type="button"
                            class="btn-micro-action"
                            onclick={openCreateGroup}
                            title="Crear un nuevo grupo personalizado"
                        >
                            + Crear / Gestionar Grupos
                        </button>
                    </div>
                    {#if ($groups || []).length === 0}
                        <div class="audience-empty-notice">
                            <span
                                >⚠️ No tienes grupos de difusión creados aún.</span
                            >
                            <button
                                type="button"
                                class="btn-action-inline"
                                onclick={openCreateGroup}
                            >
                                👥 Crear mi Primer Grupo
                            </button>
                        </div>
                    {:else}
                        <select
                            id="sched-group-select"
                            class="form-select"
                            bind:value={selectedGroupId}
                        >
                            {#each $groups || [] as g}
                                <option value={g.id}
                                    >{g.name} ({g.memberCount || 0} contacto{g.memberCount !==
                                    1
                                        ? 's'
                                        : ''})</option
                                >
                            {/each}
                        </select>
                    {/if}
                </div>
            {/if}
        </div>

        <!-- Barra de contexto de la audiencia -->
        {#if targetType !== 'single'}
            <div class="audience-info-banner">
                <span
                    class="info-badge"
                    class:badge-zero={estimatedCount === 0}
                >
                    📊 Alcance estimado: <strong
                        >{estimatedCount} contacto{estimatedCount !== 1
                            ? 's'
                            : ''}</strong
                    >
                    {#if estimatedCount === 0}
                        <small style="color: #fb7185; margin-left: 6px;"
                            >(Sin contactos asignados)</small
                        >
                    {/if}
                </span>
                <div class="pacing-box">
                    <label for="delay-sec-input">Pausa anti-baneo:</label>
                    <select
                        id="delay-sec-input"
                        class="pacing-select"
                        bind:value={delaySeconds}
                    >
                        <option value={5}>5 seg (Rápido)</option>
                        <option value={10}>10 seg (Recomendado)</option>
                        <option value={15}>15 seg (Muy seguro)</option>
                        <option value={20}>20 seg (Ultra seguro)</option>
                    </select>
                </div>
            </div>
        {/if}

        <div class="form-group">
            <label for="sched-datetime-input">
                {$modalMode === 'edit'
                    ? 'Nueva Fecha y Hora de Envío'
                    : 'Fecha y Hora de Envío'}
            </label>
            <input
                type="datetime-local"
                id="sched-datetime-input"
                bind:value={scheduledTime}
                required
            />
            <div class="form-row">
                <div class="form-group flex-1">
                    <label for="sched-datetime-input">
                        {$modalMode === 'edit'
                            ? 'Fecha y Hora de Próximo Envío'
                            : 'Fecha y Hora de Primer Envío'}
                    </label>
                    <input
                        type="datetime-local"
                        id="sched-datetime-input"
                        bind:value={scheduledTime}
                        required
                    />
                </div>

                <div class="form-group flex-1">
                    <label for="sched-recurrence-select">
                        Frecuencia / Repetición Periódica
                    </label>
                    <select
                        id="sched-recurrence-select"
                        bind:value={recurrence}
                    >
                        <option value="none"
                            >Una sola vez (Sin repetición)</option
                        >
                        <option value="daily">🔁 Diario (Cada 24 horas)</option>
                        <option value="weekly"
                            >🔁 Semanal (Mismo día cada semana)</option
                        >
                        <option value="monthly"
                            >🔁 Mensual (Cobro mensual, recordatorios)</option
                        >
                        <option value="yearly"
                            >🔁 Anual (Renovación anual, aniversarios)</option
                        >
                    </select>
                </div>
            </div>

            {#if recurrence !== 'none'}
                <div class="recurrence-notice">
                    <span style="font-size: 1.1rem;">🔁</span>
                    <div>
                        <strong
                            >Campaña Recurrente Activada ({recurrence ===
                            'daily'
                                ? 'Diaria'
                                : recurrence === 'weekly'
                                  ? 'Semanal'
                                  : recurrence === 'monthly'
                                    ? 'Mensual'
                                    : 'Anual'}):</strong
                        >
                        {#if recurrence === 'daily'}
                            Se ejecutará cada día automáticamente a la hora
                            seleccionada.
                        {:else if recurrence === 'weekly'}
                            Se repetirá cada semana el mismo día de la semana a
                            la hora seleccionada.
                        {:else if recurrence === 'monthly'}
                            Ideal para <em
                                >recordatorios de pago y cobro de mensualidades</em
                            >. Al finalizar cada entrega, el sistema se
                            reprogramará automáticamente para el mes siguiente
                            conservando la hora fijada.
                        {:else if recurrence === 'yearly'}
                            Se repetirá anualmente en la misma fecha y hora para
                            felicitaciones o renovaciones de pólizas/planes.
                        {/if}
                    </div>
                </div>
            {/if}

            <div class="form-group">
                <div
                    style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;"
                >
                    <label for="sched-message-input" style="margin-bottom: 0;"
                        >Mensaje de Texto</label
                    >
                    <div class="vars-helper">
                        <span
                            style="font-size: 0.78rem; color: var(--text-dim);"
                            >Insertar variable:</span
                        >
                        <button
                            type="button"
                            class="btn-chip"
                            onclick={() => insertVariable('{nombre}')}
                            >+ {'{nombre}'}</button
                        >
                        <button
                            type="button"
                            class="btn-chip"
                            onclick={() => insertVariable('{telefono}')}
                            >+ {'{telefono}'}</button
                        >
                    </div>
                </div>
                <textarea
                    id="sched-message-input"
                    rows="4"
                    placeholder="¡Hola! Escribe aquí el mensaje de tu campaña..."
                    bind:value={message}></textarea>
            </div>

            <div class="form-group">
                <div
                    style="margin-bottom: 6px; font-weight: 600; font-size: 0.86rem; color: var(--text-muted);"
                >
                    Adjuntar Archivo al Envío Programado (Opcional)
                </div>
                <FileDropzone
                    category="quick"
                    media={attachedMedia}
                    onMediaChange={(newMedia) => (attachedMedia = newMedia)}
                />
            </div>

            <div class="modal-actions" style="margin-top: 24px;">
                <button
                    type="button"
                    class="btn btn-secondary"
                    onclick={handleClose}>Cancelar</button
                >
                <button
                    type="submit"
                    class="btn btn-primary"
                    disabled={isSubmitting ||
                        (targetType !== 'single' && estimatedCount === 0)}
                >
                    {#if isSubmitting}
                        Guardando...
                    {:else if $modalMode === 'edit'}
                        Actualizar y Reprogramar ({estimatedCount} contactos)
                    {:else if $modalMode === 'duplicate'}
                        Crear Campaña Duplicada ({estimatedCount} contactos)
                    {:else if targetType === 'single'}
                        Programar Envío
                    {:else}
                        Iniciar Campaña ({estimatedCount} contacto{estimatedCount !==
                        1
                            ? 's'
                            : ''})
                    {/if}
                </button>
            </div>
        </div>
    </form>
</Modal>

<style>
    .relaunch-banner {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        background: rgba(56, 189, 248, 0.12);
        border: 1px solid rgba(56, 189, 248, 0.35);
        border-radius: var(--radius-md);
        color: #e0f2fe;
        font-size: 0.84rem;
        line-height: 1.4;
        margin-bottom: 16px;
    }

    .recurrence-notice {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 14px;
        background: rgba(168, 85, 247, 0.12);
        border: 1px solid rgba(168, 85, 247, 0.35);
        border-radius: var(--radius-md);
        color: #e9d5ff;
        font-size: 0.84rem;
        line-height: 1.4;
        margin-bottom: 14px;
    }
    .recurrence-notice strong {
        color: #f3e8ff;
    }

    .form-row {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
    }
    .flex-1 {
        flex: 1;
        min-width: 240px;
    }

    .audience-selector {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        margin-top: 4px;
    }

    .audience-pill {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px 12px;
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        color: var(--text-muted);
        font-size: 0.88rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        user-select: none;
    }

    .audience-pill:hover {
        border-color: rgba(56, 189, 248, 0.4);
        color: #fff;
    }

    .audience-pill.active {
        background: rgba(56, 189, 248, 0.15) !important;
        border-color: #38bdf8 !important;
        color: #38bdf8 !important;
        box-shadow: 0 0 12px rgba(56, 189, 248, 0.2);
    }

    .audience-info-banner {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 14px;
        background: rgba(30, 41, 59, 0.7);
        border: 1px solid rgba(56, 189, 248, 0.2);
        border-radius: var(--radius-md);
        margin-bottom: 14px;
        flex-wrap: wrap;
        gap: 10px;
    }

    .info-badge {
        color: #38bdf8;
        font-size: 0.88rem;
    }

    .info-badge.badge-zero {
        color: #fb7185;
    }

    .audience-empty-notice {
        padding: 10px 12px;
        background: rgba(244, 63, 94, 0.1);
        border: 1px dashed rgba(244, 63, 94, 0.3);
        border-radius: var(--radius-md);
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 0.82rem;
        color: #fca5a5;
    }

    .btn-action-inline {
        align-self: flex-start;
        background: rgba(56, 189, 248, 0.15);
        border: 1px solid rgba(56, 189, 248, 0.3);
        color: #38bdf8;
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .btn-action-inline:hover {
        background: rgba(56, 189, 248, 0.3);
        color: #fff;
    }

    .btn-micro-action {
        background: transparent;
        border: none;
        color: #38bdf8;
        font-size: 0.76rem;
        font-weight: 600;
        cursor: pointer;
        text-decoration: underline;
        padding: 0;
    }

    .btn-micro-action:hover {
        color: #7dd3fc;
    }

    .pacing-box {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.82rem;
        color: var(--text-muted);
    }

    .pacing-select {
        background: rgba(15, 23, 42, 0.8);
        border: 1px solid var(--border-subtle);
        color: #fff;
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 0.82rem;
    }

    .form-select {
        width: 100%;
        padding: 10px 12px;
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        color: #fff;
        font-size: 0.9rem;
        outline: none;
    }

    .form-select:focus {
        border-color: var(--accent-primary);
    }

    .vars-helper {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .btn-chip {
        background: rgba(56, 189, 248, 0.12);
        border: 1px solid rgba(56, 189, 248, 0.25);
        color: #38bdf8;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 0.76rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .btn-chip:hover {
        background: rgba(56, 189, 248, 0.25);
        color: #fff;
    }
</style>
