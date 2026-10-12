// WhatsApp Sales Bot Studio - Client Application with Media Support

let currentRules = [];
let currentSchedules = [];
let currentSettings = {};
let currentLeads = [];

// Estado de archivos adjuntos temporales
let currentRuleAttachedMedia = null;
let currentQuickSendMedia = null;
let currentSchedMedia = null;

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initConnectionMonitor();
  initDropzones();
  initRules();
  initScheduler();
  initSimulator();
  initQuickSend();
  initLeads();
  initSettings();
  initModalTools();
});

// ==================== 1. NAVEGACIÓN POR PESTAÑAS ====================
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');

      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetContent = document.getElementById(targetId);
      if (targetContent) {
        targetContent.classList.add('active');
      }

      // Refrescar datos según la pestaña activa
      if (targetId === 'tab-rules') loadRules();
      if (targetId === 'tab-scheduler') loadSchedules();
      if (targetId === 'tab-leads') loadLeads();
      if (targetId === 'tab-settings') loadSettings();
    });
  });
}

// ==================== 2. MONITOREO DE CONEXIÓN Y QR ====================
function initConnectionMonitor() {
  const pill = document.getElementById('connection-pill');
  const pillText = document.getElementById('connection-text');
  const qrBanner = document.getElementById('qr-modal-banner');
  const qrImage = document.getElementById('qr-image');
  const botToggle = document.getElementById('bot-toggle');
  const botLabel = document.getElementById('bot-toggle-label');
  const btnReconnect = document.getElementById('btn-reconnect');

  async function checkStatus() {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error('Error al consultar estado');
      const data = await res.json();

      pill.className = 'connection-pill';
      if (data.status === 'ready') {
        pill.classList.add('status-ready');
        const phone = data.clientInfo?.wid ? ` (+${data.clientInfo.wid})` : '';
        pillText.textContent = `Conectado${phone}`;
        qrBanner.classList.add('hidden');
      } else if (data.status === 'qr_ready') {
        pill.classList.add('status-qr');
        pillText.textContent = 'Escanear QR Requerido';
        if (data.qrCode) {
          qrImage.src = data.qrCode;
          qrBanner.classList.remove('hidden');
        }
      } else if (data.status === 'authenticated') {
        pill.classList.add('status-loading');
        pillText.textContent = 'Autenticado, sincronizando...';
        qrBanner.classList.add('hidden');
      } else if (data.status === 'initializing') {
        pill.classList.add('status-loading');
        pillText.textContent = 'Iniciando WhatsApp Web...';
      } else {
        pill.classList.add('status-disconnected');
        pillText.textContent = 'Desconectado';
      }

      botToggle.checked = Boolean(data.botEnabled);
      botLabel.textContent = data.botEnabled ? 'Bot Activo' : 'Bot Pausado';

      const schedBadge = document.getElementById('tab-sched-badge');
      if (schedBadge) {
        schedBadge.textContent = data.pendingSchedulesCount || 0;
      }

    } catch (err) {
      pill.className = 'connection-pill status-disconnected';
      pillText.textContent = 'Servidor sin responder';
    }
  }

  checkStatus();
  setInterval(checkStatus, 3000);

  botToggle.addEventListener('change', async () => {
    try {
      const res = await fetch('/api/bot/toggle', { method: 'POST' });
      const result = await res.json();
      botLabel.textContent = result.botEnabled ? 'Bot Activo' : 'Bot Pausado';
      showToast(result.botEnabled ? 'Bot de WhatsApp activado' : 'Bot pausado temporalmente', 'info');
    } catch (e) {
      showToast('Error al cambiar estado del bot', 'error');
    }
  });

  btnReconnect.addEventListener('click', async () => {
    btnReconnect.disabled = true;
    showToast('Reiniciando sesión de WhatsApp...', 'info');
    try {
      await fetch('/api/bot/restart', { method: 'POST' });
      setTimeout(checkStatus, 1500);
    } catch (e) {
      showToast('Error al reconectar', 'error');
    } finally {
      setTimeout(() => { btnReconnect.disabled = false; }, 4000);
    }
  });
}

// ==================== 3. GESTIÓN Y SUBIDA DE ARCHIVOS (DROPZONES) ====================
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadFileApi(file, folder = 'rules') {
  if (file.size > 50 * 1024 * 1024) {
    throw new Error('El archivo supera los 50 MB. Por favor elige un archivo más liviano.');
  }
  const base64Data = await readFileAsBase64(file);
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      mimetype: file.type,
      data: base64Data,
      folder
    })
  });
  if (!res.ok) {
    if (res.status === 413) {
      throw new Error('El servidor rechazó el archivo por tamaño (413). Recuerda reiniciar el panel para que tome la nueva configuración.');
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error al procesar el archivo (código ${res.status})`);
  }
  return await res.json();
}

function renderFilePreview(container, mediaObj, onRemove) {
  if (!mediaObj) {
    container.innerHTML = '';
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  const isImage = (mediaObj.mimetype || '').startsWith('image/');
  const icon = isImage ? '' : (mediaObj.mimetype || '').includes('pdf') ? '📄' : '📎';

  container.innerHTML = `
    <div class="file-preview-left">
      ${isImage 
        ? `<img src="${mediaObj.url}" alt="${escapeHtml(mediaObj.filename)}" class="file-preview-thumb">`
        : `<div class="file-icon-placeholder">${icon}</div>`
      }
      <div class="file-preview-meta">
        <span class="file-preview-name" title="${escapeHtml(mediaObj.filename)}">${escapeHtml(mediaObj.filename)}</span>
        <span class="file-preview-size">${formatBytes(mediaObj.size || 0)} • ${escapeHtml(mediaObj.mimetype || 'Archivo')}</span>
      </div>
    </div>
    <button type="button" class="btn-remove-file" title="Eliminar archivo adjunto">✕ Quitar</button>
  `;

  container.querySelector('.btn-remove-file').addEventListener('click', onRemove);
}

function setupDropzone({ dropzoneId, inputId, previewId, folder, onUploaded, onCleared }) {
  const dropzone = document.getElementById(dropzoneId);
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  if (!dropzone || !input || !preview) return;

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  ['dragleave', 'dragend'].forEach(ev => {
    dropzone.addEventListener(ev, () => dropzone.classList.remove('dragover'));
  });

  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleFile(e.dataTransfer.files[0]);
    }
  });

  input.addEventListener('change', async () => {
    if (input.files && input.files[0]) {
      await handleFile(input.files[0]);
    }
  });

  async function handleFile(file) {
    showToast(`Subiendo ${file.name}...`, 'info');
    try {
      const mediaResult = await uploadFileApi(file, folder);
      onUploaded(mediaResult);
      renderFilePreview(preview, mediaResult, () => {
        onCleared();
        renderFilePreview(preview, null);
        input.value = '';
      });
      showToast(`Archivo "${file.name}" adjuntado`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

function initDropzones() {
  // 1. Dropzone de Reglas / Rutas
  setupDropzone({
    dropzoneId: 'rule-dropzone',
    inputId: 'rule-file-input',
    previewId: 'rule-file-preview',
    folder: 'rules',
    onUploaded: (media) => { currentRuleAttachedMedia = media; },
    onCleared: () => { currentRuleAttachedMedia = null; }
  });

  // 2. Dropzone de Envío Rápido
  setupDropzone({
    dropzoneId: 'quick-dropzone',
    inputId: 'quick-file-input',
    previewId: 'quick-file-preview',
    folder: 'quick',
    onUploaded: (media) => { currentQuickSendMedia = media; },
    onCleared: () => { currentQuickSendMedia = null; }
  });

  // 3. Dropzone de Programación de Envíos
  setupDropzone({
    dropzoneId: 'sched-dropzone',
    inputId: 'sched-file-input',
    previewId: 'sched-file-preview',
    folder: 'quick',
    onUploaded: (media) => { currentSchedMedia = media; },
    onCleared: () => { currentSchedMedia = null; }
  });
}

// ==================== 4. RUTAS DE RESPUESTA / REGLAS ====================
function initRules() {
  const btnOpenModal = document.getElementById('btn-open-create-rule');
  const modal = document.getElementById('rule-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const modalForm = document.getElementById('rule-modal-form');

  const triggerTypeSelect = document.getElementById('rule-trigger-type');
  const groupMediaFilter = document.getElementById('group-media-filter');
  const groupTriggers = document.getElementById('group-triggers');
  const groupMatchType = document.getElementById('group-match-type');
  const triggersHelp = document.getElementById('rule-triggers-help');

  function updateTriggerVisibility() {
    const val = triggerTypeSelect.value;
    if (val === 'media') {
      groupMediaFilter.style.display = 'block';
      groupTriggers.style.display = 'block';
      groupMatchType.style.display = 'none';
      triggersHelp.textContent = 'Palabras clave opcionales si el cliente escribe un mensaje acompañando al archivo (ej: comprobante, pago).';
    } else if (val === 'both') {
      groupMediaFilter.style.display = 'block';
      groupTriggers.style.display = 'block';
      groupMatchType.style.display = 'block';
      triggersHelp.textContent = 'Se activará si el cliente escribe estas palabras O si envía el archivo especificado.';
    } else {
      groupMediaFilter.style.display = 'none';
      groupTriggers.style.display = 'block';
      groupMatchType.style.display = 'block';
      triggersHelp.textContent = 'Si el mensaje del cliente contiene alguna de estas palabras, se activará la respuesta.';
    }
  }

  triggerTypeSelect.addEventListener('change', updateTriggerVisibility);

  btnOpenModal.addEventListener('click', () => {
    document.getElementById('modal-rule-title').textContent = 'Nueva Ruta de Venta';
    document.getElementById('modal-rule-id').value = '';
    modalForm.reset();
    currentRuleAttachedMedia = null;
    renderFilePreview(document.getElementById('rule-file-preview'), null);
    triggerTypeSelect.value = 'text';
    document.getElementById('rule-match-type').value = 'contains_any';
    updateTriggerVisibility();
    modal.classList.remove('hidden');
  });

  const closeModal = () => modal.classList.add('hidden');
  btnCloseModal.addEventListener('click', closeModal);
  btnCancelModal.addEventListener('click', closeModal);

  modalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('modal-rule-id').value;
    const name = document.getElementById('rule-name').value.trim();
    const triggerType = triggerTypeSelect.value;
    const mediaTypeFilter = document.getElementById('rule-media-filter').value;
    const matchType = document.getElementById('rule-match-type').value;
    const triggersRaw = document.getElementById('rule-triggers').value;
    const response = document.getElementById('rule-response').value.trim();
    const leadTag = document.getElementById('rule-lead-tag').value.trim() || 'Interesado';
    const pauseBot = document.getElementById('rule-pause-bot').checked;

    const triggers = triggersRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    if (triggerType === 'text' && !triggers.length) {
      showToast('Ingresa al menos una palabra clave para rutas de texto', 'error');
      return;
    }

    if (!response && !currentRuleAttachedMedia) {
      showToast('Ingresa un texto de respuesta o adjunta un archivo para enviar', 'error');
      return;
    }

    const payload = {
      name,
      triggerType,
      mediaTypeFilter,
      matchType,
      triggers,
      response,
      media: currentRuleAttachedMedia,
      leadTag,
      pauseBot,
      enabled: true
    };

    try {
      if (id) {
        const res = await fetch(`/api/rules/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Error al actualizar ruta');
        showToast(`Ruta "${name}" actualizada con éxito`, 'success');
      } else {
        const res = await fetch('/api/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Error al crear ruta');
        showToast(`Ruta "${name}" creada correctamente`, 'success');
      }
      closeModal();
      loadRules();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  loadRules();
}

async function loadRules() {
  const container = document.getElementById('rules-grid');
  try {
    const res = await fetch('/api/rules');
    currentRules = await res.json();

    if (!currentRules.length) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-dim);">
          No tienes rutas de respuesta configuradas. Haz clic en "Nueva Ruta de Venta" para crear la primera.
        </div>`;
      return;
    }

    container.innerHTML = currentRules.map(rule => {
      const matchTypeLabels = {
        contains_any: 'Contiene palabra',
        exact: 'Coincidencia exacta',
        starts_with: 'Empieza con'
      };

      const mediaFilterLabels = {
        any: 'Cualquier archivo',
        image: 'Foto / Comprobante',
        document: 'Documento / PDF',
        audio: 'Audio / Nota de voz'
      };

      const triggersHtml = (rule.triggers || [])
        .map(t => `<span class="trigger-pill">${escapeHtml(t)}</span>`)
        .join('');

      let triggerBadgeHtml = '';
      if (rule.triggerType === 'media') {
        triggerBadgeHtml = `<div class="rule-trigger-badge">📥 Disparador: Al recibir ${mediaFilterLabels[rule.mediaTypeFilter] || 'archivo'}</div>`;
      } else if (rule.triggerType === 'both') {
        triggerBadgeHtml = `<div class="rule-trigger-badge">🔄 Disparador: Texto O ${mediaFilterLabels[rule.mediaTypeFilter] || 'archivo'}</div>`;
      }

      let attachedMediaBadge = '';
      if (rule.media && rule.media.url) {
        attachedMediaBadge = `
          <div class="rule-media-badge" title="${escapeHtml(rule.media.filename)}">
            📎 Envía adjunto: <strong>${escapeHtml(rule.media.filename)}</strong> (${formatBytes(rule.media.size)})
          </div>
        `;
      }

      return `
        <div class="rule-card ${rule.enabled === false ? 'disabled' : ''}" data-id="${rule.id}">
          <div class="rule-card-header">
            <div class="rule-title-group">
              <h3>${escapeHtml(rule.name)}</h3>
              <span class="rule-meta-tag">${rule.triggerType === 'media' ? 'Por Archivo' : (matchTypeLabels[rule.matchType] || 'Palabra clave')}</span>
            </div>
            <label class="switch" title="Activar/Desactivar regla">
              <input type="checkbox" class="rule-toggle-switch" data-id="${rule.id}" ${rule.enabled !== false ? 'checked' : ''}>
              <span class="slider round"></span>
            </label>
          </div>

          ${triggerBadgeHtml}

          ${(rule.triggers && rule.triggers.length > 0) ? `
            <div class="rule-triggers-container">
              <span class="rule-label">Palabras Clave:</span>
              <div class="triggers-pills">
                ${triggersHtml}
              </div>
            </div>
          ` : ''}

          <div class="rule-response-container">
            <span class="rule-label">Respuesta del Bot:</span>
            <div class="rule-response-preview">${escapeHtml(rule.response || '(Solo envía archivo adjunto)')}</div>
            ${attachedMediaBadge}
          </div>

          <div class="rule-card-footer">
            <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
              <span class="badge-tag badge-tag-interesado">🏷️ ${escapeHtml(rule.leadTag || 'Lead')}</span>
              ${rule.pauseBot ? '<span class="badge-tag badge-tag-requiereasesor">👤 Pausa para Asesor</span>' : ''}
            </div>
            <div class="rule-card-actions">
              <button class="icon-btn edit-rule-btn" data-id="${rule.id}" title="Editar regla">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </button>
              <button class="icon-btn delete-btn delete-rule-btn" data-id="${rule.id}" title="Eliminar regla">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Eventos
    container.querySelectorAll('.edit-rule-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const rule = currentRules.find(r => r.id === id);
        if (!rule) return;

        document.getElementById('modal-rule-title').textContent = 'Editar Ruta de Respuesta';
        document.getElementById('modal-rule-id').value = rule.id;
        document.getElementById('rule-name').value = rule.name;

        const trigSelect = document.getElementById('rule-trigger-type');
        trigSelect.value = rule.triggerType || 'text';
        document.getElementById('rule-media-filter').value = rule.mediaTypeFilter || 'any';
        document.getElementById('rule-match-type').value = rule.matchType || 'contains_any';
        document.getElementById('rule-triggers').value = (rule.triggers || []).join(', ');
        document.getElementById('rule-response').value = rule.response || '';
        document.getElementById('rule-lead-tag').value = rule.leadTag || '';
        document.getElementById('rule-pause-bot').checked = Boolean(rule.pauseBot);

        // Disparar cambio visual
        trigSelect.dispatchEvent(new Event('change'));

        // Cargar archivo adjunto si tiene
        currentRuleAttachedMedia = rule.media || null;
        renderFilePreview(document.getElementById('rule-file-preview'), currentRuleAttachedMedia, () => {
          currentRuleAttachedMedia = null;
          renderFilePreview(document.getElementById('rule-file-preview'), null);
        });

        document.getElementById('rule-modal').classList.remove('hidden');
      });
    });

    container.querySelectorAll('.delete-rule-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('¿Estás seguro de eliminar esta ruta de respuesta?')) return;
        try {
          await fetch(`/api/rules/${id}`, { method: 'DELETE' });
          showToast('Ruta eliminada', 'info');
          loadRules();
        } catch (e) {
          showToast('Error al eliminar', 'error');
        }
      });
    });

    container.querySelectorAll('.rule-toggle-switch').forEach(sw => {
      sw.addEventListener('change', async () => {
        const id = sw.getAttribute('data-id');
        try {
          await fetch(`/api/rules/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: sw.checked })
          });
          const card = sw.closest('.rule-card');
          if (card) card.classList.toggle('disabled', !sw.checked);
        } catch (e) {
          showToast('Error al cambiar estado de la regla', 'error');
        }
      });
    });

  } catch (err) {
    container.innerHTML = `<div style="color: var(--accent-rose);">Error cargando rutas: ${err.message}</div>`;
  }
}

// ==================== 5. PROGRAMACIÓN DE ENVÍOS CON MEDIOS ====================
function initScheduler() {
  const form = document.getElementById('schedule-form');
  const dtInput = document.getElementById('sched-datetime');

  const defaultDate = new Date(Date.now() + 60 * 60 * 1000);
  dtInput.value = new Date(defaultDate.getTime() - defaultDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('sched-name').value.trim();
    const recipient = document.getElementById('sched-recipient').value.trim();
    const scheduledTime = new Date(dtInput.value).toISOString();
    const message = document.getElementById('sched-message').value.trim();

    if (!recipient || (!message && !currentSchedMedia) || !dtInput.value) {
      showToast('Ingresa número de destino, fecha y (mensaje o archivo adjunto)', 'error');
      return;
    }

    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          recipient,
          scheduledTime,
          message,
          media: currentSchedMedia
        })
      });
      if (!res.ok) throw new Error('Error al programar');
      showToast('Envío programado exitosamente', 'success');
      form.reset();
      currentSchedMedia = null;
      renderFilePreview(document.getElementById('sched-file-preview'), null);
      dtInput.value = new Date(Date.now() + 60 * 60 * 1000 - defaultDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      loadSchedules();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  loadSchedules();
}

async function loadSchedules() {
  const container = document.getElementById('schedules-list');
  try {
    const res = await fetch('/api/schedules');
    currentSchedules = await res.json();

    if (!currentSchedules.length) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-dim);">
          No hay envíos programados actualmente.
        </div>`;
      return;
    }

    container.innerHTML = currentSchedules.map(item => {
      const statusLabels = {
        pending: 'Pendiente',
        sent: 'Enviado con Éxito',
        failed: 'Fallido'
      };

      const dateStr = new Date(item.scheduledTime).toLocaleString('es-CO', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });

      const mediaBadge = item.media ? `
        <div class="rule-media-badge" style="margin-bottom: 6px;">
          📎 Archivo adjunto: ${escapeHtml(item.media.filename)}
        </div>` : '';

      return `
        <div class="sched-item">
          <div class="sched-header">
            <div>
              <div class="sched-title">${escapeHtml(item.name)}</div>
              <div class="sched-phone">Destino: +${escapeHtml(item.recipient)}</div>
            </div>
            <span class="sched-badge ${item.status}">${statusLabels[item.status] || item.status}</span>
          </div>

          <div class="sched-time">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            Programado para: <strong>${dateStr}</strong>
          </div>

          ${mediaBadge}
          <div class="sched-msg">${escapeHtml(item.message || '(Solo archivo adjunto)')}</div>

          <div class="sched-actions">
            ${item.status === 'pending' ? `
              <button class="btn btn-outline-sm btn-send-now" data-id="${item.id}">
                🚀 Enviar Ahora
              </button>
            ` : ''}
            <button class="icon-btn delete-btn btn-delete-sched" data-id="${item.id}" title="Eliminar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.btn-send-now').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        btn.disabled = true;
        btn.textContent = 'Enviando...';
        try {
          const res = await fetch(`/api/schedules/${id}/send-now`, { method: 'POST' });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          showToast('Mensaje enviado de inmediato', 'success');
          loadSchedules();
        } catch (e) {
          showToast(e.message, 'error');
          btn.disabled = false;
          btn.textContent = '🚀 Enviar Ahora';
        }
      });
    });

    container.querySelectorAll('.btn-delete-sched').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('¿Deseas eliminar este registro de envío?')) return;
        try {
          await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
          showToast('Registro eliminado', 'info');
          loadSchedules();
        } catch (e) {
          showToast('Error al eliminar', 'error');
        }
      });
    });

  } catch (err) {
    container.innerHTML = `<div style="color: var(--accent-rose);">Error: ${err.message}</div>`;
  }
}

// ==================== 6. SIMULADOR EN VIVO ====================
function initSimulator() {
  const form = document.getElementById('phone-chat-input-form');
  const input = document.getElementById('phone-chat-input');
  const chatBody = document.getElementById('phone-chat-messages');
  const chips = document.querySelectorAll('.chip-btn');
  const btnReceipt = document.getElementById('btn-sim-send-receipt');
  const btnPdf = document.getElementById('btn-sim-send-pdf');

  function appendMessage({ text = '', isUser = false, media = null, userMediaIcon = null }) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const bubble = document.createElement('div');
    bubble.className = `msg-bubble ${isUser ? 'user-bubble' : 'bot-bubble'}`;

    let mediaHtml = '';
    if (media && media.url) {
      const isImg = (media.mimetype || '').startsWith('image/');
      if (isImg) {
        mediaHtml = `<div class="sim-bubble-media"><img src="${media.url}" alt="${escapeHtml(media.filename || 'Archivo')}"></div>`;
      } else {
        mediaHtml = `
          <div class="sim-bubble-doc">
            <span class="sim-bubble-doc-icon">📄</span>
            <div class="sim-bubble-doc-info">
              <span class="sim-bubble-doc-name">${escapeHtml(media.filename || 'Documento')}</span>
              <span class="sim-bubble-doc-type">${escapeHtml(media.mimetype || 'PDF')}</span>
            </div>
          </div>
        `;
      }
    } else if (userMediaIcon) {
      mediaHtml = `
        <div class="sim-bubble-doc">
          <span class="sim-bubble-doc-icon">${userMediaIcon}</span>
          <div class="sim-bubble-doc-info">
            <span class="sim-bubble-doc-name">[Archivo adjunto simulado]</span>
          </div>
        </div>
      `;
    }

    bubble.innerHTML = `
      ${mediaHtml}
      ${text ? `<div>${escapeHtml(text)}</div>` : ''}
      <span class="msg-time">${time}</span>
    `;
    chatBody.appendChild(bubble);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  async function triggerSimulation({ text = '', hasMedia = false, mediaMimetype = '', userIcon = null }) {
    appendMessage({ text, isUser: true, userMediaIcon: userIcon });

    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, hasMedia, mediaMimetype })
      });
      const data = await res.json();

      setTimeout(() => {
        appendMessage({
          text: data.response,
          isUser: false,
          media: data.media
        });
      }, 500);

    } catch (e) {
      appendMessage({ text: 'Error conectando con el simulador.', isUser: false });
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = input.value.trim();
    if (val) {
      triggerSimulation({ text: val });
      input.value = '';
    }
  });

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      triggerSimulation({ text: chip.getAttribute('data-text') });
    });
  });

  if (btnReceipt) {
    btnReceipt.addEventListener('click', () => {
      triggerSimulation({
        text: 'Hola, aquí les envío la foto de mi comprobante de pago Nequi',
        hasMedia: true,
        mediaMimetype: 'image/jpeg',
        userIcon: '🧾'
      });
    });
  }

  if (btnPdf) {
    btnPdf.addEventListener('click', () => {
      triggerSimulation({
        text: 'Adjunto el documento con los detalles del pedido',
        hasMedia: true,
        mediaMimetype: 'application/pdf',
        userIcon: '📄'
      });
    });
  }
}

// ==================== 7. ENVÍO DIRECTO CON MEDIOS ====================
function initQuickSend() {
  const form = document.getElementById('quick-send-form');
  const resultBanner = document.getElementById('quick-send-result');
  const submitBtn = document.getElementById('btn-submit-quick-send');
  const presetButtons = document.querySelectorAll('.quick-presets button');

  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('quick-message').value = btn.getAttribute('data-msg');
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = document.getElementById('quick-phone').value.trim();
    const message = document.getElementById('quick-message').value.trim();

    if (!phone || (!message && !currentQuickSendMedia)) {
      showToast('Ingresa número de destino y (mensaje o archivo)', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Enviando a WhatsApp...';
    resultBanner.className = 'result-banner hidden';

    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          message,
          media: currentQuickSendMedia
        })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Fallo al enviar mensaje');
      }

      resultBanner.className = 'result-banner success';
      resultBanner.textContent = `✅ ¡Entregado exitosamente a +${phone}${currentQuickSendMedia ? ' con archivo adjunto' : ''}!`;
      showToast('Mensaje entregado por WhatsApp', 'success');

    } catch (err) {
      resultBanner.className = 'result-banner error';
      resultBanner.textContent = `❌ Error: ${err.message}`;
      showToast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        Enviar Ahora por WhatsApp
      `;
    }
  });
}

// ==================== 8. PROSPECTOS & VISOR DE ARCHIVOS RECIBIDOS ====================
async function loadLeads() {
  const tbody = document.getElementById('leads-table-body');
  try {
    const res = await fetch('/api/leads');
    currentLeads = await res.json();

    if (!currentLeads.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 32px; color: var(--text-dim);">
            No hay prospectos registrados aún. Cuando te escriban o envíen archivos a WhatsApp aparecerán automáticamente aquí.
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = currentLeads.map(l => {
      const dateStr = l.lastInteraction ? new Date(l.lastInteraction).toLocaleString('es-CO', {
        dateStyle: 'short',
        timeStyle: 'short'
      }) : 'Reciente';

      const tagClass = 'badge-tag-' + (l.tag || 'nuevo').toLowerCase().replace(/\s+/g, '');
      const filesCount = (l.receivedFiles && Array.isArray(l.receivedFiles)) ? l.receivedFiles.length : 0;

      const filesColHtml = filesCount > 0 
        ? `<button class="btn-view-files" data-phone="${escapeHtml(l.phone)}">📁 Ver ${filesCount} archivo(s)</button>`
        : `<span class="badge-no-files">Sin archivos</span>`;

      return `
        <tr>
          <td>
            <div class="lead-name-box">
              <strong>${escapeHtml(l.name || 'Sin Nombre')}</strong>
              <span class="lead-phone-text">+${escapeHtml(l.phone)}</span>
            </div>
          </td>
          <td>
            <span class="badge-tag ${tagClass}">🏷️ ${escapeHtml(l.tag || 'Nuevo')}</span>
          </td>
          <td style="max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${escapeHtml(l.lastMessage || '-')}
          </td>
          <td>
            ${filesColHtml}
          </td>
          <td>${dateStr}</td>
          <td>
            ${l.humanPaused ? '<span style="color: #fb7185; font-weight: 600;">🛑 Bot Pausado (Humano)</span>' : '<span style="color: #4ade80;">🤖 Bot Activo</span>'}
          </td>
          <td>
            <button class="btn btn-outline-sm btn-toggle-lead" data-phone="${l.phone}">
              ${l.humanPaused ? 'Reactivar Bot' : 'Pausar Bot'}
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Toggle Pausa
    tbody.querySelectorAll('.btn-toggle-lead').forEach(btn => {
      btn.addEventListener('click', async () => {
        const phone = btn.getAttribute('data-phone');
        try {
          const res = await fetch(`/api/leads/${phone}/toggle-pause`, { method: 'POST' });
          const data = await res.json();
          showToast(data.humanPaused ? 'Bot pausado para este cliente' : 'Bot reactivado para este cliente', 'info');
          loadLeads();
        } catch (e) {
          showToast('Error al modificar cliente', 'error');
        }
      });
    });

    // Abrir visor de archivos
    tbody.querySelectorAll('.btn-view-files').forEach(btn => {
      btn.addEventListener('click', () => {
        const phone = btn.getAttribute('data-phone');
        const lead = currentLeads.find(l => l.phone === phone);
        if (lead) openLeadFilesModal(lead);
      });
    });

  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" style="color: var(--accent-rose);">Error: ${e.message}</td></tr>`;
  }
}

function openLeadFilesModal(lead) {
  const modal = document.getElementById('lead-files-modal');
  const title = document.getElementById('lead-modal-title');
  const subtitle = document.getElementById('lead-modal-subtitle');
  const gallery = document.getElementById('lead-files-gallery');
  const btnQuickReply = document.getElementById('btn-lead-quick-reply');

  title.textContent = `Archivos recibidos de ${lead.name || 'Cliente'}`;
  subtitle.textContent = `Número: +${lead.phone} • Total: ${lead.receivedFiles.length} archivo(s)`;

  gallery.innerHTML = lead.receivedFiles.map(file => {
    const isImage = (file.mimetype || '').startsWith('image/');
    const isAudio = (file.mimetype || '').startsWith('audio/') || (file.mimetype || '').includes('ogg');
    const dateStr = file.receivedAt ? new Date(file.receivedAt).toLocaleString('es-CO') : 'Reciente';

    let previewContent = '';
    if (isImage) {
      previewContent = `<img src="${file.url}" alt="${escapeHtml(file.filename)}" loading="lazy">`;
    } else if (isAudio) {
      previewContent = `<span class="gallery-file-icon">🎵</span>`;
    } else {
      const icon = (file.mimetype || '').includes('pdf') ? '📄' : '📁';
      previewContent = `<span class="gallery-file-icon">${icon}</span>`;
    }

    return `
      <div class="gallery-card">
        <div class="gallery-media-preview">
          ${previewContent}
        </div>
        <div class="gallery-card-body">
          <span class="gallery-filename" title="${escapeHtml(file.filename)}">${escapeHtml(file.filename)}</span>
          ${file.caption ? `<div class="gallery-caption">"${escapeHtml(file.caption)}"</div>` : ''}
          ${isAudio ? `<audio controls src="${file.url}" style="width: 100%; margin: 6px 0; height: 32px;"></audio>` : ''}
          <div class="gallery-meta-row">
            <span>${formatBytes(file.size || 0)}</span>
            <span>${dateStr}</span>
          </div>
          <a href="${file.url}" download="${escapeHtml(file.filename)}" target="_blank" class="gallery-download-btn">
            ⬇️ Descargar / Ver
          </a>
        </div>
      </div>
    `;
  }).join('');

  btnQuickReply.onclick = () => {
    modal.classList.add('hidden');
    // Ir a pestaña de Envío Rápido y prellenar número
    document.querySelector('.tab-btn[data-tab="tab-quick-send"]').click();
    document.getElementById('quick-phone').value = lead.phone;
    document.getElementById('quick-message').focus();
  };

  modal.classList.remove('hidden');
}

function initLeads() {
  const modal = document.getElementById('lead-files-modal');
  const btnClose = document.getElementById('btn-close-lead-files');
  const btnCloseBtn = document.getElementById('btn-close-lead-modal-btn');

  const close = () => modal.classList.add('hidden');
  btnClose.addEventListener('click', close);
  btnCloseBtn.addEventListener('click', close);

  loadLeads();
}

// ==================== 9. CONFIGURACIÓN ====================
function initSettings() {
  const form = document.getElementById('settings-form');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const businessName = document.getElementById('set-biz-name').value.trim();
    const simulateTyping = document.getElementById('set-simulate-typing').value === 'true';
    const typingDelaySeconds = parseInt(document.getElementById('set-delay-seconds').value, 10) || 2;
    const ignoreGroups = document.getElementById('set-ignore-groups').value === 'true';
    const fallbackMessage = document.getElementById('set-fallback').value.trim();

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName,
          simulateTyping,
          typingDelaySeconds,
          ignoreGroups,
          fallbackMessage
        })
      });
      if (!res.ok) throw new Error('Error al guardar');
      showToast('Configuración guardada correctamente', 'success');
      document.getElementById('sim-business-name').textContent = businessName;
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  loadSettings();
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    currentSettings = await res.json();

    document.getElementById('set-biz-name').value = currentSettings.businessName || '';
    document.getElementById('set-simulate-typing').value = String(currentSettings.simulateTyping ?? true);
    document.getElementById('set-delay-seconds').value = currentSettings.typingDelaySeconds || 2;
    document.getElementById('set-ignore-groups').value = String(currentSettings.ignoreGroups ?? true);
    document.getElementById('set-fallback').value = currentSettings.fallbackMessage || '';

    const simName = document.getElementById('sim-business-name');
    if (simName) simName.textContent = currentSettings.businessName || 'Mi Tienda Virtual';
  } catch (e) {
    console.error('Error cargando configuración:', e);
  }
}

// ==================== 10. HERRAMIENTAS RÁPIDAS DEL MODAL ====================
function initModalTools() {
  const textarea = document.getElementById('rule-response');
  const toolButtons = document.querySelectorAll('.editor-quick-tools .tool-btn');

  toolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const insert = btn.getAttribute('data-insert');
      const wrap = btn.getAttribute('data-wrap');

      if (insert) {
        insertAtCursor(textarea, insert);
      } else if (wrap) {
        wrapSelection(textarea, wrap);
      }
    });
  });
}

function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const val = textarea.value;
  textarea.value = val.substring(0, start) + text + val.substring(end);
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
  textarea.focus();
}

function wrapSelection(textarea, wrapper) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const val = textarea.value;
  const selected = val.substring(start, end) || 'texto';
  const replacement = `${wrapper}${selected}${wrapper}`;
  textarea.value = val.substring(0, start) + replacement + val.substring(end);
  textarea.selectionStart = start + wrapper.length;
  textarea.selectionEnd = start + replacement.length - wrapper.length;
  textarea.focus();
}

// ==================== 11. UTILIDADES ====================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
