// frontend/src/stores/schedules.js
import { writable } from 'svelte/store';
import { api } from '../services/api';
import { showToast } from './toast';

export const schedules = writable([]);
export const isScheduleModalOpen = writable(false);

export async function loadSchedules() {
  try {
    const data = await api.get('/api/schedules');
    const list = Array.isArray(data) ? data : [];
    schedules.set(list);
    return list;
  } catch (err) {
    console.error('Error cargando envíos programados:', err);
    return [];
  }
}

export async function createSchedule(scheduleData) {
  try {
    await api.post('/api/schedules', scheduleData);
    showToast('Envío programado exitosamente', 'success');
    isScheduleModalOpen.set(false);
    await loadSchedules();
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function sendScheduleNow(id) {
  try {
    const res = await api.post(`/api/schedules/${id}/send-now`, {});
    if (res.error) throw new Error(res.error);
    showToast('Mensaje enviado de inmediato', 'success');
    await loadSchedules();
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function deleteSchedule(id) {
  try {
    await api.delete(`/api/schedules/${id}`);
    schedules.update(list => list.filter(s => s.id !== id));
    showToast('Envío programado eliminado', 'info');
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}
