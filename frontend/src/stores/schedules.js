// frontend/src/stores/schedules.js
import { writable } from 'svelte/store';
import { api } from '../services/api';
import { showToast } from './toast';

export const schedules = writable([]);
export const isScheduleModalOpen = writable(false);
export const selectedSchedule = writable(null);
export const modalMode = writable('create'); // 'create' | 'edit' | 'duplicate'

export function openCreateScheduleModal() {
  selectedSchedule.set(null);
  modalMode.set('create');
  isScheduleModalOpen.set(true);
}

export function openEditScheduleModal(schedule) {
  selectedSchedule.set(schedule);
  modalMode.set('edit');
  isScheduleModalOpen.set(true);
}

export function openDuplicateScheduleModal(schedule) {
  selectedSchedule.set(schedule);
  modalMode.set('duplicate');
  isScheduleModalOpen.set(true);
}

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
    selectedSchedule.set(null);
    await loadSchedules();
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function updateSchedule(id, scheduleData) {
  try {
    await api.put(`/api/schedules/${id}`, scheduleData);
    showToast('Campaña actualizada y reprogramada con éxito', 'success');
    isScheduleModalOpen.set(false);
    selectedSchedule.set(null);
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
    showToast('Campaña iniciada de inmediato', 'success');
    await loadSchedules();
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function cancelSchedule(id) {
  try {
    await api.post(`/api/schedules/${id}/cancel`, {});
    showToast('Campaña cancelada', 'info');
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
