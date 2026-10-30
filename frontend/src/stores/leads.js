// frontend/src/stores/leads.js
import { writable, get } from 'svelte/store';
import { api } from '../services/api';
import { currentCompanyId } from './company';
import { showToast } from './toast';

export const leads = writable([]);
export const selectedLead = writable(null);
export const isLeadModalOpen = writable(false);

// Estado para Historial de Chat de Prospecto
export const selectedChatLead = writable(null);
export const isChatModalOpen = writable(false);
export const chatMessages = writable([]);
export const isChatLoading = writable(false);
export const isLiveChat = writable(false);

let activeEventSource = null;
let chatPollTimer = null;

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
    const res = await api.post(`/api/leads/${phone}/toggle-pause`, {});
    leads.update(list => list.map(l => l.phone === phone ? { ...l, humanPaused: res.humanPaused } : l));
    selectedChatLead.update(curr => curr && curr.phone === phone ? { ...curr, humanPaused: res.humanPaused } : curr);
    showToast(res.humanPaused ? 'Bot pausado para este cliente' : 'Bot reactivado para este cliente', 'info');
    return { success: true, humanPaused: res.humanPaused };
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
      const res = await api.get(`/api/leads/${phone}/messages`);
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
      const res = await api.post(`/api/leads/${phone}/messages`, { message: message.trim() });
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
