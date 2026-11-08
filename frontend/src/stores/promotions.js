import { writable, derived } from 'svelte/store';
import { api } from '../services/api';
import { showToast } from './toast';

export const promotionsData = writable({
  total: 0,
  activeCount: 0,
  scheduledCount: 0,
  expiredCount: 0,
  pausedCount: 0,
  activeList: [],
  scheduledList: [],
  expiredList: [],
  pausedList: [],
  all: [],
});

export const isLoadingPromotions = writable(false);
export const isSavingPromotion = writable(false);
export const promotionError = writable(null);

export async function loadPromotions() {
  isLoadingPromotions.set(true);
  promotionError.set(null);
  try {
    const res = await api.get('/api/promotions');
    if (res) {
      promotionsData.set(res);
      return res;
    }
  } catch (err) {
    const msg = err?.message || 'Error al cargar las promociones';
    promotionError.set(msg);
    showToast(msg, 'error');
  } finally {
    isLoadingPromotions.set(false);
  }
}

export async function createPromotion(payload) {
  isSavingPromotion.set(true);
  promotionError.set(null);
  try {
    const res = await api.post('/api/promotions', payload);
    if (res) {
      showToast('¡Campaña guardada y programada exitosamente!', 'success');
      await loadPromotions();
      return { success: true, promotion: res };
    }
  } catch (err) {
    const msg = err?.message || 'No fue posible crear la promoción';
    promotionError.set(msg);
    showToast(msg, 'error');
    throw err;
  } finally {
    isSavingPromotion.set(false);
  }
}

export async function togglePromotion(id) {
  try {
    const res = await api.put(`/api/promotions/${id}/toggle`, {});
    if (res) {
      const stateMsg = res.isActive ? 'Campaña activada' : 'Campaña pausada';
      showToast(stateMsg, 'info');
      await loadPromotions();
      return { success: true, promotion: res };
    }
  } catch (err) {
    const msg = err?.message || 'Error al cambiar estado de la promoción';
    showToast(msg, 'error');
    throw err;
  }
}

export async function updatePromotion(id, data) {
  isSavingPromotion.set(true);
  try {
    const res = await api.put(`/api/promotions/${id}`, data);
    if (res) {
      showToast('Campaña actualizada correctamente', 'success');
      await loadPromotions();
      return { success: true, promotion: res };
    }
  } catch (err) {
    const msg = err?.message || 'Error al actualizar la promoción';
    showToast(msg, 'error');
    throw err;
  } finally {
    isSavingPromotion.set(false);
  }
}

export async function deletePromotion(id) {
  try {
    const res = await api.delete(`/api/promotions/${id}`);
    if (res?.success) {
      showToast('Promoción eliminada', 'info');
      await loadPromotions();
      return { success: true };
    }
  } catch (err) {
    const msg = err?.message || 'Error al eliminar la promoción';
    showToast(msg, 'error');
    throw err;
  }
}

