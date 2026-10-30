// WhatsApp Sales Bot Studio - Client Application with Media Support

let currentRules = [];
let currentSchedules = [];
let currentSettings = {};
let currentLeads = [];

// Estado de archivos adjuntos temporales
let currentRuleAttachedMedia = null;
let currentQuickSendMedia = null;
let currentSchedMedia = null;

// Soporte Multi-Empresa & Autenticación
let currentCompanyId = localStorage.getItem('whatsapp_bot_company_id') || 'default';
let currentCompanies = [];
let currentAuthToken = localStorage.getItem('whatsapp_bot_token') || null;
let currentUser = null;
let currentPermissions = new Set();

const originalFetch = window.fetch;
window.fetch = function (url, options = {}) {
  options = options || {};
  options.headers = options.headers || {};

  // 1. Inyectar Token de Autenticación
  if (currentAuthToken) {
    if (options.headers instanceof Headers) {
      if (!options.headers.has('authorization')) {
        options.headers.set('authorization', `Bearer ${currentAuthToken}`);
      }
    } else {
      if (!options.headers['authorization'] && !options.headers['Authorization']) {
        options.headers['authorization'] = `Bearer ${currentAuthToken}`;
      }
    }
  }

  // 2. Inyectar Empresa Activa
  if (options.headers instanceof Headers) {
    if (!options.headers.has('x-company-id')) {
      options.headers.set('x-company-id', currentCompanyId);
    }
  } else {
    if (!options.headers['x-company-id']) {
      options.headers['x-company-id'] = currentCompanyId;
    }
  }

  // 3. Garantizar aislamiento estricto por URL en endpoints /api/
  if (typeof url === 'string' && url.startsWith('/api/') && !url.includes('companyId=')) {
    const sep = url.includes('?') ? '&' : '?';
    url = `${url}${sep}companyId=${encodeURIComponent(currentCompanyId)}`;
  }

  return originalFetch.call(this, url, options).then(res => {
    if (res.status === 401 && !url.includes('/api/auth/login') && !url.includes('/api/auth/register')) {
      showAuthModal(true);
    }
    return res;
  });
};

document.addEventListener('DOMContentLoaded', async () => {
  initAuthUI();
  initModalTools();

  const isAuth = await checkAuthStatus();
  if (isAuth) {
    showAuthModal(false);
    await startApp();
  } else {
    showAuthModal(true);
  }
});

let appInitialized = false;
async function startApp() {
  if (appInitialized) {
    await loadCompanies();
    return;
  }
  appInitialized = true;
  await loadCompanies();
  initCompanyManager();
  initTabs();
  initConnectionMonitor();
  initDropzones();
  initRules();
  initScheduler();
  initSimulator();
  initQuickSend();
  initLeads();
  initLibrary();
  initSettings();
  initTeamManagement();
}

// ==================== 0. GESTIÓN MULTI-EMPRESA ====================
async function loadCompanies() {
  try {
    const res = await fetch('/api/companies');
    if (!res.ok) throw new Error('Error al cargar empresas');
    const data = await res.json();
    currentCompanies = data.companies || [];

    // Priorizar sincronización con el servidor o localStorage
    const savedId = localStorage.getItem('whatsapp_bot_company_id');
    if (savedId && currentCompanies.some(c => c.id === savedId)) {
      currentCompanyId = savedId;
    } else if (data.activeCompanyId && currentCompanies.some(c => c.id === data.activeCompanyId)) {
      currentCompanyId = data.activeCompanyId;
      localStorage.setItem('whatsapp_bot_company_id', currentCompanyId);
    } else if (currentCompanies.length > 0) {
      currentCompanyId = currentCompanies[0].id;
      localStorage.setItem('whatsapp_bot_company_id', currentCompanyId);
    }

    const select = document.getElementById('company-select');
    if (!select) return;

    select.innerHTML = '';
    currentCompanies.forEach(comp => {
      const opt = document.createElement('option');
      opt.value = comp.id;
      const phoneText = comp.phone ? ` (+${comp.phone})` : (comp.status === 'ready' ? ' (Conectado)' : ' (Sin vincular)');
      opt.textContent = `${comp.name}${phoneText}`;
      if (comp.id === currentCompanyId) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    select.value = currentCompanyId;
  } catch (err) {
    console.error('Error en loadCompanies:', err);
  }
}

function initCompanyManager() {
  const select = document.getElementById('company-select');
  const btnAdd = document.getElementById('btn-add-company');
  const btnManage = document.getElementById('btn-manage-company');

  const modalAdd = document.getElementById('modal-add-company');
  const btnCloseAdd = document.getElementById('btn-close-add-company');
  const btnCancelAdd = document.getElementById('btn-cancel-add-company');
  const formAdd = document.getElementById('form-add-company');
  const inputNewName = document.getElementById('new-company-name');

  const modalManage = document.getElementById('modal-manage-company');
  const btnCloseManage = document.getElementById('btn-close-manage-company');
  const btnCancelManage = document.getElementById('btn-cancel-manage-company');
  const formManage = document.getElementById('form-manage-company');
  const inputManageName = document.getElementById('manage-company-name');
  const manageStatusBadge = document.getElementById('manage-company-status-badge');
  const managePhone = document.getElementById('manage-company-phone');
  const btnRestartBot = document.getElementById('btn-manage-restart-bot');
  const btnDeleteComp = document.getElementById('btn-delete-company');

  if (select) {
    select.addEventListener('change', async (e) => {
      const newId = e.target.value;
      if (!newId || newId === currentCompanyId) return;

      // Cerrar modal de QR inmediatamente para evitar mostrar datos o estados cruzados
      if (typeof window.closeQrModal === 'function') {
        window.closeQrModal();
      }

      currentCompanyId = newId;
      localStorage.setItem('whatsapp_bot_company_id', currentCompanyId);

      // Limpiar datos visuales de teléfono en el modal de QR
      const qrPhone = document.getElementById('qr-connected-phone');
      if (qrPhone) qrPhone.textContent = '...';

      try {
        await fetch(`/api/companies/${currentCompanyId}/select`, { method: 'POST' });
      } catch (e) { }

      const comp = currentCompanies.find(c => c.id === currentCompanyId);
      showToast(`Empresa activa: ${comp ? comp.name : currentCompanyId}`);

      if (typeof window.refreshBotStatus === 'function') window.refreshBotStatus();
      loadRules();
      loadSchedules();
      loadLeads();
      loadLibrary();
      loadSettings();
    });
  }

  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      if (inputNewName) inputNewName.value = '';
      if (modalAdd) modalAdd.classList.remove('hidden');
    });
  }

  const closeAddModal = () => {
    if (modalAdd) modalAdd.classList.add('hidden');
  };
  if (btnCloseAdd) btnCloseAdd.addEventListener('click', closeAddModal);
  if (btnCancelAdd) btnCancelAdd.addEventListener('click', closeAddModal);

  if (formAdd) {
    formAdd.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = (inputNewName.value || '').trim();
      if (!name) return;

      try {
        const res = await fetch('/api/companies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        if (!res.ok) throw new Error('Error creando empresa');
        const data = await res.json();

        currentCompanyId = data.activeCompanyId;
        localStorage.setItem('whatsapp_bot_company_id', currentCompanyId);

        closeAddModal();
        await loadCompanies();

        showToast(`Empresa "${name}" creada. Generando código QR...`);

        if (typeof window.refreshBotStatus === 'function') window.refreshBotStatus();
        loadRules();
        loadSchedules();
        loadLeads();
        loadLibrary();
        loadSettings();

        // Abrir inmediatamente el modal de QR para vincular el número de WhatsApp en modo escaneo
        if (typeof window.openQrModal === 'function') {
          setTimeout(() => {
            window.openQrModal(true);
          }, 400);
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    });
  }

  if (btnManage) {
    btnManage.addEventListener('click', () => {
      const comp = currentCompanies.find(c => c.id === currentCompanyId);
      if (!comp) return;

      const titleEl = document.getElementById('manage-company-title');
      if (titleEl) titleEl.textContent = `Gestionar: ${comp.name}`;
      if (inputManageName) inputManageName.value = comp.name;

      if (manageStatusBadge) {
        manageStatusBadge.className = `badge-status ${comp.status}`;
        manageStatusBadge.textContent = comp.status === 'ready' ? 'Conectado' : (comp.status === 'qr_ready' ? 'Escanear QR' : comp.status);
      }
      if (managePhone) {
        managePhone.textContent = comp.phone ? `+${comp.phone}` : 'No vinculado';
      }

      if (btnDeleteComp) {
        btnDeleteComp.disabled = currentCompanies.length <= 1;
        btnDeleteComp.title = currentCompanies.length <= 1 ? 'No puedes eliminar la única empresa' : 'Eliminar empresa';
      }

      const btnManageOpenQr = document.getElementById('btn-manage-open-qr');
      if (btnManageOpenQr) {
        btnManageOpenQr.onclick = () => {
          closeManageModal();
          if (typeof window.openQrModal === 'function') window.openQrModal();
        };
      }

      if (modalManage) modalManage.classList.remove('hidden');
    });
  }

  const closeManageModal = () => {
    if (modalManage) modalManage.classList.add('hidden');
  };
  if (btnCloseManage) btnCloseManage.addEventListener('click', closeManageModal);
  if (btnCancelManage) btnCancelManage.addEventListener('click', closeManageModal);

  if (formManage) {
    formManage.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newName = (inputManageName.value || '').trim();
      if (!newName) return;

      try {
        const res = await fetch(`/api/companies/${currentCompanyId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName })
        });
        if (!res.ok) throw new Error('Error al actualizar');
        closeManageModal();
        await loadCompanies();
        loadSettings();
        showToast('Empresa actualizada correctamente');
      } catch (err) {
        alert('Error: ' + err.message);
      }
    });
  }

  if (btnRestartBot) {
    btnRestartBot.addEventListener('click', async () => {
      try {
        btnRestartBot.disabled = true;
        btnRestartBot.textContent = 'Reiniciando...';
        await fetch('/api/bot/restart', { method: 'POST' });
        showToast('Reiniciando conexión WhatsApp de la empresa...');
        setTimeout(() => {
          btnRestartBot.disabled = false;
          btnRestartBot.textContent = '🔄 Reiniciar Bot de esta Empresa';
          if (typeof window.refreshBotStatus === 'function') window.refreshBotStatus();
        }, 1500);
      } catch (e) {
        btnRestartBot.disabled = false;
        btnRestartBot.textContent = '🔄 Reiniciar Bot de esta Empresa';
      }
    });
  }

  if (btnDeleteComp) {
    btnDeleteComp.addEventListener('click', async () => {
      const comp = currentCompanies.find(c => c.id === currentCompanyId);
      const compName = comp ? comp.name : 'esta empresa';
      if (!confirm(`¿Estás SEGURO de eliminar la empresa "${compName}"?\nSe borrarán todas sus rutas, biblioteca, prospectos y se cerrará su sesión de WhatsApp.`)) {
        return;
      }

      try {
        const res = await fetch(`/api/companies/${currentCompanyId}`, { method: 'DELETE' });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Error al eliminar');
        }
        const data = await res.json();
        currentCompanyId = data.activeCompanyId;
        localStorage.setItem('whatsapp_bot_company_id', currentCompanyId);

        closeManageModal();
        await loadCompanies();
        showToast(`Empresa "${compName}" eliminada`);

        if (typeof window.refreshBotStatus === 'function') window.refreshBotStatus();
        loadRules();
        loadSchedules();
        loadLeads();
        loadLibrary();
        loadSettings();
      } catch (err) {
        alert(err.message);
      }
    });
  }
}


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
      if (targetId === 'tab-library') loadLibrary();
      if (targetId === 'tab-settings') loadSettings();
    });
  });
}

// ==================== 2. MONITOREO DE CONEXIÓN Y MODAL QR ====================
function initConnectionMonitor() {
  const pill = document.getElementById('connection-pill');
  const pillText = document.getElementById('connection-text');
  const botToggle = document.getElementById('bot-toggle');
  const botLabel = document.getElementById('bot-toggle-label');
  const btnReconnect = document.getElementById('btn-reconnect');

  // Elementos del Modal QR y botón de cabecera
  const btnShowQr = document.getElementById('btn-show-qr-modal');
  const btnShowQrText = document.getElementById('btn-show-qr-text');
  const qrModal = document.getElementById('qr-modal-banner');
  const qrCompanyTitle = document.getElementById('qr-modal-company-title');
  const qrCompanySubtitle = document.getElementById('qr-modal-company-subtitle');
  const qrImage = document.getElementById('qr-image');
  const qrViewScanning = document.getElementById('qr-view-scanning');
  const qrViewConnected = document.getElementById('qr-view-connected');
  const qrViewLoading = document.getElementById('qr-view-loading');
  const qrConnectedPhone = document.getElementById('qr-connected-phone');
  const qrConnectedTitle = document.getElementById('qr-connected-title');
  const qrConnectedDesc = document.getElementById('qr-connected-desc');
  const qrConnectedAutoClose = document.getElementById('qr-connected-auto-close-notice');
  const btnCloseQrModal = document.getElementById('btn-close-qr-modal');
  const btnCloseQrBtn = document.getElementById('btn-close-qr-btn');
  const btnForceRegenerate = document.getElementById('btn-qr-force-regenerate');
  const btnDisconnectBot = document.getElementById('btn-disconnect-bot');

  let wasScanning = false;
  let autoCloseTimer = null;

  function openQrModal(isNewScan = false) {
    const comp = currentCompanies.find(c => c.id === currentCompanyId);
    if (qrCompanyTitle) {
      qrCompanyTitle.textContent = `Vincular WhatsApp: ${comp ? comp.name : 'Empresa Actual'}`;
    }
    if (qrCompanySubtitle) {
      qrCompanySubtitle.textContent = `Sesión exclusiva para "${comp ? comp.name : 'esta empresa'}"`;
    }

    // Limpiar estado visual anterior para no mostrar números de otras empresas
    if (qrConnectedPhone) qrConnectedPhone.textContent = '...';
    if (qrConnectedAutoClose) qrConnectedAutoClose.classList.add('hidden');
    if (qrViewConnected) qrViewConnected.classList.add('hidden');
    if (qrViewScanning) qrViewScanning.classList.add('hidden');
    if (qrViewLoading) qrViewLoading.classList.remove('hidden');

    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
    }

    wasScanning = isNewScan || false;

    if (qrModal) qrModal.classList.remove('hidden');
    checkStatus();
  }

  function closeQrModal() {
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
    }
    wasScanning = false;
    if (qrConnectedAutoClose) qrConnectedAutoClose.classList.add('hidden');
    if (qrModal) qrModal.classList.add('hidden');
  }

  window.openQrModal = openQrModal;
  window.closeQrModal = closeQrModal;

  if (btnShowQr) btnShowQr.addEventListener('click', () => openQrModal(false));
  if (btnCloseQrModal) btnCloseQrModal.addEventListener('click', closeQrModal);
  if (btnCloseQrBtn) btnCloseQrBtn.addEventListener('click', closeQrModal);

  // Cerrar al hacer clic en el fondo oscuro exterior o presionar tecla Escape
  if (qrModal) {
    qrModal.addEventListener('click', (e) => {
      if (e.target === qrModal) closeQrModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && qrModal && !qrModal.classList.contains('hidden')) {
      closeQrModal();
    }
  });

  if (btnForceRegenerate) {
    btnForceRegenerate.addEventListener('click', async () => {
      btnForceRegenerate.disabled = true;
      btnForceRegenerate.textContent = 'Generando nuevo QR...';
      wasScanning = true;
      try {
        await fetch(`/api/bot/restart?companyId=${encodeURIComponent(currentCompanyId)}`, { method: 'POST' });
        showToast('Reiniciando bot y generando nuevo código QR...', 'info');
        setTimeout(() => {
          btnForceRegenerate.disabled = false;
          btnForceRegenerate.textContent = '🔄 Regenerar Código QR';
          checkStatus();
        }, 2000);
      } catch (e) {
        btnForceRegenerate.disabled = false;
        btnForceRegenerate.textContent = '🔄 Regenerar Código QR';
      }
    });
  }

  if (btnDisconnectBot) {
    btnDisconnectBot.addEventListener('click', async () => {
      const comp = currentCompanies.find(c => c.id === currentCompanyId);
      const name = comp ? comp.name : 'esta empresa';
      if (!confirm(`¿Deseas desvincular el WhatsApp de "${name}" para conectar un número diferente?`)) return;

      btnDisconnectBot.disabled = true;
      btnDisconnectBot.textContent = 'Desvinculando...';
      wasScanning = true;
      try {
        await fetch(`/api/bot/disconnect?companyId=${encodeURIComponent(currentCompanyId)}`, { method: 'POST' });
        showToast(`Sesión de "${name}" cerrada. Generando nuevo código QR...`, 'info');
        setTimeout(() => {
          btnDisconnectBot.disabled = false;
          btnDisconnectBot.textContent = 'Desvincular y cambiar de número';
          checkStatus();
        }, 2000);
      } catch (e) {
        btnDisconnectBot.disabled = false;
        btnDisconnectBot.textContent = 'Desvincular y cambiar de número';
      }
    });
  }

  async function checkStatus() {
    const targetCompanyId = currentCompanyId;
    try {
      const res = await fetch(`/api/status?companyId=${encodeURIComponent(targetCompanyId)}&_t=${Date.now()}`);
      if (!res.ok) throw new Error('Error al consultar estado');
      const data = await res.json();

      // PROTECCIÓN CRÍTICA CONTRA CONDICIONES DE CARRERA Y DATOS DE OTRAS EMPRESAS:
      // Si la empresa activa en el cliente cambió mientras la petición estaba en vuelo, o si la respuesta pertenece a otra empresa, descartarla por completo.
      if (data.companyId && data.companyId !== currentCompanyId) {
        return;
      }

      const comp = currentCompanies.find(c => c.id === currentCompanyId);
      if (comp) {
        comp.status = data.status;
        if (data.clientInfo?.wid && data.clientInfo.wid !== 'Conectado') {
          comp.phone = data.clientInfo.wid;
        }
      }

      // Actualizar opción de la empresa en el select para reflejar su teléfono real
      const select = document.getElementById('company-select');
      if (select && comp) {
        const opt = select.querySelector(`option[value="${comp.id}"]`);
        if (opt) {
          const phoneText = comp.phone ? ` (+${comp.phone})` : (comp.status === 'ready' ? ' (Conectado)' : ' (Sin vincular)');
          opt.textContent = `${comp.name}${phoneText}`;
        }
      }

      pill.className = 'connection-pill';

      if (data.status === 'ready') {
        const phone = data.clientInfo?.wid && data.clientInfo.wid !== 'Conectado' ? ` (+${data.clientInfo.wid})` : '';
        pill.classList.add('status-ready');
        pillText.textContent = `Conectado${phone}`;

        if (btnShowQr) {
          btnShowQr.className = 'btn btn-qr-prominent is-connected';
          if (btnShowQrText) btnShowQrText.textContent = `✅ ${phone || 'Conectado'}`;
        }

        if (qrViewConnected) qrViewConnected.classList.remove('hidden');
        if (qrViewScanning) qrViewScanning.classList.add('hidden');
        if (qrViewLoading) qrViewLoading.classList.add('hidden');

        const phoneVal = (data.clientInfo?.wid && data.clientInfo.wid !== 'Conectado')
          ? `+${data.clientInfo.wid}`
          : (comp?.phone ? `+${comp.phone}` : 'Vinculado');
        if (qrConnectedPhone) qrConnectedPhone.textContent = phoneVal;

        if (qrConnectedTitle) qrConnectedTitle.textContent = '¡WhatsApp Vinculado con Éxito!';
        if (qrConnectedDesc) {
          qrConnectedDesc.textContent = `El bot de "${comp ? comp.name : data.companyName}" ya está conectado y listo para atender mensajes.`;
        }

        // AUTO-CIERRE: Si el modal estaba abierto esperando vinculación (escaneo en progreso)
        const isModalVisible = qrModal && !qrModal.classList.contains('hidden');
        if (isModalVisible && wasScanning) {
          wasScanning = false;
          if (qrConnectedAutoClose) {
            qrConnectedAutoClose.classList.remove('hidden');
            qrConnectedAutoClose.textContent = `✅ ¡WhatsApp de ${comp ? comp.name : 'la empresa'} vinculado con éxito! Cerrando ventana...`;
          }
          if (autoCloseTimer) clearTimeout(autoCloseTimer);
          autoCloseTimer = setTimeout(() => {
            closeQrModal();
            showToast(`¡WhatsApp de ${comp ? comp.name : 'la empresa'} conectado correctamente!`, 'success');
          }, 1800);
        }

      } else if (data.status === 'qr_ready') {
        wasScanning = true;
        if (autoCloseTimer) {
          clearTimeout(autoCloseTimer);
          autoCloseTimer = null;
        }

        pill.classList.add('status-qr');
        pillText.textContent = 'Escanear QR Requerido';

        if (btnShowQr) {
          btnShowQr.className = 'btn btn-qr-prominent needs-scan';
          if (btnShowQrText) btnShowQrText.textContent = '📱 Escanear Código QR';
        }

        if (qrViewConnected) qrViewConnected.classList.add('hidden');
        if (qrViewScanning) qrViewScanning.classList.remove('hidden');
        if (qrViewLoading) qrViewLoading.classList.add('hidden');

        if (data.qrCode && qrImage) {
          qrImage.src = data.qrCode;
        }

      } else if (data.status === 'authenticated') {
        wasScanning = true;
        pill.classList.add('status-loading');
        pillText.textContent = 'Autenticado, sincronizando...';

        if (btnShowQr) {
          btnShowQr.className = 'btn btn-qr-prominent is-connected';
          if (btnShowQrText) btnShowQrText.textContent = '⏳ Sincronizando...';
        }

        if (qrViewConnected) qrViewConnected.classList.add('hidden');
        if (qrViewScanning) qrViewScanning.classList.add('hidden');
        if (qrViewLoading) qrViewLoading.classList.remove('hidden');

      } else if (data.status === 'initializing') {
        pill.classList.add('status-loading');
        pillText.textContent = 'Iniciando WhatsApp Web...';

        if (btnShowQr) {
          btnShowQr.className = 'btn btn-qr-prominent';
          if (btnShowQrText) btnShowQrText.textContent = '⏳ Generando QR...';
        }

        if (qrViewConnected) qrViewConnected.classList.add('hidden');
        if (qrViewScanning) qrViewScanning.classList.add('hidden');
        if (qrViewLoading) qrViewLoading.classList.remove('hidden');

      } else {
        wasScanning = false;
        pill.classList.add('status-disconnected');
        pillText.textContent = 'Desconectado';

        if (btnShowQr) {
          btnShowQr.className = 'btn btn-qr-prominent needs-scan';
          if (btnShowQrText) btnShowQrText.textContent = '📱 Vincular WhatsApp';
        }

        if (qrViewConnected) qrViewConnected.classList.add('hidden');
        if (qrViewScanning) qrViewScanning.classList.add('hidden');
        if (qrViewLoading) qrViewLoading.classList.remove('hidden');
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
      if (btnShowQrText) btnShowQrText.textContent = '⚠️ Sin conexión';
    }
  }

  window.refreshBotStatus = checkStatus;
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

  function populateParentRuleSelect(excludeId = '') {
    const parentSelect = document.getElementById('rule-parent-id');
    if (!parentSelect) return;
    const opts = ['<option value="">Ninguna / Global (Se activa en cualquier momento)</option>'];
    currentRules.forEach(r => {
      if (r.id !== excludeId) {
        opts.push(`<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`);
      }
    });
    parentSelect.innerHTML = opts.join('');
  }

  btnOpenModal.addEventListener('click', () => {
    document.getElementById('modal-rule-title').textContent = 'Nueva Ruta de Venta';
    document.getElementById('modal-rule-id').value = '';
    modalForm.reset();
    populateParentRuleSelect('');
    document.getElementById('rule-parent-id').value = '';
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
    const parentRuleId = document.getElementById('rule-parent-id').value || null;
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
      parentRuleId,
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

      let parentRuleBadge = '';
      if (rule.parentRuleId) {
        const parent = currentRules.find(r => r.id === rule.parentRuleId);
        const parentName = parent ? parent.name : rule.parentRuleId;
        parentRuleBadge = `<span class="badge-tag" style="background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3);">↳ Submenú de: ${escapeHtml(parentName)}</span>`;
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
              ${parentRuleBadge}
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

        populateParentRuleSelect(rule.id);
        document.getElementById('rule-parent-id').value = rule.parentRuleId || '';

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
  const btnAudio = document.getElementById('btn-sim-send-audio');
  const btnUploadAudio = document.getElementById('btn-sim-upload-audio');
  const fileInputAudio = document.getElementById('sim-audio-file-input');
  const btnMic = document.getElementById('btn-sim-mic');

  function appendMessage({ text = '', isUser = false, media = null, userMediaIcon = null, isGemini = false, audioUrl = null }) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const bubble = document.createElement('div');
    bubble.className = `msg-bubble ${isUser ? 'user-bubble' : 'bot-bubble'}`;

    let mediaHtml = '';
    if (audioUrl) {
      mediaHtml = `
        <div class="sim-bubble-doc" style="margin-bottom: 6px;">
          <span class="sim-bubble-doc-icon">🎤</span>
          <div class="sim-bubble-doc-info" style="width: 100%;">
            <span class="sim-bubble-doc-name">Nota de voz</span>
            <audio controls src="${audioUrl}" style="width: 100%; height: 30px; margin-top: 4px;"></audio>
          </div>
        </div>
      `;
    } else if (media && media.url) {
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

    const geminiTag = isGemini ? '<div style="font-size: 10px; color: #3b82f6; font-weight: 700; margin-bottom: 3px; display: flex; align-items: center; gap: 4px;"><span>🤖</span> Gemini Flash Lite</div>' : '';

    bubble.innerHTML = `
      ${geminiTag}
      ${mediaHtml}
      ${text ? `<div>${formatWhatsAppToHtml(text)}</div>` : ''}
      <span class="msg-time">${time}</span>
    `;
    chatBody.appendChild(bubble);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  async function triggerSimulation({ text = '', hasMedia = false, mediaMimetype = '', userIcon = null, audio = null, audioUrl = null }) {
    appendMessage({ text, isUser: true, userMediaIcon: userIcon, audioUrl });

    // Indicador visual de espera
    const thinkingBubble = document.createElement('div');
    thinkingBubble.className = 'msg-bubble bot-bubble';
    thinkingBubble.style.opacity = '0.85';
    thinkingBubble.innerHTML = `<span style="font-size: 11.5px; color: var(--text-muted); display: inline-flex; align-items: center; gap: 6px;">
      <span class="spinner" style="width: 12px; height: 12px; border-width: 2px;"></span>
      ${audio ? '🎙️ Escuchando y procesando nota de voz con IA...' : 'Escribiendo respuesta...'}
    </span>`;
    chatBody.appendChild(thinkingBubble);
    chatBody.scrollTop = chatBody.scrollHeight;

    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, hasMedia, mediaMimetype, audio })
      });
      const data = await res.json();

      if (thinkingBubble.parentNode) thinkingBubble.remove();

      appendMessage({
        text: data.response,
        isUser: false,
        media: data.media,
        isGemini: Boolean(data.isGemini)
      });

    } catch (e) {
      if (thinkingBubble.parentNode) thinkingBubble.remove();
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

  if (btnAudio) {
    btnAudio.addEventListener('click', async () => {
      try {
        const audioUrl = '/uploads/received/1792266447609_recibido_1792266447609.oga';
        const res = await fetch(audioUrl);
        if (!res.ok) throw new Error('Audio de muestra no disponible');
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result || '').split('base64,')[1];
          triggerSimulation({
            text: '',
            hasMedia: true,
            mediaMimetype: 'audio/ogg',
            userIcon: '🎤',
            audio: {
              data: base64,
              mimetype: 'audio/ogg'
            },
            audioUrl: audioUrl
          });
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        showToast('No se pudo cargar el audio de prueba: ' + err.message, 'error');
      }
    });
  }

  const triggerAudioUpload = () => {
    if (fileInputAudio) fileInputAudio.click();
  };

  if (btnUploadAudio) btnUploadAudio.addEventListener('click', triggerAudioUpload);
  if (btnMic) btnMic.addEventListener('click', triggerAudioUpload);

  if (fileInputAudio) {
    fileInputAudio.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const fullDataUrl = reader.result;
        const cleanBase64 = fullDataUrl.includes('base64,') ? fullDataUrl.split('base64,')[1] : fullDataUrl;
        const mimeType = file.type || 'audio/ogg';

        triggerSimulation({
          text: '',
          hasMedia: true,
          mediaMimetype: mimeType,
          userIcon: '🎤',
          audio: {
            data: cleanBase64,
            mimetype: mimeType
          },
          audioUrl: URL.createObjectURL(file)
        });
      };
      reader.readAsDataURL(file);
      fileInputAudio.value = '';
    });
  }

  const btnResetChat = document.getElementById('btn-sim-reset-chat');
  if (btnResetChat) {
    btnResetChat.addEventListener('click', async () => {
      try {
        await fetch('/api/gemini/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: 'simulator-session' })
        });
        chatBody.innerHTML = `
          <div class="msg-bubble bot-bubble">
            🔄 Conversación reiniciada. ¡Hola! ¿En qué te puedo colaborar hoy?
            <span class="msg-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        `;
        showToast('Conversación de Gemini reiniciada', 'info');
      } catch (e) {
        showToast('Error al reiniciar', 'error');
      }
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
            <div style="display: flex; gap: 6px; align-items: center;">
              <button class="btn btn-outline-sm btn-view-chat" data-phone="${escapeHtml(l.phone)}" style="color: #38bdf8; border-color: rgba(56,189,248,0.3);">
                💬 Ver Chat
              </button>
              <button class="btn btn-outline-sm btn-toggle-lead" data-phone="${l.phone}">
                ${l.humanPaused ? 'Reactivar' : 'Pausar'}
              </button>
            </div>
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

    // Abrir historial de chat
    tbody.querySelectorAll('.btn-view-chat').forEach(btn => {
      btn.addEventListener('click', () => {
        const phone = btn.getAttribute('data-phone');
        const lead = currentLeads.find(l => l.phone === phone);
        if (lead) openLeadChatModal(lead);
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

let activeChatPhone = null;
let activeChatSSE = null;
let activeChatPoll = null;

async function openLeadChatModal(lead) {
  const modal = document.getElementById('lead-chat-modal');
  if (!modal) return;
  activeChatPhone = lead.phone;

  // Limpiar conexiones previas
  if (activeChatSSE) {
    try { activeChatSSE.close(); } catch (e) { }
    activeChatSSE = null;
  }
  if (activeChatPoll) {
    clearInterval(activeChatPoll);
    activeChatPoll = null;
  }

  const title = document.getElementById('lead-chat-title');
  const subtitle = document.getElementById('lead-chat-subtitle');
  const container = document.getElementById('lead-chat-messages-container');
  const badgesBox = document.getElementById('lead-chat-status-badges');
  const btnTogglePause = document.getElementById('btn-lead-chat-toggle-pause');
  const btnRefresh = document.getElementById('btn-lead-chat-refresh');
  const formReply = document.getElementById('lead-chat-reply-form');
  const inputReply = document.getElementById('lead-chat-reply-input');

  title.textContent = `💬 Conversación con ${lead.name || 'Cliente'}`;
  subtitle.textContent = `+${lead.phone} • Etiqueta: ${lead.tag || 'Nuevo'}`;

  const renderBadges = (paused, isLive) => {
    badgesBox.innerHTML = `
      <span style="font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 9999px; ${paused ? 'background: rgba(244,63,94,0.15); color: #fb7185;' : 'background: rgba(34,197,94,0.15); color: #4ade80;'}">
        ${paused ? '🛑 Bot Pausado' : '🤖 Bot Activo'}
      </span>
      <span style="font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 9999px; ${isLive ? 'background: rgba(56,189,248,0.15); color: #38bdf8;' : 'background: rgba(148,163,184,0.15); color: #cbd5e1;'}">
        ${isLive ? '🟢 Tiempo Real Activo' : '📦 Historial Local'}
      </span>
    `;
    btnTogglePause.textContent = paused ? 'Reactivar Bot' : 'Pausar Bot';
  };

  renderBadges(lead.humanPaused, false);

  btnTogglePause.onclick = async () => {
    try {
      const res = await fetch(`/api/leads/${lead.phone}/toggle-pause`, { method: 'POST' });
      const data = await res.json();
      lead.humanPaused = data.humanPaused;
      renderBadges(lead.humanPaused, true);
      showToast(data.humanPaused ? 'Bot pausado para este cliente' : 'Bot reactivado para este cliente', 'info');
      loadLeads();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const loadMessages = async () => {
    container.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 40px;">Cargando mensajes...</div>`;
    try {
      const res = await fetch(`/api/leads/${lead.phone}/messages`);
      const data = await res.json();
      const messages = data.messages || [];

      renderBadges(data.humanPaused, data.liveFetched);

      if (messages.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 40px;">No hay mensajes registrados con este cliente.</div>`;
        return;
      }

      container.innerHTML = messages.map(m => {
        const timeStr = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '';
        const isAudio = m.type === 'ptt' || m.type === 'audio';
        const isImg = (m.mediaUrl && !isAudio);

        return `
          <div style="display: flex; justify-content: ${m.fromMe ? 'flex-end' : 'flex-start'};">
            <div style="max-width: 75%; padding: 8px 12px; border-radius: 8px; background: ${m.fromMe ? '#005c4b' : '#202c33'}; color: #e9edef; font-size: 13.5px; box-shadow: 0 1px 2px rgba(0,0,0,0.3); word-break: break-word;">
              ${isImg ? `<img src="${m.mediaUrl}" style="max-width: 220px; border-radius: 6px; display: block; margin-bottom: 6px;">` : ''}
              ${isAudio && m.mediaUrl ? `<audio controls src="${m.mediaUrl}" style="width: 220px; height: 32px; display: block; margin-bottom: 6px;"></audio>` : ''}
              ${m.body ? `<div>${escapeHtml(m.body)}</div>` : ''}
              <div style="text-align: right; font-size: 10px; color: #8696a0; margin-top: 4px;">
                ${timeStr} ${m.fromMe ? '<span style="color: #53bdeb;">✓✓</span>' : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');

      container.scrollTop = container.scrollHeight;
    } catch (e) {
      container.innerHTML = `<div style="text-align: center; color: var(--accent-rose); padding: 40px;">Error cargando mensajes: ${e.message}</div>`;
    }
  };

  btnRefresh.onclick = () => loadMessages();

  // Iniciar conexión SSE en tiempo real
  const sseUrl = `/api/leads/${encodeURIComponent(lead.phone)}/stream?companyId=${encodeURIComponent(currentCompanyId)}`;
  try {
    activeChatSSE = new EventSource(sseUrl);
    activeChatSSE.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'connected') return;

        const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '';
        const isAudio = msg.type === 'ptt' || msg.type === 'audio';
        const isImg = (msg.mediaUrl && !isAudio);

        const newMsgHtml = `
          <div style="display: flex; justify-content: ${msg.fromMe ? 'flex-end' : 'flex-start'};">
            <div style="max-width: 75%; padding: 8px 12px; border-radius: 8px; background: ${msg.fromMe ? '#005c4b' : '#202c33'}; color: #e9edef; font-size: 13.5px; box-shadow: 0 1px 2px rgba(0,0,0,0.3); word-break: break-word;">
              ${isImg ? `<img src="${msg.mediaUrl}" style="max-width: 220px; border-radius: 6px; display: block; margin-bottom: 6px;">` : ''}
              ${isAudio && msg.mediaUrl ? `<audio controls src="${msg.mediaUrl}" style="width: 220px; height: 32px; display: block; margin-bottom: 6px;"></audio>` : ''}
              ${msg.body ? `<div>${escapeHtml(msg.body)}</div>` : ''}
              <div style="text-align: right; font-size: 10px; color: #8696a0; margin-top: 4px;">
                ${timeStr} ${msg.fromMe ? '<span style="color: #53bdeb;">✓✓</span>' : ''}
              </div>
            </div>
          </div>
        `;

        if (container.querySelector('.chat-empty-state') || container.textContent.includes('No hay mensajes')) {
          container.innerHTML = '';
        }
        container.insertAdjacentHTML('beforeend', newMsgHtml);
        container.scrollTop = container.scrollHeight;
        loadLeads();
      } catch (err) { }
    };
  } catch (err) { }

  activeChatPoll = setInterval(() => {
    if (!modal.classList.contains('hidden') && activeChatPhone === lead.phone) {
      // Polling de respaldo
    } else {
      if (activeChatSSE) { activeChatSSE.close(); activeChatSSE = null; }
      if (activeChatPoll) { clearInterval(activeChatPoll); activeChatPoll = null; }
    }
  }, 3500);

  formReply.onsubmit = async (e) => {
    e.preventDefault();
    const text = inputReply.value.trim();
    if (!text) return;
    inputReply.value = '';

    try {
      const res = await fetch(`/api/leads/${lead.phone}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast('Mensaje entregado', 'success');
      loadLeads();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  modal.classList.remove('hidden');
  loadMessages();
}

function initLeads() {
  const modal = document.getElementById('lead-files-modal');
  const btnClose = document.getElementById('btn-close-lead-files');
  const btnCloseBtn = document.getElementById('btn-close-lead-modal-btn');

  const close = () => modal.classList.add('hidden');
  btnClose?.addEventListener('click', close);
  btnCloseBtn?.addEventListener('click', close);

  const chatModal = document.getElementById('lead-chat-modal');
  document.getElementById('btn-close-lead-chat')?.addEventListener('click', () => {
    chatModal?.classList.add('hidden');
    if (activeChatSSE) { activeChatSSE.close(); activeChatSSE = null; }
    if (activeChatPoll) { clearInterval(activeChatPoll); activeChatPoll = null; }
  });

  loadLeads();
}

// ==================== 9. CONFIGURACIÓN ====================
function initSettings() {
  const form = document.getElementById('settings-form');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const businessName = document.getElementById('set-biz-name').value.trim();
    const geminiSelect = document.getElementById('set-gemini-enabled');
    const geminiEnabled = geminiSelect ? geminiSelect.value === 'true' : true;
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
          geminiEnabled,
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

    const geminiSelect = document.getElementById('set-gemini-enabled');
    if (geminiSelect) {
      geminiSelect.value = String(currentSettings.geminiEnabled ?? true);
    }

    document.getElementById('set-simulate-typing').value = String(currentSettings.simulateTyping ?? true);
    document.getElementById('set-delay-seconds').value = currentSettings.typingDelaySeconds || 2;
    document.getElementById('set-ignore-groups').value = String(currentSettings.ignoreGroups ?? true);
    document.getElementById('set-fallback').value = currentSettings.fallbackMessage || '';

    const simName = document.getElementById('sim-business-name');
    if (simName) simName.textContent = currentSettings.businessName || 'Mi Tienda Virtual';

    // Consultar estado de Gemini
    try {
      const geminiStatusRes = await fetch('/api/gemini/status');
      const geminiStatusData = await geminiStatusRes.json();
      const statusTag = document.getElementById('gemini-status-tag');
      if (statusTag) {
        if (geminiStatusData.configured) {
          statusTag.textContent = 'Conectado';
          statusTag.style.background = '#10b981';
        } else {
          statusTag.textContent = 'Sin clave';
          statusTag.style.background = '#ef4444';
        }
      }
    } catch (e) { }

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

function formatWhatsAppToHtml(str) {
  if (!str) return '';
  let safe = escapeHtml(str);
  // Negrita WhatsApp (*texto* o **texto**)
  safe = safe.replace(/\*\*([^*\n\r]+)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/\*([^*\n\r]+)\*/g, '<strong>$1</strong>');
  // Cursiva WhatsApp (_texto_)
  safe = safe.replace(/_([^_\n\r]+)_/g, '<em>$1</em>');
  // Tachado WhatsApp (~texto~)
  safe = safe.replace(/~([^~\n\r]+)~/g, '<del>$1</del>');
  return safe;
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ==================== 12. BIBLIOTECA DE CONOCIMIENTO (WORD A MARKDOWN) ====================
let currentLibraryFile = null;

function initLibrary() {
  const form = document.getElementById('library-upload-form');
  const dropzone = document.getElementById('library-dropzone');
  const fileInput = document.getElementById('library-file-input');
  const preview = document.getElementById('library-selected-preview');
  const titleInput = document.getElementById('lib-doc-title');
  const spinner = document.getElementById('lib-upload-spinner');
  const btnSubmit = document.getElementById('btn-submit-library');
  const btnRefresh = document.getElementById('btn-refresh-library');

  // Modal elements
  const modal = document.getElementById('library-view-modal');
  const btnCloseModal = document.getElementById('btn-close-lib-modal');
  const btnCloseModalBtn = document.getElementById('btn-close-lib-modal-btn');
  const btnSaveEdits = document.getElementById('btn-lib-save-edits');
  const modalDocId = document.getElementById('lib-modal-doc-id');
  const modalContent = document.getElementById('lib-modal-content');

  const closeLibModal = () => modal.classList.add('hidden');
  if (btnCloseModal) btnCloseModal.addEventListener('click', closeLibModal);
  if (btnCloseModalBtn) btnCloseModalBtn.addEventListener('click', closeLibModal);

  // Guardar modificaciones del modal
  if (btnSaveEdits) {
    btnSaveEdits.addEventListener('click', async () => {
      const docId = modalDocId.value;
      const content = modalContent.value;
      if (!docId) return;

      btnSaveEdits.disabled = true;
      btnSaveEdits.textContent = 'Guardando...';
      try {
        const res = await fetch(`/api/library/${docId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        });
        if (!res.ok) throw new Error('Error al guardar modificaciones');
        showToast('Documento Markdown actualizado correctamente', 'success');
        closeLibModal();
        loadLibrary();
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        btnSaveEdits.disabled = false;
        btnSaveEdits.textContent = '💾 Guardar Modificaciones';
      }
    });
  }

  // Dropzone drag & drop
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    ['dragleave', 'dragend'].forEach(type => {
      dropzone.addEventListener(type, () => dropzone.classList.remove('dragover'));
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleSelectedLibraryFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        handleSelectedLibraryFile(fileInput.files[0]);
      }
    });
  }

  function handleSelectedLibraryFile(file) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!['.docx', '.txt', '.md'].includes(ext)) {
      showToast('Formato no compatible. Por favor sube archivos Word (.docx), Markdown (.md) o Texto (.txt)', 'error');
      return;
    }
    currentLibraryFile = file;
    if (!titleInput.value.trim()) {
      titleInput.value = file.name.replace(/\.[^/.]+$/, "");
    }

    preview.classList.remove('hidden');
    preview.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 8px 12px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 6px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px;">📄</span>
          <div>
            <div style="font-size: 13px; font-weight: 600; color: #fff;">${escapeHtml(file.name)}</div>
            <div style="font-size: 11px; color: var(--text-muted);">${formatBytes(file.size)}</div>
          </div>
        </div>
        <button type="button" id="btn-remove-lib-file" class="btn-close" style="font-size: 18px;" title="Quitar archivo">&times;</button>
      </div>
    `;

    document.getElementById('btn-remove-lib-file').onclick = (e) => {
      e.stopPropagation();
      currentLibraryFile = null;
      fileInput.value = '';
      preview.classList.add('hidden');
      preview.innerHTML = '';
    };
  }

  // Enviar formulario
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentLibraryFile) {
        showToast('Por favor selecciona o arrastra un archivo Word (.docx)', 'error');
        return;
      }

      const customTitle = titleInput.value.trim();

      btnSubmit.disabled = true;
      spinner.classList.remove('hidden');

      try {
        const base64Data = await readFileAsBase64(currentLibraryFile);
        const res = await fetch('/api/library/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: currentLibraryFile.name,
            data: base64Data,
            name: customTitle
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al procesar el documento');

        showToast(`Documento convertido a Markdown: ${data.document.wordCount} palabras añadidas a la memoria`, 'success');

        // Limpiar formulario
        form.reset();
        currentLibraryFile = null;
        fileInput.value = '';
        preview.classList.add('hidden');
        preview.innerHTML = '';

        loadLibrary();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btnSubmit.disabled = false;
        spinner.classList.add('hidden');
      }
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      loadLibrary();
      showToast('Lista de biblioteca actualizada', 'info');
    });
  }

  loadLibrary();
}

async function loadLibrary() {
  const container = document.getElementById('library-list-container');
  const badge = document.getElementById('tab-library-badge');
  const totalDocsEl = document.getElementById('lib-total-docs');
  const totalWordsEl = document.getElementById('lib-total-words');

  if (!container) return;

  try {
    const res = await fetch('/api/library');
    const data = await res.json();
    const docs = data.documents || [];
    const stats = data.stats || { activeDocuments: 0, totalWords: 0 };

    if (badge) badge.textContent = stats.activeDocuments;
    if (totalDocsEl) totalDocsEl.textContent = stats.activeDocuments;
    if (totalWordsEl) totalWordsEl.textContent = Number(stats.totalWords).toLocaleString('es-CO');

    if (!docs.length) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--text-muted); border: 2px dashed var(--border-subtle); border-radius: 8px;">
          <div style="font-size: 38px; margin-bottom: 8px;">📚</div>
          <div style="font-weight: 600; color: #fff; font-size: 14px;">La biblioteca está vacía</div>
          <p style="font-size: 12px; margin-top: 4px;">Sube tus documentos Word (.docx) a la izquierda para que Gemini aprenda las respuestas de tu negocio sin dar información falsa.</p>
          <div style="margin-top: 12px; font-size: 11.5px; color: #fca5a5; background: rgba(244, 63, 94, 0.12); border: 1px solid rgba(244, 63, 94, 0.3); border-radius: 6px; padding: 6px 14px; display: inline-block;">
            🛡️ <strong>Gemini inactivo para esta empresa:</strong> Se desactivó automáticamente para evitar invención de productos o servicios no autorizados.
          </div>
        </div>
      `;
      return;
    }

    const allPausedBanner = stats.activeDocuments === 0 ? `
      <div style="margin-bottom: 12px; font-size: 12px; color: #fbbf24; background: rgba(251, 191, 36, 0.12); border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 6px; padding: 10px 14px; display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">⚠️</span>
        <span><strong>Todos los documentos están pausados:</strong> Gemini no responderá mensajes para esta empresa hasta que actives al menos un documento.</span>
      </div>
    ` : '';

    container.innerHTML = allPausedBanner + docs.map(doc => {
      const dateStr = doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
      const isWord = (doc.originalFilename || '').endsWith('.docx');
      const isActive = doc.active !== false;

      return `
        <div class="library-card ${isActive ? '' : 'disabled'}" data-id="${doc.id}" style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 22px;">${isWord ? '📘' : '📑'}</span>
              <div>
                <strong style="font-size: 14px; color: #fff;">${escapeHtml(doc.name || doc.originalFilename)}</strong>
                <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(doc.originalFilename)}</div>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 8px;">
              <label class="switch switch-sm" title="Activar/Desactivar para Gemini">
                <input type="checkbox" class="lib-toggle-switch" data-id="${doc.id}" ${isActive ? 'checked' : ''}>
                <span class="slider round"></span>
              </label>
              <span style="font-size: 11px; color: ${isActive ? 'var(--wa-teal)' : 'var(--text-muted)'}; font-weight: 600;">
                ${isActive ? 'Activo en IA' : 'Pausado'}
              </span>
            </div>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 10px; font-size: 11.5px; color: var(--text-dim); margin-top: 4px;">
            <span style="background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 4px;">📊 <strong>${doc.wordCount || 0}</strong> palabras</span>
            <span style="background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 4px;">🔤 <strong>${doc.charCount || 0}</strong> caracteres</span>
            <span style="background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 4px;">💾 ${formatBytes(doc.size || 0)}</span>
            <span style="background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 4px;">📅 ${dateStr}</span>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.05);">
            <button class="btn btn-outline-sm btn-view-markdown" data-id="${doc.id}">
              👁️ Ver / Editar Markdown Limpio
            </button>
            <button class="icon-btn delete-btn btn-delete-doc" data-id="${doc.id}" title="Eliminar de la biblioteca">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Toggle active event
    container.querySelectorAll('.lib-toggle-switch').forEach(sw => {
      sw.addEventListener('change', async () => {
        const id = sw.getAttribute('data-id');
        try {
          const r = await fetch(`/api/library/${id}/toggle`, { method: 'POST' });
          const res = await r.json();
          showToast(res.active ? 'Documento activado para Gemini' : 'Documento pausado', 'info');
          loadLibrary();
        } catch (e) {
          showToast('Error al cambiar estado', 'error');
        }
      });
    });

    // Delete doc event
    container.querySelectorAll('.btn-delete-doc').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('¿Deseas eliminar este documento de la biblioteca? Gemini ya no tendrá acceso a esta información.')) return;
        try {
          await fetch(`/api/library/${id}`, { method: 'DELETE' });
          showToast('Documento eliminado de la memoria', 'info');
          loadLibrary();
        } catch (e) {
          showToast('Error al eliminar documento', 'error');
        }
      });
    });

    // View / Edit markdown modal event
    container.querySelectorAll('.btn-view-markdown').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          const res = await fetch(`/api/library/${id}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);

          document.getElementById('lib-modal-doc-id').value = data.document.id;
          document.getElementById('lib-modal-title').textContent = data.document.name || data.document.originalFilename;
          document.getElementById('lib-modal-subtitle').textContent = `Archivo original: ${data.document.originalFilename} (${data.document.wordCount} palabras convertidas a texto plano)`;
          document.getElementById('lib-modal-content').value = data.content || '';

          document.getElementById('library-view-modal').classList.remove('hidden');
        } catch (e) {
          showToast('Error al cargar documento: ' + e.message, 'error');
        }
      });
    });

  } catch (err) {
    container.innerHTML = `<div style="color: var(--accent-rose);">Error cargando biblioteca: ${err.message}</div>`;
  }
}

// =========================================================================
// GESTIÓN DE AUTENTICACIÓN, SESIÓN Y ROLES
// =========================================================================

function showAuthModal(show = true) {
  const modal = document.getElementById('auth-modal-overlay');
  if (!modal) return;
  if (show) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    setTimeout(() => {
      document.getElementById('login-identifier')?.focus();
    }, 50);
  } else {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

function initAuthUI() {
  const formLogin = document.getElementById('form-auth-login');
  const loginErr = document.getElementById('login-error-alert');
  const btnTogglePwd = document.getElementById('btn-toggle-login-pwd');
  const loginPwdInput = document.getElementById('login-password');

  // Alternar visibilidad de contraseña
  btnTogglePwd?.addEventListener('click', (e) => {
    e.preventDefault();
    if (loginPwdInput.type === 'password') {
      loginPwdInput.type = 'text';
      btnTogglePwd.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
      `;
      btnTogglePwd.title = "Ocultar contraseña";
    } else {
      loginPwdInput.type = 'password';
      btnTogglePwd.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      `;
      btnTogglePwd.title = "Mostrar contraseña";
    }
  });

  // Enviar formulario de inicio de sesión
  formLogin?.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErr.classList.add('hidden');
    loginErr.textContent = '';

    const email = document.getElementById('login-identifier').value.trim();
    const password = loginPwdInput.value;
    const btnSubmit = document.getElementById('btn-submit-login');

    if (!email || !password) {
      loginErr.textContent = 'Por favor ingresa tu usuario y contraseña.';
      loginErr.classList.remove('hidden');
      return;
    }

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `
      <span class="auth-spinner"></span>
      <span>Iniciando sesión...</span>
    `;

    try {
      const res = await originalFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Credenciales inválidas. Verifica tu usuario y contraseña.');

      // Guardar token y usuario
      currentAuthToken = data.token;
      localStorage.setItem('whatsapp_bot_token', currentAuthToken);
      currentUser = data.user;

      // Ocultar modal de autenticación inmediatamente
      showAuthModal(false);
      showToast(`¡Bienvenido al panel, ${currentUser.fullName}!`, 'success');

      // Cargar contexto y arrancar la aplicación
      await checkAuthStatus();
      await startApp();

    } catch (err) {
      loginErr.textContent = err.message;
      loginErr.classList.remove('hidden');
      showAuthModal(true);
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = `
        <span>Ingresar al Panel</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline>
        </svg>
      `;
    }
  });

  // Logout button
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    if (confirm('¿Deseas cerrar tu sesión?')) {
      localStorage.removeItem('whatsapp_bot_token');
      currentAuthToken = null;
      currentUser = null;
      currentPermissions.clear();
      document.getElementById('user-header-profile')?.classList.add('hidden');
      showAuthModal(true);
      showToast('Sesión cerrada correctamente', 'info');
    }
  });

  // Change password modal
  const btnHeaderChangePwd = document.getElementById('btn-header-change-pwd');
  const changePwdModal = document.getElementById('change-pwd-modal');
  const formChangePwd = document.getElementById('form-change-password');
  const pwdErr = document.getElementById('pwd-error-alert');
  const pwdSuccess = document.getElementById('pwd-success-alert');

  btnHeaderChangePwd?.addEventListener('click', () => {
    pwdErr.classList.add('hidden');
    pwdSuccess.classList.add('hidden');
    formChangePwd.reset();
    changePwdModal.classList.remove('hidden');
  });

  document.getElementById('btn-close-pwd-modal')?.addEventListener('click', () => changePwdModal.classList.add('hidden'));
  document.getElementById('btn-cancel-pwd-modal')?.addEventListener('click', () => changePwdModal.classList.add('hidden'));

  formChangePwd?.addEventListener('submit', async (e) => {
    e.preventDefault();
    pwdErr.classList.add('hidden');
    pwdSuccess.classList.add('hidden');

    const currentPassword = document.getElementById('pwd-current').value;
    const newPassword = document.getElementById('pwd-new').value;
    const confirmPassword = document.getElementById('pwd-confirm').value;

    if (newPassword !== confirmPassword) {
      pwdErr.textContent = 'La nueva contraseña y su confirmación no coinciden.';
      pwdErr.classList.remove('hidden');
      return;
    }

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      pwdSuccess.textContent = 'Contraseña actualizada exitosamente.';
      pwdSuccess.classList.remove('hidden');
      setTimeout(() => {
        changePwdModal.classList.add('hidden');
        showToast('Contraseña actualizada correctamente', 'success');
      }, 1200);
    } catch (err) {
      pwdErr.textContent = err.message;
      pwdErr.classList.remove('hidden');
    }
  });
}

/**
 * Verificar estado de sesión y permisos del usuario actual
 */
async function checkAuthStatus() {
  if (!currentAuthToken) {
    showAuthModal(true);
    return false;
  }

  try {
    const res = await fetch(`/api/auth/me?companyId=${encodeURIComponent(currentCompanyId)}`);
    if (!res.ok) {
      throw new Error('Token inválido o expirado');
    }
    const data = await res.json();
    currentUser = data.user;

    // Sincronizar permisos del usuario en la empresa activa
    currentPermissions = new Set(data.membership?.permissions || []);

    updateUserBadge(data);
    applyRolePermissions();
    showAuthModal(false);
    return true;
  } catch (e) {
    localStorage.removeItem('whatsapp_bot_token');
    currentAuthToken = null;
    currentUser = null;
    showAuthModal(true);
    return false;
  }
}

/**
 * Actualizar etiqueta visual de usuario en el header
 */
function updateUserBadge(data) {
  const profileContainer = document.getElementById('user-header-profile');
  const avatarLetter = document.getElementById('user-avatar-letter');
  const nameDisplay = document.getElementById('user-display-name');
  const roleDisplay = document.getElementById('user-display-role');

  if (!profileContainer || !currentUser) return;

  profileContainer.classList.remove('hidden');
  const initial = (currentUser.fullName || 'U').charAt(0).toUpperCase();
  avatarLetter.textContent = initial;
  nameDisplay.textContent = currentUser.fullName || currentUser.email;

  const roleName = data.membership?.roleName || 'Colaborador';
  roleDisplay.textContent = roleName;
}

/**
 * Aplicar restricciones visuales y de control de acceso según los permisos del usuario
 */
function applyRolePermissions() {
  const isAdmin = currentPermissions.has('*') || currentPermissions.has('all');

  function hasPerm(perm) {
    return isAdmin || currentPermissions.has(perm);
  }

  // Rutas
  const btnCreateRule = document.getElementById('btn-open-create-rule');
  if (btnCreateRule) {
    btnCreateRule.style.display = hasPerm('rules:create') ? '' : 'none';
  }

  // QR y Conexión WhatsApp
  const btnQr = document.getElementById('btn-show-qr-modal');
  const btnReconnect = document.getElementById('btn-reconnect');
  if (btnQr) btnQr.style.display = hasPerm('whatsapp:connect') ? '' : 'none';
  if (btnReconnect) btnReconnect.style.display = hasPerm('whatsapp:connect') ? '' : 'none';

  // Toggle Bot
  const botToggleWrap = document.querySelector('.bot-toggle-wrapper');
  if (botToggleWrap) {
    botToggleWrap.style.display = hasPerm('whatsapp:toggle') ? '' : 'none';
  }

  // Pestaña de Equipo y Roles
  const tabBtnTeam = document.getElementById('tab-btn-team');
  if (tabBtnTeam) {
    tabBtnTeam.style.display = hasPerm('team:view') ? '' : 'none';
  }

  // Pestaña de Configuración
  const tabBtnSettings = document.getElementById('tab-btn-settings');
  if (tabBtnSettings) {
    tabBtnSettings.style.display = hasPerm('settings:view') ? '' : 'none';
  }

  // Acciones dentro de Equipo
  const btnAddMember = document.getElementById('btn-open-add-member');
  const btnCreateRole = document.getElementById('btn-open-create-role');
  if (btnAddMember) btnAddMember.style.display = hasPerm('team:manage') ? '' : 'none';
  if (btnCreateRole) btnCreateRole.style.display = hasPerm('roles:manage') ? '' : 'none';
}

// =========================================================================
// MÓDULO DE GESTIÓN DE EQUIPO & ROLES
// =========================================================================

let currentTeamMembers = [];
let currentCompanyRoles = [];

function initTeamManagement() {
  const tabBtnTeam = document.getElementById('tab-btn-team');
  tabBtnTeam?.addEventListener('click', () => {
    loadTeamData();
  });

  // Modal Invitar Miembro
  const memberModal = document.getElementById('member-modal');
  const btnOpenAddMember = document.getElementById('btn-open-add-member');
  const btnCloseMemberModal = document.getElementById('btn-close-member-modal');
  const btnCancelMemberModal = document.getElementById('btn-cancel-member-modal');
  const formMember = document.getElementById('member-modal-form');
  const btnGenPwd = document.getElementById('btn-generate-password');
  const btnCopyPwd = document.getElementById('btn-copy-password');
  const tempPwdInput = document.getElementById('member-temp-password');

  btnOpenAddMember?.addEventListener('click', () => {
    formMember.reset();
    // Generar contraseña segura por defecto
    tempPwdInput.value = generateSecurePassword();
    populateRolesSelect('member-role-select');
    memberModal.classList.remove('hidden');
  });

  btnCloseMemberModal?.addEventListener('click', () => memberModal.classList.add('hidden'));
  btnCancelMemberModal?.addEventListener('click', () => memberModal.classList.add('hidden'));

  btnGenPwd?.addEventListener('click', () => {
    tempPwdInput.value = generateSecurePassword();
  });

  btnCopyPwd?.addEventListener('click', () => {
    if (tempPwdInput.value) {
      navigator.clipboard.writeText(tempPwdInput.value);
      showToast('Contraseña copiada al portapapeles', 'info');
    }
  });

  formMember?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('member-fullname').value.trim();
    const email = document.getElementById('member-email').value.trim();
    const phone = document.getElementById('member-phone').value.trim();
    const roleId = document.getElementById('member-role-select').value;
    const password = tempPwdInput.value;

    try {
      const res = await fetch(`/api/companies/${currentCompanyId}/team/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, phone, roleId, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast(`Colaborador ${fullName} agregado exitosamente`, 'success');
      memberModal.classList.add('hidden');
      loadTeamData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Modal Editar Rol
  const editRoleModal = document.getElementById('edit-member-role-modal');
  document.getElementById('btn-close-edit-role-modal')?.addEventListener('click', () => editRoleModal.classList.add('hidden'));
  document.getElementById('btn-cancel-edit-role')?.addEventListener('click', () => editRoleModal.classList.add('hidden'));

  document.getElementById('edit-member-role-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const targetUserId = document.getElementById('edit-member-target-id').value;
    const newRoleId = document.getElementById('edit-member-role-select').value;

    try {
      const res = await fetch(`/api/companies/${currentCompanyId}/team/members/${targetUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId: newRoleId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast('Rol de colaborador actualizado', 'success');
      editRoleModal.classList.add('hidden');
      loadTeamData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Modal Crear Rol Personalizado
  const customRoleModal = document.getElementById('custom-role-modal');
  const btnOpenCustomRole = document.getElementById('btn-open-create-role');
  btnOpenCustomRole?.addEventListener('click', () => {
    document.getElementById('custom-role-form').reset();
    customRoleModal.classList.remove('hidden');
  });

  document.getElementById('btn-close-custom-role-modal')?.addEventListener('click', () => customRoleModal.classList.add('hidden'));
  document.getElementById('btn-cancel-custom-role')?.addEventListener('click', () => customRoleModal.classList.add('hidden'));

  document.getElementById('custom-role-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('custom-role-name').value.trim();
    const description = document.getElementById('custom-role-desc').value.trim();

    const selectedPerms = [];
    document.querySelectorAll('#custom-role-form input[name="perm"]:checked').forEach(cb => {
      selectedPerms.push(cb.value);
    });

    if (selectedPerms.length === 0) {
      showToast('Debes seleccionar al menos un permiso para este rol', 'warning');
      return;
    }

    try {
      const res = await fetch(`/api/companies/${currentCompanyId}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, permissions: selectedPerms })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast(`Rol "${name}" creado exitosamente`, 'success');
      customRoleModal.classList.add('hidden');
      loadTeamData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function generateSecurePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
  let pwd = '';
  for (let i = 0; i < 10; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

function populateRolesSelect(selectId, selectedRoleId = null) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '';

  currentCompanyRoles.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = `${r.name} - ${r.description || ''}`;
    if (selectedRoleId && r.id === selectedRoleId) {
      opt.selected = true;
    }
    sel.appendChild(opt);
  });
}

/**
 * Cargar lista de miembros y roles de la empresa activa
 */
async function loadTeamData() {
  try {
    const res = await fetch(`/api/companies/${currentCompanyId}/team`);
    if (!res.ok) throw new Error('Error al cargar datos del equipo');
    const data = await res.json();

    currentTeamMembers = data.members || [];
    currentCompanyRoles = data.roles || [];

    // Actualizar badge contador
    const badge = document.getElementById('tab-team-badge');
    const totalCount = document.getElementById('team-total-count');
    if (badge) badge.textContent = currentTeamMembers.length;
    if (totalCount) totalCount.textContent = `${currentTeamMembers.length} Miembros`;

    renderTeamMembersTable();
    renderRolesGrid();
  } catch (err) {
    console.error('Error en loadTeamData:', err);
    showToast(err.message, 'error');
  }
}

function renderTeamMembersTable() {
  const tbody = document.getElementById('team-members-tbody');
  if (!tbody) return;

  if (currentTeamMembers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 30px; color: var(--text-muted);">No hay colaboradores registrados en esta empresa.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  currentTeamMembers.forEach(m => {
    const tr = document.createElement('tr');

    const initial = (m.fullName || 'U').charAt(0).toUpperCase();
    const isOwner = Boolean(m.isOwner);
    const isSelf = currentUser && currentUser.id === m.userId;

    const roleClass = m.roleId ? m.roleId : 'custom-role';
    const statusLabel = m.status === 'active'
      ? '<span class="status-badge active">● Activo</span>'
      : '<span class="status-badge pending_pwd">⚠️ Contraseña Temp.</span>';

    const joinDate = m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : 'Reciente';

    let actionsHtml = '';
    if (!isSelf && !isOwner) {
      actionsHtml = `
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button class="btn btn-outline-sm btn-edit-role" data-user-id="${m.userId}" data-role-id="${m.roleId}" data-name="${escapeHtml(m.fullName)}">
            Cambiar Rol
          </button>
          <button class="btn btn-outline-sm btn-delete-member" data-user-id="${m.userId}" data-name="${escapeHtml(m.fullName)}" style="color: var(--accent-rose); border-color: rgba(244,63,94,0.3);">
            Eliminar
          </button>
        </div>
      `;
    } else if (isOwner) {
      actionsHtml = `<span style="font-size: 0.78rem; color: var(--text-dim); text-align: right; display: block;">Propietario Principal</span>`;
    } else {
      actionsHtml = `<span style="font-size: 0.78rem; color: #4ade80; text-align: right; display: block;">Tu usuario actual</span>`;
    }

    tr.innerHTML = `
      <td>
        <div class="member-cell">
          <div class="member-avatar">${initial}</div>
          <div>
            <span class="member-name">${escapeHtml(m.fullName)}</span>
            ${isOwner ? '<span class="member-owner-badge">Owner</span>' : ''}
          </div>
        </div>
      </td>
      <td>
        <div style="font-size: 0.85rem; color: var(--text-main);">${escapeHtml(m.email)}</div>
        <div style="font-size: 0.75rem; color: var(--text-dim); font-family: var(--font-mono);">${m.phone ? escapeHtml(m.phone) : 'Sin teléfono'}</div>
      </td>
      <td>
        <span class="role-badge ${roleClass}">${escapeHtml(m.roleName)}</span>
      </td>
      <td>${statusLabel}</td>
      <td style="color: var(--text-muted); font-size: 0.82rem;">${joinDate}</td>
      <td>${actionsHtml}</td>
    `;

    tbody.appendChild(tr);
  });

  // Eventos de botones de acción
  tbody.querySelectorAll('.btn-edit-role').forEach(btn => {
    btn.addEventListener('click', () => {
      const userId = btn.getAttribute('data-user-id');
      const roleId = btn.getAttribute('data-role-id');
      const name = btn.getAttribute('data-name');

      document.getElementById('edit-member-target-id').value = userId;
      document.getElementById('edit-member-subtitle').textContent = `Asignar nuevo rol a ${name}`;
      populateRolesSelect('edit-member-role-select', roleId);
      document.getElementById('edit-member-role-modal').classList.remove('hidden');
    });
  });

  tbody.querySelectorAll('.btn-delete-member').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.getAttribute('data-user-id');
      const name = btn.getAttribute('data-name');

      if (!confirm(`¿Estás seguro de eliminar a ${name} de esta empresa? Perderá el acceso de inmediato.`)) return;

      try {
        const res = await fetch(`/api/companies/${currentCompanyId}/team/members/${userId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        showToast(`${name} ha sido eliminado de la empresa`, 'info');
        loadTeamData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

function renderRolesGrid() {
  const container = document.getElementById('roles-display-grid');
  if (!container) return;

  container.innerHTML = '';
  currentCompanyRoles.forEach(r => {
    const card = document.createElement('div');
    card.className = 'role-card';

    const roleBadgeClass = r.is_system_default ? r.id : 'custom-role';
    const perms = Array.isArray(r.permissions) ? r.permissions : [];

    const permsChips = perms.map(p => `<span class="perm-chip">${p}</span>`).join('');

    card.innerHTML = `
      <div class="role-card-header">
        <span class="role-badge ${roleBadgeClass}">${escapeHtml(r.name)}</span>
        ${r.is_system_default ? '<span style="font-size: 0.7rem; color: var(--text-dim);">Sistema</span>' : '<span style="font-size: 0.7rem; color: #a855f7;">Personalizado</span>'}
      </div>
      <p class="role-card-desc">${escapeHtml(r.description || 'Sin descripción.')}</p>
      <div class="role-card-perms">
        ${permsChips}
      </div>
    `;

    container.appendChild(card);
  });
}
