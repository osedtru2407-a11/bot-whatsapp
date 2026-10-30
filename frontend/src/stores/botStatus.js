// frontend/src/stores/botStatus.js
import { writable, get } from 'svelte/store';
import { api } from '../services/api';
import { currentCompanyId, companies } from './company';
import { showToast } from './toast';

export const botStatus = writable({
  status: 'initializing', // 'ready' | 'qr_ready' | 'authenticated' | 'initializing' | 'disconnected'
  phone: '',
  qrCode: null,
  botEnabled: true,
  companyName: '',
  pendingSchedulesCount: 0
});

export const isQrModalOpen = writable(false);
export const autoCloseNotice = writable(null);

let pollTimer = null;
let wasScanning = false;
let autoCloseTimer = null;

export async function fetchBotStatus() {
  const targetId = get(currentCompanyId);
  if (!targetId) return;

  try {
    const data = await api.get(`/api/status?companyId=${encodeURIComponent(targetId)}&_t=${Date.now()}`);

    // Race condition protection
    if (data.companyId && data.companyId !== get(currentCompanyId)) {
      return;
    }

    const phoneVal = (data.clientInfo?.wid && data.clientInfo.wid !== 'Conectado') ? data.clientInfo.wid : '';

    botStatus.set({
      status: data.status || 'disconnected',
      phone: phoneVal,
      qrCode: data.qrCode || null,
      botEnabled: Boolean(data.botEnabled),
      companyName: data.companyName || '',
      pendingSchedulesCount: data.pendingSchedulesCount || 0
    });

    // Update phone in companies list if available
    if (phoneVal) {
      companies.update(list => list.map(c => c.id === targetId ? { ...c, phone: phoneVal, status: data.status } : c));
    }

    // Auto-close handling on connection
    if (data.status === 'ready') {
      if (wasScanning && get(isQrModalOpen)) {
        wasScanning = false;
        autoCloseNotice.set('¡Vinculado con éxito! Cerrando ventana en un momento...');
        if (autoCloseTimer) clearTimeout(autoCloseTimer);
        autoCloseTimer = setTimeout(() => {
          isQrModalOpen.set(false);
          autoCloseNotice.set(null);
          showToast('WhatsApp conectado correctamente', 'success');
        }, 1800);
      }
    } else if (data.status === 'qr_ready') {
      wasScanning = true;
      if (autoCloseTimer) {
        clearTimeout(autoCloseTimer);
        autoCloseTimer = null;
      }
      autoCloseNotice.set(null);
    }

  } catch (err) {
    botStatus.update(s => ({ ...s, status: 'disconnected' }));
  }
}

export function startStatusPolling(intervalMs = 3500) {
  stopStatusPolling();
  fetchBotStatus();
  pollTimer = setInterval(fetchBotStatus, intervalMs);
}

export function stopStatusPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export async function toggleBot() {
  try {
    const res = await api.post('/api/bot/toggle', {});
    botStatus.update(s => ({ ...s, botEnabled: res.botEnabled }));
    showToast(res.botEnabled ? 'Bot activado' : 'Bot pausado', 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

export async function restartBot() {
  const targetId = get(currentCompanyId);
  try {
    await api.post(`/api/bot/restart?companyId=${encodeURIComponent(targetId)}`, {});
    showToast('Reinicio de conexión solicitado. Espera unos segundos.', 'info');
    fetchBotStatus();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

export async function disconnectBot() {
  const targetId = get(currentCompanyId);
  try {
    await api.post(`/api/bot/disconnect?companyId=${encodeURIComponent(targetId)}`, {});
    showToast('Desvinculando WhatsApp de esta empresa...', 'info');
    fetchBotStatus();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
