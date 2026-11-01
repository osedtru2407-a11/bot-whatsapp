<script>
  import { groups, isGroupsModalOpen, createGroup, deleteGroup, getGroupMembers, addMembersToGroup, removeMemberFromGroup } from '../../stores/groups';
  import { leads } from '../../stores/leads';
  import { contacts } from '../../stores/contacts';
  import { showToast } from '../../stores/toast';
  import Modal from '../common/Modal.svelte';

  let selectedGroup = $state(null);
  let groupMembers = $state([]);
  let isLoadingMembers = $state(false);

  // Formulario nuevo grupo
  let showCreateForm = $state(false);
  let newGroupName = $state('');
  let newGroupDesc = $state('');
  let newGroupColor = $state('#38bdf8');

  // Modos para añadir miembros: 'search' | 'tag' | 'direct'
  let addMode = $state('search');
  let contactSearchQuery = $state('');
  let selectedTagToAdd = $state('');
  let directPhone = $state('');
  let isAddingMember = $state(false);
  let memberFilter = $state('');

  // Unificar contactos de la agenda y prospectos para el buscador sin duplicados
  const allDirectoryContacts = $derived.by(() => {
    const map = new Map();
    // 1. Contactos de la agenda
    for (const c of ($contacts || [])) {
      if (c.phone) {
        map.set(c.phone, {
          phone: c.phone,
          name: c.name || c.phone,
          source: c.source === 'whatsapp' ? 'Agenda WhatsApp' : (c.source === 'google_csv' ? 'Google Contacts' : 'Agenda'),
          tag: c.tags || 'Sin etiqueta'
        });
      }
    }
    // 2. Prospectos del CRM
    for (const l of ($leads || [])) {
      if (l.phone && l.phone !== 'status@broadcast' && !l.phone.includes('@broadcast')) {
        if (!map.has(l.phone)) {
          map.set(l.phone, {
            phone: l.phone,
            name: l.name || l.phone,
            source: 'CRM Lead',
            tag: l.tag || 'Nuevo'
          });
        }
      }
    }
    return Array.from(map.values());
  });

  // Resultados de búsqueda en vivo en la agenda/CRM
  const searchResults = $derived.by(() => {
    const q = contactSearchQuery.trim().toLowerCase();
    if (!q) {
      return allDirectoryContacts.slice(0, 10);
    }
    const cleanQ = q.replace(/\D/g, '');
    return allDirectoryContacts.filter(c => {
      const matchName = c.name.toLowerCase().includes(q);
      const matchPhone = c.phone.includes(q) || (cleanQ && c.phone.replace(/\D/g, '').includes(cleanQ));
      const matchTag = c.tag.toLowerCase().includes(q);
      return matchName || matchPhone || matchTag;
    }).slice(0, 20);
  });

  // Set de teléfonos ya registrados en este grupo
  const existingMemberPhoneSet = $derived(
    new Set(groupMembers.map(m => m.phone))
  );

  // Derivar etiquetas únicas combinando CRM y Agenda de Contactos
  const availableTags = $derived(
    Array.from(new Set([
      ...$leads.map(l => l.tag || 'Nuevo'),
      ...$contacts.map(c => c.tags || '')
    ])).filter(Boolean)
  );

  // Miembros del grupo filtrados por texto
  const filteredGroupMembers = $derived(
    groupMembers.filter(m => {
      if (!memberFilter.trim()) return true;
      const q = memberFilter.toLowerCase();
      return (m.name || '').toLowerCase().includes(q) || (m.phone || '').includes(q);
    })
  );

  function handleClose() {
    isGroupsModalOpen.set(false);
    selectedGroup = null;
    showCreateForm = false;
    contactSearchQuery = '';
    directPhone = '';
  }

  async function handleSelectGroup(grp) {
    selectedGroup = grp;
    isLoadingMembers = true;
    groupMembers = await getGroupMembers(grp.id);
    isLoadingMembers = false;
    contactSearchQuery = '';
  }

  async function handleCreateGroup(e) {
    e.preventDefault();
    if (!newGroupName.trim()) {
      showToast('Ingresa el nombre del grupo', 'warning');
      return;
    }

    const res = await createGroup({
      name: newGroupName.trim(),
      description: newGroupDesc.trim(),
      color: newGroupColor
    });

    if (res.success) {
      newGroupName = '';
      newGroupDesc = '';
      showCreateForm = false;
      if (res.group) {
        handleSelectGroup(res.group);
      }
    }
  }

  async function handleDeleteGroup(id, name) {
    if (confirm(`¿Deseas eliminar el grupo de difusión "${name}"? Los contactos no serán eliminados del sistema.`)) {
      await deleteGroup(id);
      if (selectedGroup?.id === id) {
        selectedGroup = null;
        groupMembers = [];
      }
    }
  }

  // Añadir un contacto individual (con o sin etiqueta)
  async function handleAddSingleContact(phone) {
    if (!selectedGroup || !phone) return;
    isAddingMember = true;
    const res = await addMembersToGroup(selectedGroup.id, [phone]);
    if (res.success) {
      groupMembers = await getGroupMembers(selectedGroup.id);
    }
    isAddingMember = false;
  }

  // Añadir un teléfono directo manualmente
  async function handleAddDirectPhone() {
    if (!selectedGroup || !directPhone.trim()) {
      showToast('Ingresa el número de WhatsApp', 'warning');
      return;
    }
    const cleanPhone = directPhone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 7) {
      showToast('Ingresa un número de teléfono válido con código de país', 'warning');
      return;
    }
    isAddingMember = true;
    const res = await addMembersToGroup(selectedGroup.id, [cleanPhone]);
    if (res.success) {
      groupMembers = await getGroupMembers(selectedGroup.id);
      directPhone = '';
    }
    isAddingMember = false;
  }

  // Añadir masivamente por etiqueta
  async function handleAddTagMembers() {
    if (!selectedGroup || !selectedTagToAdd) return;
    const targetTagLower = selectedTagToAdd.toLowerCase();

    const matchingFromLeads = $leads
      .filter(l => (l.tag || '').toLowerCase() === targetTagLower && l.phone && l.phone !== 'status@broadcast')
      .map(l => l.phone);

    const matchingFromContacts = $contacts
      .filter(c => (c.tags || '').toLowerCase() === targetTagLower && c.phone)
      .map(c => c.phone);

    const matchingPhones = Array.from(new Set([...matchingFromLeads, ...matchingFromContacts]));

    if (matchingPhones.length === 0) {
      showToast(`No hay contactos con la etiqueta "${selectedTagToAdd}"`, 'info');
      return;
    }

    isAddingMember = true;
    await addMembersToGroup(selectedGroup.id, matchingPhones);
    groupMembers = await getGroupMembers(selectedGroup.id);
    selectedTagToAdd = '';
    isAddingMember = false;
  }

  async function handleRemoveMember(phone) {
    if (!selectedGroup) return;
    await removeMemberFromGroup(selectedGroup.id, phone);
    groupMembers = groupMembers.filter(m => m.phone !== phone);
  }
</script>

<Modal 
  isOpen={$isGroupsModalOpen}
  title="👥 Grupos Personalizados de Difusión"
  subtitle="Organiza contactos en listas para programar campañas de contenido segmentadas"
  maxWidth="840px"
  onClose={handleClose}
>
  <div class="groups-container">
    <!-- Panel Izquierdo: Lista de Grupos -->
    <div class="groups-sidebar">
      <div class="sidebar-header">
        <h4>Tus Grupos ({$groups.length})</h4>
        <button 
          type="button" 
          class="btn btn-outline-sm btn-new-grp" 
          onclick={() => { showCreateForm = !showCreateForm; selectedGroup = null; }}
        >
          {showCreateForm ? 'Ver Lista' : '+ Nuevo'}
        </button>
      </div>

      {#if showCreateForm}
        <form onsubmit={handleCreateGroup} class="create-grp-form">
          <div class="form-group">
            <label for="grp-name-in">Nombre del Grupo</label>
            <input 
              type="text" 
              id="grp-name-in" 
              placeholder="Ej: Clientes VIP, Lanzamiento..." 
              bind:value={newGroupName} 
              required 
            />
          </div>
          <div class="form-group">
            <label for="grp-desc-in">Descripción (Opcional)</label>
            <input 
              type="text" 
              id="grp-desc-in" 
              placeholder="Detalles sobre este grupo" 
              bind:value={newGroupDesc} 
            />
          </div>
          <div class="form-group">
            <label for="grp-color-in">Color del Grupo</label>
            <div class="color-picker-row">
              {#each ['#38bdf8', '#a855f7', '#22c55e', '#f59e0b', '#ec4899', '#64748b'] as c}
                <button 
                  type="button" 
                  aria-label="Color {c}"
                  class="color-circle {newGroupColor === c ? 'selected' : ''}" 
                  style="background-color: {c};" 
                  onclick={() => newGroupColor = c}
                ></button>
              {/each}
            </div>
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 8px;">
            Guardar Grupo
          </button>
        </form>
      {:else if $groups.length === 0}
        <div class="empty-groups">
          <p>No tienes grupos creados todavía.</p>
          <button 
            type="button" 
            class="btn btn-primary btn-sm" 
            onclick={() => showCreateForm = true}
          >
            Crear Primer Grupo
          </button>
        </div>
      {:else}
        <div class="groups-list">
          {#each $groups as grp (grp.id)}
            <div 
              class="group-card {selectedGroup?.id === grp.id ? 'active' : ''}"
              onclick={() => handleSelectGroup(grp)}
              role="button"
              tabindex="0"
              onkeydown={(e) => { if (e.key === 'Enter') handleSelectGroup(grp); }}
            >
              <div class="group-card-header">
                <span class="group-color-dot" style="background-color: {grp.color || '#38bdf8'};"></span>
                <strong class="group-name">{grp.name}</strong>
              </div>
              {#if grp.description}
                <p class="group-desc">{grp.description}</p>
              {/if}
              <div class="group-card-footer">
                <span class="member-count-badge">👤 {grp.memberCount || 0} contacto{grp.memberCount !== 1 ? 's' : ''}</span>
                <button 
                  type="button" 
                  class="btn-delete-grp" 
                  onclick={(e) => { e.stopPropagation(); handleDeleteGroup(grp.id, grp.name); }}
                  title="Eliminar grupo"
                >
                  🗑️
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Panel Derecho: Detalle del Grupo y Gestión de Miembros -->
    <div class="group-detail-panel">
      {#if selectedGroup}
        <div class="detail-header">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="group-color-dot large" style="background-color: {selectedGroup.color || '#38bdf8'};"></span>
              <h3>{selectedGroup.name}</h3>
            </div>
            <p style="font-size: 0.84rem; color: var(--text-muted); margin-top: 4px;">
              {selectedGroup.description || 'Sin descripción'} • <strong>{groupMembers.length} contactos</strong>
            </p>
          </div>
        </div>

        <!-- Caja de Adición de Miembros con 3 Opciones -->
        <div class="add-members-box">
          <div class="add-modes-nav">
            <button 
              type="button" 
              class="btn-mode-tab {addMode === 'search' ? 'active' : ''}" 
              onclick={() => addMode = 'search'}
            >
              🔍 Buscar Contacto
            </button>
            <button 
              type="button" 
              class="btn-mode-tab {addMode === 'tag' ? 'active' : ''}" 
              onclick={() => addMode = 'tag'}
            >
              🏷️ Añadir por Etiqueta
            </button>
            <button 
              type="button" 
              class="btn-mode-tab {addMode === 'direct' ? 'active' : ''}" 
              onclick={() => addMode = 'direct'}
            >
              ➕ Número Directo
            </button>
          </div>

          <!-- MODO 1: Búsqueda individual en la agenda o CRM (con o sin etiqueta) -->
          {#if addMode === 'search'}
            <div class="add-pane add-search-pane">
              <input 
                type="search" 
                class="form-search-input" 
                placeholder="🔍 Escribe nombre o número para buscar y añadir..." 
                bind:value={contactSearchQuery} 
              />
              <div class="search-results-list">
                {#if searchResults.length === 0}
                  <div class="search-empty-text">No se encontraron contactos en tu agenda con esa búsqueda.</div>
                {:else}
                  {#each searchResults as item (item.phone)}
                    {@const isAlreadyInGroup = existingMemberPhoneSet.has(item.phone)}
                    <div class="search-item-row">
                      <div class="search-item-info">
                        <strong>{item.name}</strong>
                        <span class="search-item-phone">+{item.phone}</span>
                        <span class="badge-source-mini">{item.source}</span>
                        {#if item.tag && item.tag !== 'Sin etiqueta'}
                          <span class="badge-tag-mini">🏷️ {item.tag}</span>
                        {/if}
                      </div>
                      {#if isAlreadyInGroup}
                        <span class="badge-in-group">✓ En el grupo</span>
                      {:else}
                        <button 
                          type="button" 
                          class="btn-add-contact-chip" 
                          onclick={() => handleAddSingleContact(item.phone)}
                          disabled={isAddingMember}
                        >
                          + Añadir
                        </button>
                      {/if}
                    </div>
                  {/each}
                {/if}
              </div>
            </div>

          <!-- MODO 2: Añadir masivamente por etiqueta -->
          {:else if addMode === 'tag'}
            <div class="add-pane add-tag-pane">
              <label for="add-tag-sel" style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 4px;">
                Añadir todos los contactos registrados con esta etiqueta:
              </label>
              <div style="display: flex; gap: 8px;">
                <select id="add-tag-sel" class="form-select flex-1" bind:value={selectedTagToAdd}>
                  <option value="">Selecciona una etiqueta...</option>
                  {#each availableTags as t}
                    <option value={t}>{t}</option>
                  {/each}
                </select>
                <button 
                  type="button" 
                  class="btn btn-primary btn-sm" 
                  onclick={handleAddTagMembers}
                  disabled={!selectedTagToAdd || isAddingMember}
                >
                  {isAddingMember ? 'Añadiendo...' : '+ Añadir al Grupo'}
                </button>
              </div>
            </div>

          <!-- MODO 3: Añadir un teléfono directo -->
          {:else if addMode === 'direct'}
            <div class="add-pane add-direct-pane">
              <label for="add-direct-in" style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 4px;">
                Ingresa el número con indicativo de país (ej. 573001234567):
              </label>
              <div style="display: flex; gap: 8px;">
                <input 
                  type="tel" 
                  id="add-direct-in"
                  class="form-search-input flex-1" 
                  placeholder="ej: 573001234567" 
                  bind:value={directPhone} 
                />
                <button 
                  type="button" 
                  class="btn btn-primary btn-sm" 
                  onclick={handleAddDirectPhone}
                  disabled={!directPhone.trim() || isAddingMember}
                >
                  {isAddingMember ? 'Añadiendo...' : '+ Añadir'}
                </button>
              </div>
            </div>
          {/if}
        </div>

        <!-- Barra de Miembros Actuales -->
        <div class="members-section-header">
          <span style="font-weight: 600; font-size: 0.88rem; color: #fff;">
            Miembros Actuales ({groupMembers.length})
          </span>
          {#if groupMembers.length > 5}
            <input 
              type="search" 
              class="filter-members-input" 
              placeholder="Filtrar miembros..." 
              bind:value={memberFilter} 
            />
          {/if}
        </div>

        <!-- Lista de Miembros -->
        <div class="members-stream">
          {#if isLoadingMembers}
            <div style="text-align: center; padding: 30px; color: var(--text-muted);">Cargando miembros...</div>
          {:else if groupMembers.length === 0}
            <div class="empty-members">
              <p>Este grupo no tiene miembros todavía.</p>
              <span>Usa el buscador de arriba para añadir contactos sin etiqueta, busca por etiqueta o escribe un número directo.</span>
            </div>
          {:else}
            <div class="members-table-wrap">
              <table class="mini-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Teléfono</th>
                    <th>Origen</th>
                    <th>Etiqueta</th>
                    <th style="width: 40px; text-align: right;">Quitar</th>
                  </tr>
                </thead>
                <tbody>
                  {#each filteredGroupMembers as m (m.phone)}
                    <tr>
                      <td><strong>{m.name || 'Cliente'}</strong></td>
                      <td>+{m.phone}</td>
                      <td>
                        <span class="badge-source-mini">{m.source || 'Agenda'}</span>
                      </td>
                      <td>
                        <span class="badge-mini-tag">{m.tag || 'Sin etiqueta'}</span>
                      </td>
                      <td style="text-align: right;">
                        <button 
                          type="button" 
                          class="btn-remove-member" 
                          onclick={() => handleRemoveMember(m.phone)} 
                          title="Quitar del grupo"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      {:else}
        <div class="no-selection-state">
          <div style="font-size: 44px; margin-bottom: 10px;">👥</div>
          <h4>Selecciona un grupo</h4>
          <p>Elige un grupo de la lista de la izquierda para ver y gestionar sus miembros, o crea uno nuevo.</p>
        </div>
      {/if}
    </div>
  </div>
</Modal>

<style>
  .groups-container {
    display: flex;
    gap: 18px;
    min-height: 480px;
  }

  .groups-sidebar {
    width: 270px;
    border-right: 1px solid var(--border-subtle);
    padding-right: 16px;
    display: flex;
    flex-direction: column;
  }

  .sidebar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .sidebar-header h4 {
    color: #fff;
    margin: 0;
  }

  .create-grp-form {
    background: rgba(15, 23, 42, 0.5);
    padding: 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-subtle);
  }

  .color-picker-row {
    display: flex;
    gap: 8px;
    margin-top: 6px;
  }

  .color-circle {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 0.15s ease;
  }

  .color-circle:hover {
    transform: scale(1.15);
  }

  .color-circle.selected {
    border-color: #fff;
    transform: scale(1.2);
  }

  .empty-groups {
    text-align: center;
    padding: 30px 10px;
    color: var(--text-muted);
    font-size: 0.86rem;
  }

  .groups-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    max-height: 410px;
  }

  .group-card {
    padding: 10px 12px;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .group-card:hover {
    border-color: rgba(56, 189, 248, 0.4);
    background: rgba(30, 41, 59, 0.6);
  }

  .group-card.active {
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.12);
  }

  .group-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .group-color-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .group-color-dot.large {
    width: 16px;
    height: 16px;
  }

  .group-name {
    color: #fff;
    font-size: 0.9rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .group-desc {
    font-size: 0.78rem;
    color: var(--text-muted);
    margin: 4px 0 0 18px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .group-card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 8px;
    font-size: 0.78rem;
  }

  .member-count-badge {
    color: var(--text-dim);
  }

  .btn-delete-grp {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 13px;
    opacity: 0.6;
    transition: opacity 0.15s ease;
  }

  .btn-delete-grp:hover {
    opacity: 1;
  }

  .group-detail-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .detail-header {
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 10px;
    margin-bottom: 10px;
  }

  .detail-header h3 {
    color: #fff;
    margin: 0;
  }

  /* Barra de Modo de Adición */
  .add-members-box {
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 10px 12px;
    margin-bottom: 12px;
  }

  .add-modes-nav {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 8px;
  }

  .btn-mode-tab {
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-muted);
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-mode-tab:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.05);
  }

  .btn-mode-tab.active {
    background: rgba(56, 189, 248, 0.15);
    border-color: rgba(56, 189, 248, 0.3);
    color: #38bdf8;
  }

  .form-search-input {
    width: 100%;
    padding: 8px 12px;
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    color: #fff;
    font-size: 0.84rem;
    outline: none;
  }

  .form-search-input:focus {
    border-color: var(--accent-primary);
  }

  .search-results-list {
    max-height: 150px;
    overflow-y: auto;
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-right: 4px;
  }

  .search-empty-text {
    font-size: 0.8rem;
    color: var(--text-dim);
    text-align: center;
    padding: 10px;
  }

  .search-item-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    background: rgba(30, 41, 59, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    font-size: 0.82rem;
  }

  .search-item-info {
    display: flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .search-item-phone {
    color: var(--text-muted);
    font-size: 0.78rem;
  }

  .badge-source-mini {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-muted);
    font-size: 0.7rem;
    padding: 1px 5px;
    border-radius: 4px;
  }

  .badge-tag-mini {
    background: rgba(56, 189, 248, 0.12);
    color: #38bdf8;
    font-size: 0.7rem;
    padding: 1px 5px;
    border-radius: 4px;
  }

  .badge-in-group {
    color: #4ade80;
    font-size: 0.78rem;
    font-weight: 600;
  }

  .btn-add-contact-chip {
    background: rgba(56, 189, 248, 0.2);
    border: 1px solid rgba(56, 189, 248, 0.4);
    color: #38bdf8;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.76rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-add-contact-chip:hover:not(:disabled) {
    background: #38bdf8;
    color: #0f172a;
  }

  .members-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .filter-members-input {
    padding: 4px 8px;
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    color: #fff;
    font-size: 0.78rem;
    outline: none;
    width: 140px;
  }

  .members-stream {
    flex: 1;
    overflow-y: auto;
    max-height: 230px;
  }

  .empty-members {
    text-align: center;
    padding: 30px 20px;
    color: var(--text-muted);
    font-size: 0.84rem;
  }

  .members-table-wrap {
    background: rgba(15, 23, 42, 0.4);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-subtle);
    overflow: hidden;
  }

  .mini-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }

  .mini-table th {
    text-align: left;
    padding: 8px 10px;
    background: rgba(30, 41, 59, 0.6);
    color: var(--text-muted);
    font-weight: 600;
  }

  .mini-table td {
    padding: 7px 10px;
    border-top: 1px solid var(--border-subtle);
    color: var(--text-primary);
  }

  .badge-mini-tag {
    font-size: 0.72rem;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
  }

  .btn-remove-member {
    background: transparent;
    border: none;
    color: #fb7185;
    font-weight: bold;
    cursor: pointer;
    font-size: 13px;
    padding: 2px 6px;
  }

  .btn-remove-member:hover {
    color: #f43f5e;
  }

  .no-selection-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    color: var(--text-muted);
  }

  .no-selection-state h4 {
    color: #fff;
    margin-bottom: 6px;
  }

  .form-select {
    padding: 8px 10px;
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    color: #fff;
    font-size: 0.84rem;
  }
</style>
