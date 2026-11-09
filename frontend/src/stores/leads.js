// frontend/src/stores/leads.js
import { writable, derived, get } from 'svelte/store';
import { api } from '../services/api';
import { currentCompanyId } from './company';
import { showToast } from './toast';
import { loadCompanyPlanUsage } from './plans';
import { importContactsCsv as doImportContactsCsv, syncContactsFromWhatsApp as doSyncContactsFromWhatsApp } from './contacts';

export const leads = writable([]);
export const selectedLead = writable(null);
export const isLeadModalOpen = writable(false);
export const isImportModalOpen = writable(false);

// Estado para Historial de Chat de Prospecto
export const selectedChatLead = writable(null);
export const isChatModalOpen = writable(false);
export const chatMessages = writable([]);
export const isChatLoading = writable(false);
export const isLiveChat = writable(false);

// Tarea 10: Notificación y Alerta Flotante (Toast Enriquecido) de Venta Pendiente
export const saleAlerts = writable([]);
export const activeSaleAlert = writable(null);

export function dismissSaleAlert(alertId) {
  if (!alertId) {
    activeSaleAlert.set(null);
    return;
  }
  saleAlerts.update(list => list.filter(a => a.id !== alertId));
}

export function dismissAllSaleAlerts() {
  saleAlerts.set([]);
  activeSaleAlert.set(null);
}

// Derived store para conteo de ventas pendientes activas para el badge en Sidebar
export const pendingSalesCount = derived(leads, ($leads) => {
  if (!Array.isArray($leads)) return 0;
  return $leads.filter(l => l.tag === 'Venta Pendiente' || (l.humanPaused && l.tag === 'Venta Pendiente')).length;
});

export const displayPendingSalesBadge = derived(pendingSalesCount, ($count) => {
  if ($count > 99) return '99+';
  return String($count);
});

export async function updateLeadTag(phone, newTag) {
  try {
    const res = await api.patch(`/api/leads/${encodeURIComponent(phone)}/tag`, { tag: newTag });
    if (res && res.success) {
      leads.update(list => {
        return list.map(l => {
          if (l.phone === phone || (l.phone && l.phone.replace(/\D/g, '') === phone.replace(/\D/g, ''))) {
            return {
              ...l,
              tag: res.tag,
              humanPaused: res.humanPaused,
              humanPausedUntil: res.humanPaused ? l.humanPausedUntil : null,
            };
          }
          return l;
        });
      });

      // Si la etiqueta dejó de ser Venta Pendiente, descartar toast flotante correspondiente
      if (newTag !== 'Venta Pendiente') {
        const cleanPhone = phone.replace(/\D/g, '');
        saleAlerts.update(list => list.filter(a => {
          const alertPhone = a.lead?.phone || '';
          return alertPhone !== phone && alertPhone.replace(/\D/g, '') !== cleanPhone;
        }));
      }

      showToast(`Etiqueta actualizada a "${res.tag}"`, 'success');
      return { success: true };
    }
  } catch (err) {
    console.error('Error actualizando etiqueta de prospecto:', err);
    showToast(err.message || 'Error actualizando etiqueta', 'error');
    return { success: false, error: err.message };
  }
}

export function playSaleAlertSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    // Secuencia sonora de campanada de caja / éxito: C5 -> E5 -> G5 -> C6
    const notes = [
      { freq: 523.25, time: 0, duration: 0.15 },
      { freq: 659.25, time: 0.11, duration: 0.15 },
      { freq: 783.99, time: 0.22, duration: 0.18 },
      { freq: 1046.50, time: 0.33, duration: 0.45 },
    ];
    notes.forEach(({ freq, time, duration }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + time);
      gain.gain.setValueAtTime(0.28, ctx.currentTime + time);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + time + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + time);
      osc.stop(ctx.currentTime + time + duration);
    });
  } catch (e) {
    console.warn('No se pudo reproducir el aviso sonoro:', e);
  }
}

let activeEventSource = null;
let chatPollTimer = null;
let companyEventsSource = null;

/**
 * Inicia la transmisión de eventos en tiempo real para la empresa activa
 * Mantiene la lista de prospectos sincronizada al segundo sin necesidad de recargar (F5)
 */
export function initCompanyRealtimeEvents(companyId) {
  stopCompanyRealtimeEvents();
  if (!companyId) return;

  try {
    const url = `/api/events?companyId=${encodeURIComponent(companyId)}`;
    const es = new EventSource(url);
    companyEventsSource = es;

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'connected') return;

        if (msg.event === 'lead_updated' && msg.payload) {
          const lead = msg.payload;
          leads.update(list => {
            const cleanTarget = (lead.phone || '').replace(/\D/g, '');
            const idx = list.findIndex(l => l.phone === lead.phone || (cleanTarget && l.phone && l.phone.replace(/\D/g, '') === cleanTarget));
            if (idx >= 0) {
              const updated = { ...list[idx], ...lead };
              const rest = list.filter((_, i) => i !== idx);
              return [updated, ...rest];
            } else {
              // Nuevo prospecto que acaba de iniciar conversación: aparece de inmediato en la cima
              return [lead, ...list];
            }
          });

          selectedLead.update(curr => curr && curr.phone === lead.phone ? { ...curr, ...lead } : curr);
          selectedChatLead.update(curr => curr && curr.phone === lead.phone ? { ...curr, ...lead } : curr);
        }

        if (msg.event === 'lead_deleted' && msg.payload?.phone) {
          const delPhone = msg.payload.phone;
          leads.update(list => list.filter(l => l.phone !== delPhone));
        }

        if (msg.event === 'leads_reloaded') {
          loadLeads();
        }

        if (msg.event === 'sale_alert' && msg.payload) {
          playSaleAlertSound();
          const alertItem = {
            id: 'sale_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            lead: msg.payload.lead,
            summary: msg.payload.summary || 'Pedido confirmado / Intención de compra',
            timestamp: msg.payload.timestamp || Date.now(),
          };
          saleAlerts.update(list => [
            alertItem,
            ...list.filter(a => (a.lead?.phone || '') !== (alertItem.lead?.phone || '')),
          ]);
        }

        if (msg.event === 'quota_exhausted') {
          loadCompanyPlanUsage(msg.payload?.companyId);
          showToast(
            msg.payload?.message || '⚠️ Has superado el límite de tu plan. Las respuestas automáticas se han pausado.',
            'error',
            15000
          );
        }

        if (msg.event === 'quota_reset') {
          loadCompanyPlanUsage(msg.payload?.companyId);
        }
      } catch (e) {
        console.warn('Error procesando evento SSE de empresa:', e);
      }
    };

    es.onerror = () => {
      // EventSource reconecta automáticamente si se interrumpe la red
    };
  } catch (err) {
    console.error('Error iniciando stream de eventos de empresa:', err);
  }
}

export function stopCompanyRealtimeEvents() {
  if (companyEventsSource) {
    try { companyEventsSource.close(); } catch (e) { }
    companyEventsSource = null;
  }
}

export async function loadLeads() {
  try {
    const data = await api.get('/api/leads');
    const list = Array.isArray(data) ? data : [];
    leads.set(list);
    return list;
  } catch (err) {
    console.error('Error cargando prospectos:', err);
    return [];
  }
}

export async function togglePauseLead(phone) {
  try {
    const res = await api.post(`/api/leads/${encodeURIComponent(phone)}/toggle-pause`, {});
    leads.update(list => list.map(l => l.phone === phone ? { ...l, humanPaused: res.humanPaused } : l));
    selectedChatLead.update(curr => curr && curr.phone === phone ? { ...curr, humanPaused: res.humanPaused } : curr);
    showToast(res.humanPaused ? 'Bot pausado para este cliente' : 'Bot reactivado para este cliente', 'info');
    return { success: true, humanPaused: res.humanPaused };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

/**
 * Tarea 11: Reactivar bot para un contacto silenciado como personal
 */
export async function reactivateBotLead(phone) {
  try {
    const res = await api.post(`/api/leads/${encodeURIComponent(phone)}/reactivate`, {});
    leads.update(list => list.map(l => l.phone === phone ? { ...l, isPersonal: false, personalReason: null, humanPaused: false, tag: res.tag || 'Reactivado' } : l));
    selectedChatLead.update(curr => curr && curr.phone === phone ? { ...curr, isPersonal: false, personalReason: null, humanPaused: false, tag: res.tag || 'Reactivado' } : curr);
    showToast('🤖 Bot reactivado para este contacto. Volverá a responder normalmente.', 'success');
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export function openLeadFiles(lead) {
  selectedLead.set(lead);
  isLeadModalOpen.set(true);
}

export async function openLeadChat(lead) {
  selectedChatLead.set(lead);
  chatMessages.set([]);
  isChatModalOpen.set(true);
  await loadChatHistory(lead.phone, true);
  startRealtimeStream(lead.phone);
}

export function closeLeadChat() {
  stopRealtimeStream();
  isChatModalOpen.set(false);
  selectedChatLead.set(null);
}

export function startRealtimeStream(phone) {
  stopRealtimeStream();
  const companyId = get(currentCompanyId) || 'default';
  const url = `/api/leads/${encodeURIComponent(phone)}/stream?companyId=${encodeURIComponent(companyId)}`;

  try {
    const es = new EventSource(url);
    activeEventSource = es;

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'connected') {
          isLiveChat.set(true);
          return;
        }

        // Agregar nuevo mensaje en tiempo real sin duplicar
        chatMessages.update(msgs => {
          const exists = msgs.some(m => m.id === msg.id || (m.timestamp === msg.timestamp && m.body === msg.body));
          if (exists) return msgs;
          return [...msgs, msg];
        });

        // Actualizar datos del prospecto en la lista general en vivo
        leads.update(list => list.map(l => l.phone === phone ? {
          ...l,
          lastMessage: msg.body || (msg.hasMedia ? '📎 Archivo adjunto' : l.lastMessage),
          lastInteraction: new Date().toISOString()
        } : l));

      } catch (err) {
        console.warn('Error procesando evento SSE:', err);
      }
    };

    es.onerror = () => {
      // EventSource reconecta automáticamente en navegadores estándar
    };
  } catch (err) {
    console.warn('Error inicializando EventSource:', err);
  }

  // Polling de respaldo continuo cada 3 segundos mientras el modal esté abierto
  chatPollTimer = setInterval(() => {
    if (get(isChatModalOpen) && get(selectedChatLead)?.phone === phone) {
      loadChatHistory(phone, false);
    } else {
      stopRealtimeStream();
    }
  }, 3000);
}

export function stopRealtimeStream() {
  if (activeEventSource) {
    try { activeEventSource.close(); } catch (e) { }
    activeEventSource = null;
  }
  if (chatPollTimer) {
    clearInterval(chatPollTimer);
    chatPollTimer = null;
  }
}

export async function loadChatHistory(phone, showSpinner = true) {
  if (showSpinner) isChatLoading.set(true);
  try {
    const res = await api.get(`/api/leads/${encodeURIComponent(phone)}/messages`);
    const newMsgs = res.messages || [];

    chatMessages.update(curr => {
      if (curr.length === 0) return newMsgs;
      if (curr.length !== newMsgs.length || curr[curr.length - 1]?.id !== newMsgs[newMsgs.length - 1]?.id) {
        return newMsgs;
      }
      return curr;
    });

    isLiveChat.set(Boolean(res.liveFetched));
    if (res.leadName) {
      selectedChatLead.update(curr => curr ? { ...curr, name: res.leadName, tag: res.leadTag, humanPaused: res.humanPaused } : curr);
    }
    return newMsgs;
  } catch (err) {
    if (showSpinner) {
      console.error('Error cargando historial de chat:', err);
      showToast('Error cargando chat: ' + err.message, 'error');
      chatMessages.set([]);
    }
    return [];
  } finally {
    if (showSpinner) isChatLoading.set(false);
  }
}

export async function sendChatMessage(phone, message) {
  if (!message || !message.trim()) return { success: false };
  try {
    const res = await api.post(`/api/leads/${encodeURIComponent(phone)}/messages`, { message: message.trim() });
    if (res.message) {
      chatMessages.update(msgs => {
        const exists = msgs.some(m => m.id === res.message.id);
        if (exists) return msgs;
        return [...msgs, res.message];
      });
    }
    leads.update(list => list.map(l => l.phone === phone ? {
      ...l,
      lastMessage: message.trim(),
      lastInteraction: new Date().toISOString()
    } : l));
    showToast('Mensaje entregado al cliente', 'success');
    return { success: true };
  } catch (err) {
    showToast(err.message || 'Error al enviar mensaje', 'error');
    return { success: false, error: err.message };
  }
}

export async function importContactsCsv(importData) {
  return doImportContactsCsv(importData.csv, importData.defaultTag, importData.defaultPrefix, importData.groupId);
}

export async function syncContactsFromWhatsApp(options = {}) {
  return doSyncContactsFromWhatsApp(options.defaultTag, options.groupId);
}
