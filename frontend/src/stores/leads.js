// frontend/src/stores/leads.js
import { writable } from 'svelte/store';
import { api } from '../services/api';
import { showToast } from './toast';

export const leads = writable([]);
export const selectedLead = writable(null);
export const isLeadModalOpen = writable(false);

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
