// frontend/src/stores/rules.js
import { writable } from 'svelte/store';
import { api } from '../services/api';
import { showToast } from './toast';

export const rules = writable([]);
export const editingRule = writable(null); // null when creating, rule object when editing
export const isRuleModalOpen = writable(false);

export async function loadRules() {
  try {
    const data = await api.get('/api/rules');
    const list = Array.isArray(data) ? data : [];
    rules.set(list);
    return list;
  } catch (err) {
    console.error('Error cargando reglas:', err);
    return [];
  }
}

export async function saveRule(payload, id = null) {
  try {
    if (id) {
      await api.put(`/api/rules/${id}`, payload);
      showToast(`Ruta "${payload.name}" actualizada con éxito`, 'success');
    } else {
      await api.post('/api/rules', payload);
      showToast(`Ruta "${payload.name}" creada con éxito`, 'success');
    }
    isRuleModalOpen.set(false);
    editingRule.set(null);
    await loadRules();
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function toggleRule(id, enabled) {
  try {
    await api.put(`/api/rules/${id}`, { enabled });
    rules.update(list => list.map(r => r.id === id ? { ...r, enabled } : r));
    showToast(enabled ? 'Ruta activada' : 'Ruta desactivada', 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

export async function deleteRule(id, name) {
  try {
    await api.delete(`/api/rules/${id}`);
    rules.update(list => list.filter(r => r.id !== id));
    showToast(`Ruta "${name}" eliminada`, 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
}
