// WhatsApp Sales Bot Studio - Client Application

let currentRules = [];
let currentSchedules = [];
let currentSettings = {};

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initConnectionMonitor();
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

      // Actualizar Pill
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

      // Actualizar Toggle de Bot
      botToggle.checked = Boolean(data.botEnabled);
      botLabel.textContent = data.botEnabled ? 'Bot Activo' : 'Bot Pausado';

      // Contador de envíos pendientes
      const schedBadge = document.getElementById('tab-sched-badge');
      if (schedBadge) {
        schedBadge.textContent = data.pendingSchedulesCount || 0;
      }

    } catch (err) {
      pill.className = 'connection-pill status-disconnected';
      pillText.textContent = 'Servidor sin responder';
    }
  }

  // Polling cada 3 segundos
  checkStatus();
  setInterval(checkStatus, 3000);

  // Toggle Bot Activo/Pausado
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

  // Botón Reconectar
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

// ==================== 3. RUTAS DE RESPUESTA / REGLAS ====================
function initRules() {
  const btnOpenModal = document.getElementById('btn-open-create-rule');
  const modal = document.getElementById('rule-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const modalForm = document.getElementById('rule-modal-form');

  btnOpenModal.addEventListener('click', () => {
    document.getElementById('modal-rule-title').textContent = 'Nueva Ruta de Venta';
    document.getElementById('modal-rule-id').value = '';
    modalForm.reset();
    document.getElementById('rule-match-type').value = 'contains_any';
    modal.classList.remove('hidden');
  });

  const closeModal = () => modal.classList.add('hidden');
  btnCloseModal.addEventListener('click', closeModal);
  btnCancelModal.addEventListener('click', closeModal);

  modalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('modal-rule-id').value;
    const name = document.getElementById('rule-name').value.trim();
    const matchType = document.getElementById('rule-match-type').value;
    const triggersRaw = document.getElementById('rule-triggers').value;
    const response = document.getElementById('rule-response').value.trim();
    const leadTag = document.getElementById('rule-lead-tag').value.trim() || 'Interesado';
    const pauseBot = document.getElementById('rule-pause-bot').checked;

    const triggers = triggersRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    if (!triggers.length) {
      showToast('Ingresa al menos una palabra clave', 'error');
      return;
    }

    const payload = { name, matchType, triggers, response, leadTag, pauseBot, enabled: true };

    try {
      if (id) {
        // Actualizar
        const res = await fetch(`/api/rules/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Error al actualizar');
        showToast(`Ruta "${name}" actualizada con éxito`, 'success');
      } else {
        // Crear
        const res = await fetch('/api/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Error al crear');
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
        contains_any: 'Contiene palabra clave',
        exact: 'Coincidencia exacta',
        starts_with: 'Empieza con'
      };

      const triggersHtml = (rule.triggers || [])
        .map(t => `<span class="trigger-pill">${escapeHtml(t)}</span>`)
        .join('');

      return `
        <div class="rule-card ${rule.enabled === false ? 'disabled' : ''}" data-id="${rule.id}">
          <div class="rule-card-header">
            <div class="rule-title-group">
              <h3>${escapeHtml(rule.name)}</h3>
              <span class="rule-meta-tag">${matchTypeLabels[rule.matchType] || 'Palabra clave'}</span>
            </div>
            <label class="switch" title="Activar/Desactivar regla">
              <input type="checkbox" class="rule-toggle-switch" data-id="${rule.id}" ${rule.enabled !== false ? 'checked' : ''}>
              <span class="slider round"></span>
            </label>
          </div>

          <div class="rule-triggers-container">
            <span class="rule-label">Palabras Clave Disparadoras:</span>
            <div class="triggers-pills">
              ${triggersHtml}
            </div>
          </div>

          <div class="rule-response-container">
            <span class="rule-label">Respuesta del Bot:</span>
            <div class="rule-response-preview">${escapeHtml(rule.response)}</div>
          </div>

          <div class="rule-card-footer">
            <div style="display: flex; gap: 6px; align-items: center;">
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

    // Eventos de botones en tarjetas
    container.querySelectorAll('.edit-rule-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const rule = currentRules.find(r => r.id === id);
        if (!rule) return;

        document.getElementById('modal-rule-title').textContent = 'Editar Ruta de Respuesta';
        document.getElementById('modal-rule-id').value = rule.id;
        document.getElementById('rule-name').value = rule.name;
        document.getElementById('rule-match-type').value = rule.matchType || 'contains_any';
        document.getElementById('rule-triggers').value = (rule.triggers || []).join(', ');
        document.getElementById('rule-response').value = rule.response;
        document.getElementById('rule-lead-tag').value = rule.leadTag || '';
        document.getElementById('rule-pause-bot').checked = Boolean(rule.pauseBot);

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
    container.innerHTML = `<div style="color: var(--accent-rose);">Error cargando reglas: ${err.message}</div>`;
  }
}

// ==================== 4. PROGRAMACIÓN DE ENVÍOS ====================
function initScheduler() {
  const form = document.getElementById('schedule-form');
  const dtInput = document.getElementById('sched-datetime');

  // Ajustar fecha predeterminada: 1 hora a futuro
  const defaultDate = new Date(Date.now() + 60 * 60 * 1000);
  dtInput.value = new Date(defaultDate.getTime() - defaultDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('sched-name').value.trim();
    const recipient = document.getElementById('sched-recipient').value.trim();
    const scheduledTime = new Date(dtInput.value).toISOString();
    const message = document.getElementById('sched-message').value.trim();

    if (!recipient || !message || !dtInput.value) {
      showToast('Por favor completa todos los campos', 'error');
      return;
    }

    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, recipient, scheduledTime, message })
      });
      if (!res.ok) throw new Error('Error al programar');
      showToast('Envío programado exitosamente', 'success');
      form.reset();
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

          <div class="sched-msg">${escapeHtml(item.message)}</div>

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

// ==================== 5. SIMULADOR EN VIVO ====================
function initSimulator() {
  const form = document.getElementById('phone-chat-input-form');
  const input = document.getElementById('phone-chat-input');
  const chatBody = document.getElementById('phone-chat-messages');
  const chips = document.querySelectorAll('.chip-btn');

  function appendMessage(text, isUser = false) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const bubble = document.createElement('div');
    bubble.className = `msg-bubble ${isUser ? 'user-bubble' : 'bot-bubble'}`;
    bubble.innerHTML = `
      ${escapeHtml(text)}
      <span class="msg-time">${time}</span>
    `;
    chatBody.appendChild(bubble);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  async function triggerSimulation(text) {
    if (!text) return;
    appendMessage(text, true);

    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const data = await res.json();

      setTimeout(() => {
        appendMessage(data.response, false);
      }, 500);

    } catch (e) {
      appendMessage('Error conectando con el simulador.', false);
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = input.value.trim();
    if (val) {
      triggerSimulation(val);
      input.value = '';
    }
  });

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      triggerSimulation(chip.getAttribute('data-text'));
    });
  });
}

// ==================== 6. ENVÍO DIRECTO / PRUEBA INMEDIATA ====================
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

    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Enviando mensaje a WhatsApp...';
    resultBanner.className = 'result-banner hidden';

    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Fallo al enviar mensaje');
      }

      resultBanner.className = 'result-banner success';
      resultBanner.textContent = `✅ ¡Mensaje entregado exitosamente a +${phone}!`;
      showToast('Mensaje enviado por WhatsApp', 'success');

    } catch (err) {
      resultBanner.className = 'result-banner error';
      resultBanner.textContent = `❌ Error: ${err.message}`;
      showToast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        Enviar Mensaje Ahora por WhatsApp
      `;
    }
  });
}

// ==================== 7. PROSPECTOS & LEADS ====================
async function loadLeads() {
  const tbody = document.getElementById('leads-table-body');
  try {
    const res = await fetch('/api/leads');
    const leads = await res.json();

    if (!leads.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 32px; color: var(--text-dim);">
            No hay prospectos registrados aún. Cuando te escriban a WhatsApp aparecerán automáticamente aquí.
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = leads.map(l => {
      const dateStr = l.lastInteraction ? new Date(l.lastInteraction).toLocaleString('es-CO', {
        dateStyle: 'short',
        timeStyle: 'short'
      }) : 'Reciente';

      const tagClass = 'badge-tag-' + (l.tag || 'nuevo').toLowerCase().replace(/\s+/g, '');

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
          <td style="max-width: 260px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${escapeHtml(l.lastMessage || '-')}
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

  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: var(--accent-rose);">Error: ${e.message}</td></tr>`;
  }
}

function initLeads() {
  loadLeads();
}

// ==================== 8. CONFIGURACIÓN ====================
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

// ==================== 9. HERRAMIENTAS RÁPIDAS DEL MODAL ====================
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

// ==================== 10. UTILIDADES ====================
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
