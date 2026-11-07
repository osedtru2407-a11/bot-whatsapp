<script>
    import { onMount, onDestroy } from 'svelte';
    import {
        leads,
        loadLeads,
        togglePauseLead,
        openLeadFiles,
        openLeadChat,
        isImportModalOpen,
    } from '../../stores/leads';
    import { contacts, deleteContact } from '../../stores/contacts';
    import {
        groups,
        isGroupsModalOpen,
        addMembersToGroup,
    } from '../../stores/groups';
    import { hasPermission } from '../../stores/auth';
    import { formatDate } from '../../utils/formatters';
    import Modal from '../common/Modal.svelte';

    let currentSubTab = $state('crm'); // 'crm' | 'contacts'
    let searchQuery = $state('');
    let sourceFilter = $state('all'); // 'all' | 'whatsapp' | 'google_csv'
    let currentPage = $state(1);
    const pageSize = 50;

    let syncTimer = null;
    onMount(() => {
        loadLeads();
        syncTimer = setInterval(loadLeads, 4000);
    });
    onDestroy(() => {
        if (syncTimer) {
            clearInterval(syncTimer);
            syncTimer = null;
        }
    });

    // Selección múltiple para asignación masiva a grupos
    let selectedContactPhones = $state(new Set());
    let batchTargetGroupId = $state('');
    let isAssigningBatch = $state(false);

    // Modal rápido para asignar un contacto/prospecto individual a un grupo
    let contactToAssign = $state(null);

    // Filtrado de prospectos del embudo CRM (personas que han interactuado con el bot)
    const filteredLeads = $derived(
        $leads.filter((l) => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return (
                (l.name || '').toLowerCase().includes(q) ||
                (l.phone || '').includes(q) ||
                (l.lastMessage || '').toLowerCase().includes(q) ||
                (l.tag || '').toLowerCase().includes(q)
            );
        }),
    );

    // Filtrado de contactos de la libreta general (para difusiones)
    const filteredContacts = $derived(
        $contacts.filter((c) => {
            if (sourceFilter !== 'all' && c.source !== sourceFilter)
                return false;
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return (
                (c.name || '').toLowerCase().includes(q) ||
                (c.phone || '').includes(q) ||
                (c.tags || '').toLowerCase().includes(q)
            );
        }),
    );

    const totalContactPages = $derived(
        Math.max(1, Math.ceil(filteredContacts.length / pageSize)),
    );

    const paginatedContacts = $derived(
        filteredContacts.slice(
            (currentPage - 1) * pageSize,
            currentPage * pageSize,
        ),
    );

    const allVisibleSelected = $derived(
        paginatedContacts.length > 0 &&
            paginatedContacts.every((c) => selectedContactPhones.has(c.phone)),
    );

    function setSubTab(tab) {
        currentSubTab = tab;
        searchQuery = '';
        currentPage = 1;
    }

    function toggleSelectContact(phone) {
        const updated = new Set(selectedContactPhones);
        if (updated.has(phone)) {
            updated.delete(phone);
        } else {
            updated.add(phone);
        }
        selectedContactPhones = updated;
    }

    function toggleSelectAllVisible() {
        const visiblePhones = paginatedContacts.map((c) => c.phone);
        const updated = new Set(selectedContactPhones);
        if (allVisibleSelected) {
            for (const p of visiblePhones) updated.delete(p);
        } else {
            for (const p of visiblePhones) updated.add(p);
        }
        selectedContactPhones = updated;
    }

    function clearContactSelection() {
        selectedContactPhones = new Set();
    }

    async function handleAssignBatchToGroup() {
        if (!batchTargetGroupId || selectedContactPhones.size === 0) return;
        isAssigningBatch = true;
        const phones = Array.from(selectedContactPhones);
        const res = await addMembersToGroup(batchTargetGroupId, phones);
        if (res.success) {
            selectedContactPhones = new Set();
            batchTargetGroupId = '';
        }
        isAssigningBatch = false;
    }

    async function handleAssignSingleToGroup(groupId, phone) {
        if (!groupId || !phone) return;
        await addMembersToGroup(groupId, [phone]);
        contactToAssign = null;
    }

    async function handleDeleteContact(phone, name) {
        if (
            confirm(
                `¿Deseas eliminar a "${name || phone}" de tu agenda de contactos?`,
            )
        ) {
            await deleteContact(phone);
            if (selectedContactPhones.has(phone)) {
                const updated = new Set(selectedContactPhones);
                updated.delete(phone);
                selectedContactPhones = updated;
            }
        }
    }
</script>

<section id="tab-leads" class="tab-content active">
    <!-- Pestañas de Navegación del Módulo -->
    <div class="leads-view-selector">
        <button
            type="button"
            class="subtab-btn {currentSubTab === 'crm' ? 'active' : ''}"
            onclick={() => setSubTab('crm')}
        >
            <span class="subtab-icon">🎯</span>
            <span class="subtab-text">Prospectos del Embudo (CRM)</span>
            <span class="subtab-badge">{$leads.length}</span>
        </button>
        <button
            type="button"
            class="subtab-btn {currentSubTab === 'contacts' ? 'active' : ''}"
            onclick={() => setSubTab('contacts')}
        >
            <span class="subtab-icon">📒</span>
            <span class="subtab-text">Agenda de Contactos & Difusión</span>
            <span class="subtab-badge subtab-badge-accent"
                >{$contacts.length}</span
            >
        </button>
    </div>

    {#if currentSubTab === 'crm'}
        <!-- ==================== VISTA 1: PROSPECTOS DEL EMBUDO CRM ==================== -->
        <div class="content-toolbar">
            <div>
                <h2>Prospectos & Archivos Recibidos (Embudo de Ventas)</h2>
                <p class="section-desc">
                    Clientes que han interactuado con tu WhatsApp, con detección
                    de comprobantes, historial de conversación y notas de voz.
                </p>
            </div>
            <div class="toolbar-actions-group">
                <div class="toolbar-search">
                    <input
                        type="search"
                        class="search-input"
                        placeholder="🔍 Buscar prospecto por nombre, teléfono o mensaje..."
                        bind:value={searchQuery}
                    />
                </div>
                <button
                    type="button"
                    class="btn btn-outline"
                    onclick={() => isGroupsModalOpen.set(true)}
                    title="Crear y organizar grupos de difusión"
                >
                    👥 Grupos de Difusión
                </button>
                <button
                    type="button"
                    class="btn btn-primary"
                    onclick={() => isImportModalOpen.set(true)}
                    title="Importar contactos a la agenda de difusión"
                >
                    📥 Importar a la Agenda
                </button>
            </div>
        </div>

        {#if filteredLeads.length === 0}
            <div class="empty-leads-state">
                <div style="font-size: 40px; margin-bottom: 12px;">🎯</div>
                <h3>
                    No hay prospectos {searchQuery
                        ? 'que coincidan con la búsqueda'
                        : 'activos en el embudo todavía'}
                </h3>
                <p>
                    Los clientes que escriban a tu WhatsApp entrarán
                    automáticamente a este embudo como prospectos calificados
                    con su historial de conversación.
                </p>
                <div style="margin-top: 14px;">
                    <button
                        type="button"
                        class="btn btn-outline-sm"
                        onclick={() => setSubTab('contacts')}
                    >
                        📒 Ver los {$contacts.length} contactos de tu Agenda de Difusión
                    </button>
                </div>
            </div>
        {:else}
            <div class="leads-table-container">
                <table class="leads-table">
                    <thead>
                        <tr>
                            <th>Prospecto</th>
                            <th>Etiqueta CRM</th>
                            <th>Último Mensaje</th>
                            <th>Archivos</th>
                            <th>Última Interacción</th>
                            <th>Estado del Bot</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each filteredLeads as lead (lead.phone)}
                            {@const filesCount =
                                lead.receivedFiles?.length || 0}
                            <tr>
                                <td>
                                    <div class="lead-name-box">
                                        <strong
                                            >{lead.name || 'Sin Nombre'}</strong
                                        >
                                        <span class="lead-phone-text"
                                            >+{lead.phone}</span
                                        >
                                    </div>
                                </td>
                                <td>
                                    <span
                                        class="badge-tag badge-tag-{(
                                            lead.tag || 'nuevo'
                                        )
                                            .toLowerCase()
                                            .replace(/\s+/g, '')}"
                                    >
                                        🏷️ {lead.tag || 'Nuevo'}
                                    </span>
                                </td>
                                <td
                                    class="last-msg-cell"
                                    title={lead.lastMessage || ''}
                                >
                                    {lead.lastMessage || '-'}
                                </td>
                                <td>
                                    {#if filesCount > 0}
                                        <button
                                            type="button"
                                            class="btn-view-files"
                                            onclick={() => openLeadFiles(lead)}
                                        >
                                            📁 Ver {filesCount} archivo(s)
                                        </button>
                                    {:else}
                                        <span class="badge-no-files"
                                            >Sin archivos</span
                                        >
                                    {/if}
                                </td>
                                <td class="date-cell"
                                    >{formatDate(lead.lastInteraction)}</td
                                >
                                <td>
                                    {#if lead.humanPaused}
                                        <span
                                            style="color: #fb7185; font-weight: 600;"
                                            >🛑 Pausado (Humano)</span
                                        >
                                    {:else}
                                        <span style="color: #4ade80;"
                                            >🤖 Bot Activo</span
                                        >
                                    {/if}
                                </td>
                                <td>
                                    <div class="lead-actions-row">
                                        <button
                                            type="button"
                                            class="btn btn-outline-sm btn-view-chat"
                                            onclick={() => openLeadChat(lead)}
                                            title="Ver historial de conversación y chatear"
                                        >
                                            💬 Ver Chat
                                        </button>
                                        <button
                                            type="button"
                                            class="btn btn-outline-sm btn-add-grp"
                                            onclick={() =>
                                                (contactToAssign = {
                                                    name: lead.name,
                                                    phone: lead.phone,
                                                })}
                                            title="Asignar a un grupo de difusión"
                                        >
                                            👥 + Grupo
                                        </button>
                                        {#if $hasPermission('leads:pause')}
                                            <button
                                                type="button"
                                                class="btn btn-outline-sm btn-toggle-lead"
                                                onclick={() =>
                                                    togglePauseLead(lead.phone)}
                                                title={lead.humanPaused
                                                    ? 'Reactivar atención automática del bot'
                                                    : 'Pausar bot para atención humana'}
                                            >
                                                {lead.humanPaused
                                                    ? 'Reactivar'
                                                    : 'Pausar'}
                                            </button>
                                        {/if}
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {/if}
    {:else}
        <!-- ==================== VISTA 2: AGENDA DE CONTACTOS & DIFUSIÓN ==================== -->
        <div class="content-toolbar">
            <div>
                <h2>Agenda de Contactos & Difusión de Contenido</h2>
                <p class="section-desc">
                    Directorio de contactos sincronizados de WhatsApp o
                    importados desde Google Contacts. Organízalos en grupos para
                    difusiones masivas.
                </p>
            </div>
            <div class="toolbar-actions-group">
                <select class="source-filter-select" bind:value={sourceFilter}>
                    <option value="all"
                        >Todos los orígenes ({$contacts.length})</option
                    >
                    <option value="google_csv">Google Contacts CSV</option>
                    <option value="whatsapp">Agenda de WhatsApp</option>
                    <option value="manual">Manuales</option>
                </select>
                <div class="toolbar-search">
                    <input
                        type="search"
                        class="search-input"
                        placeholder="🔍 Buscar contacto por nombre o número..."
                        bind:value={searchQuery}
                    />
                </div>
                <button
                    type="button"
                    class="btn btn-outline"
                    onclick={() => isGroupsModalOpen.set(true)}
                    title="Crear y organizar grupos de difusión"
                >
                    👥 Grupos de Difusión ({$groups.length})
                </button>
                <button
                    type="button"
                    class="btn btn-primary"
                    onclick={() => isImportModalOpen.set(true)}
                    title="Importar más contactos desde CSV o WhatsApp"
                >
                    📥 Importar Contactos
                </button>
            </div>
        </div>

        <!-- Barra Flotante de Asignación Masiva a Grupos -->
        {#if selectedContactPhones.size > 0}
            <div class="batch-assignment-banner">
                <div class="batch-left">
                    <span class="batch-badge"
                        >📌 <strong>{selectedContactPhones.size}</strong>
                        seleccionado{selectedContactPhones.size !== 1
                            ? 's'
                            : ''}</span
                    >
                    <span class="batch-desc"
                        >Asignar contactos a un grupo de difusión:</span
                    >
                </div>
                <div class="batch-right">
                    <select
                        class="batch-group-select"
                        bind:value={batchTargetGroupId}
                    >
                        <option value="">Selecciona un grupo destino...</option>
                        {#each $groups as g}
                            <option value={g.id}
                                >{g.name} ({g.memberCount || 0} contactos)</option
                            >
                        {/each}
                    </select>
                    <button
                        type="button"
                        class="btn btn-primary btn-sm"
                        disabled={!batchTargetGroupId || isAssigningBatch}
                        onclick={handleAssignBatchToGroup}
                    >
                        {isAssigningBatch
                            ? 'Asignando...'
                            : '➕ Asignar al Grupo'}
                    </button>
                    <button
                        type="button"
                        class="btn btn-outline-sm btn-clear-sel"
                        onclick={clearContactSelection}
                    >
                        Desmarcar
                    </button>
                </div>
            </div>
        {/if}

        {#if filteredContacts.length === 0}
            <div class="empty-leads-state">
                <div style="font-size: 40px; margin-bottom: 12px;">📒</div>
                <h3>No se encontraron contactos en la agenda</h3>
                <p>
                    Puedes importar tus contactos de Google o sincronizar los
                    contactos de tu cuenta de WhatsApp para crear grupos y
                    enviar difusiones masivas.
                </p>
                <div style="margin-top: 14px;">
                    <button
                        type="button"
                        class="btn btn-primary"
                        onclick={() => isImportModalOpen.set(true)}
                    >
                        📥 Importar Contactos Ahora
                    </button>
                </div>
            </div>
        {:else}
            <div class="leads-table-container">
                <table class="leads-table">
                    <thead>
                        <tr>
                            <th style="width: 36px; text-align: center;">
                                <input
                                    type="checkbox"
                                    aria-label="Seleccionar todos los visibles"
                                    onchange={toggleSelectAllVisible}
                                    checked={allVisibleSelected}
                                />
                            </th>
                            <th>Contacto</th>
                            <th>Origen</th>
                            <th>Etiqueta / Lista</th>
                            <th>Fecha de Registro</th>
                            <th style="text-align: right;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each paginatedContacts as contact (contact.phone)}
                            {@const isSelected = selectedContactPhones.has(
                                contact.phone,
                            )}
                            <tr class={isSelected ? 'row-selected' : ''}>
                                <td style="text-align: center;">
                                    <input
                                        type="checkbox"
                                        aria-label="Seleccionar contacto"
                                        onchange={() =>
                                            toggleSelectContact(contact.phone)}
                                        checked={isSelected}
                                    />
                                </td>
                                <td>
                                    <div class="lead-name-box">
                                        <strong
                                            >{contact.name ||
                                                'Sin Nombre'}</strong
                                        >
                                        <span class="lead-phone-text"
                                            >+{contact.phone}</span
                                        >
                                    </div>
                                </td>
                                <td>
                                    {#if contact.source === 'whatsapp'}
                                        <span
                                            class="badge-source badge-whatsapp"
                                            >📱 Agenda WhatsApp</span
                                        >
                                    {:else if contact.source === 'google_csv'}
                                        <span class="badge-source badge-google"
                                            >📄 Google Contacts</span
                                        >
                                    {:else}
                                        <span class="badge-source badge-manual"
                                            >👤 Manual</span
                                        >
                                    {/if}
                                </td>
                                <td>
                                    <span class="badge-tag">
                                        🏷️ {contact.tags || 'General'}
                                    </span>
                                </td>
                                <td class="date-cell"
                                    >{formatDate(contact.createdAt)}</td
                                >
                                <td style="text-align: right;">
                                    <div
                                        style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;"
                                    >
                                        <button
                                            type="button"
                                            class="btn-group-pill-sm"
                                            onclick={() =>
                                                (contactToAssign = contact)}
                                            title="Asignar este contacto a un grupo de difusión"
                                        >
                                            👥 + Grupo
                                        </button>
                                        <button
                                            type="button"
                                            class="btn-delete-contact"
                                            onclick={() =>
                                                handleDeleteContact(
                                                    contact.phone,
                                                    contact.name,
                                                )}
                                            title="Eliminar de la agenda"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

            <!-- Paginación -->
            {#if totalContactPages > 1}
                <div class="pagination-bar">
                    <div class="pagination-info">
                        Mostrando {(currentPage - 1) * pageSize + 1} - {Math.min(
                            currentPage * pageSize,
                            filteredContacts.length,
                        )} de {filteredContacts.length} contactos
                    </div>
                    <div class="pagination-controls">
                        <button
                            type="button"
                            class="btn-page"
                            disabled={currentPage <= 1}
                            onclick={() => currentPage--}
                        >
                            ◀ Anterior
                        </button>
                        <span class="page-indicator"
                            >Página {currentPage} de {totalContactPages}</span
                        >
                        <button
                            type="button"
                            class="btn-page"
                            disabled={currentPage >= totalContactPages}
                            onclick={() => currentPage++}
                        >
                            Siguiente ▶
                        </button>
                    </div>
                </div>
            {/if}
        {/if}
    {/if}

    <!-- Modal Rápido: Asignar Contacto o Prospecto a un Grupo -->
    {#if contactToAssign}
        <Modal
            isOpen={Boolean(contactToAssign)}
            title="👥 Asignar a Grupo de Difusión"
            subtitle="Añade a {contactToAssign.name ||
                'este contacto'} (+{contactToAssign.phone}) a un grupo de difusión"
            maxWidth="460px"
            onClose={() => (contactToAssign = null)}
        >
            {#if $groups.length === 0}
                <div class="empty-assign-state">
                    <p>No tienes grupos de difusión creados aún.</p>
                    <button
                        type="button"
                        class="btn btn-primary btn-sm"
                        onclick={() => {
                            contactToAssign = null;
                            isGroupsModalOpen.set(true);
                        }}
                    >
                        + Crear Primer Grupo
                    </button>
                </div>
            {:else}
                <div class="assign-groups-modal-body">
                    <p
                        style="font-size: 0.84rem; color: var(--text-muted); margin-bottom: 12px;"
                    >
                        Selecciona el grupo al que deseas agregar a este
                        contacto:
                    </p>
                    <div class="assign-groups-list">
                        {#each $groups as g}
                            <button
                                type="button"
                                class="assign-group-item"
                                onclick={() =>
                                    handleAssignSingleToGroup(
                                        g.id,
                                        contactToAssign.phone,
                                    )}
                            >
                                <div class="assign-group-info">
                                    <span
                                        class="assign-color-dot"
                                        style="background-color: {g.color ||
                                            '#38bdf8'};"
                                    ></span>
                                    <div>
                                        <strong
                                            style="color: #fff; font-size: 0.9rem;"
                                            >{g.name}</strong
                                        >
                                        {#if g.description}
                                            <span class="assign-group-desc"
                                                >{g.description}</span
                                            >
                                        {/if}
                                    </div>
                                </div>
                                <span class="assign-group-count"
                                    >👤 {g.memberCount || 0}</span
                                >
                            </button>
                        {/each}
                    </div>
                </div>
            {/if}
        </Modal>
    {/if}
</section>

<style>
    .leads-view-selector {
        display: flex;
        gap: 12px;
        margin-bottom: 20px;
        border-bottom: 1px solid var(--border-subtle);
        padding-bottom: 12px;
    }

    .subtab-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 18px;
        background: rgba(15, 23, 42, 0.5);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        color: var(--text-muted);
        font-size: 0.92rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .subtab-btn:hover {
        color: #fff;
        border-color: rgba(56, 189, 248, 0.4);
    }

    .subtab-btn.active {
        background: rgba(56, 189, 248, 0.15);
        border-color: #38bdf8;
        color: #38bdf8;
        box-shadow: 0 0 12px rgba(56, 189, 248, 0.15);
    }

    .subtab-badge {
        background: rgba(255, 255, 255, 0.1);
        color: var(--text-muted);
        font-size: 0.75rem;
        padding: 2px 7px;
        border-radius: 9999px;
    }

    .subtab-btn.active .subtab-badge {
        background: rgba(56, 189, 248, 0.3);
        color: #38bdf8;
    }

    .subtab-badge-accent {
        background: rgba(34, 197, 94, 0.2);
        color: #4ade80;
    }

    .toolbar-actions-group {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
    }
    .toolbar-search {
        display: flex;
        align-items: center;
    }
    .search-input {
        min-width: 280px;
    }

    .source-filter-select {
        padding: 8px 12px;
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        color: #fff;
        font-size: 0.86rem;
        outline: none;
    }

    /* Barra de asignación masiva a grupos */
    .batch-assignment-banner {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 16px;
        background: rgba(30, 41, 59, 0.95);
        border: 1px solid #38bdf8;
        border-radius: var(--radius-md);
        margin-bottom: 14px;
        box-shadow: 0 4px 16px rgba(56, 189, 248, 0.15);
        flex-wrap: wrap;
        gap: 10px;
    }

    .batch-left {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .batch-badge {
        background: rgba(56, 189, 248, 0.2);
        color: #38bdf8;
        padding: 4px 10px;
        border-radius: 9999px;
        font-size: 0.82rem;
        font-weight: 600;
    }

    .batch-desc {
        font-size: 0.84rem;
        color: var(--text-primary);
    }

    .batch-right {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    }

    .batch-group-select {
        padding: 6px 10px;
        background: rgba(15, 23, 42, 0.9);
        border: 1px solid var(--border-subtle);
        border-radius: 6px;
        color: #fff;
        font-size: 0.82rem;
        outline: none;
    }

    .btn-clear-sel {
        color: var(--text-muted) !important;
    }

    .row-selected {
        background: rgba(56, 189, 248, 0.08) !important;
    }

    .badge-source {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 8px;
        border-radius: 6px;
        font-size: 0.76rem;
        font-weight: 600;
    }

    .badge-whatsapp {
        background: rgba(34, 197, 94, 0.15);
        color: #4ade80;
        border: 1px solid rgba(34, 197, 94, 0.3);
    }

    .badge-google {
        background: rgba(56, 189, 248, 0.15);
        color: #38bdf8;
        border: 1px solid rgba(56, 189, 248, 0.3);
    }

    .badge-manual {
        background: rgba(148, 163, 184, 0.15);
        color: #94a3b8;
        border: 1px solid rgba(148, 163, 184, 0.3);
    }

    .btn-group-pill-sm {
        background: rgba(56, 189, 248, 0.12);
        border: 1px solid rgba(56, 189, 248, 0.3);
        color: #38bdf8;
        padding: 3px 8px;
        border-radius: 4px;
        font-size: 0.76rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
    }

    .btn-group-pill-sm:hover {
        background: rgba(56, 189, 248, 0.25);
        color: #fff;
    }

    .btn-add-grp {
        color: #a855f7 !important;
        border-color: rgba(168, 85, 247, 0.3) !important;
    }
    .btn-add-grp:hover {
        background: rgba(168, 85, 247, 0.15) !important;
        border-color: #a855f7 !important;
    }

    .btn-delete-contact {
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 1rem;
        opacity: 0.6;
        transition: opacity 0.2s ease;
        padding: 4px;
    }
    .btn-delete-contact:hover {
        opacity: 1;
    }

    .pagination-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 16px;
        padding: 10px 14px;
        background: rgba(15, 23, 42, 0.4);
        border-radius: var(--radius-md);
        border: 1px solid var(--border-subtle);
        flex-wrap: wrap;
        gap: 10px;
    }

    .pagination-info {
        font-size: 0.84rem;
        color: var(--text-muted);
    }

    .pagination-controls {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .btn-page {
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid var(--border-subtle);
        color: #fff;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 0.82rem;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .btn-page:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    .btn-page:not(:disabled):hover {
        background: rgba(56, 189, 248, 0.2);
        border-color: #38bdf8;
    }

    .page-indicator {
        font-size: 0.84rem;
        color: var(--text-muted);
    }

    .empty-leads-state {
        text-align: center;
        padding: 60px 20px;
        background: rgba(15, 23, 42, 0.4);
        border: 2px dashed var(--border-subtle);
        border-radius: var(--radius-lg);
        color: var(--text-muted);
        max-width: 600px;
        margin: 40px auto;
    }
    .empty-leads-state h3 {
        color: #fff;
        margin-bottom: 6px;
        font-size: 1.15rem;
    }

    .last-msg-cell {
        max-width: 240px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .date-cell {
        font-size: 0.82rem;
        color: var(--text-muted);
    }

    .lead-actions-row {
        display: flex;
        gap: 8px;
        align-items: center;
    }

    .btn-view-chat {
        color: #38bdf8 !important;
        border-color: rgba(56, 189, 248, 0.3) !important;
    }
    .btn-view-chat:hover {
        background: rgba(56, 189, 248, 0.12) !important;
        border-color: #38bdf8 !important;
    }

    /* Modal de asignación a grupo */
    .assign-groups-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 280px;
        overflow-y: auto;
    }

    .assign-group-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 12px;
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: left;
        width: 100%;
    }

    .assign-group-item:hover {
        border-color: #38bdf8;
        background: rgba(56, 189, 248, 0.12);
    }

    .assign-group-info {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .assign-color-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .assign-group-desc {
        display: block;
        font-size: 0.76rem;
        color: var(--text-muted);
    }

    .assign-group-count {
        font-size: 0.78rem;
        color: var(--text-dim);
    }

    .empty-assign-state {
        text-align: center;
        padding: 30px;
        color: var(--text-muted);
    }
</style>
