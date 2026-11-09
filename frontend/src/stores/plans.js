// frontend/src/stores/plans.js
import { writable, get } from 'svelte/store';
import { api, getStoredCompanyId } from '../services/api';
import { currentCompanyId } from './company';
import { showToast } from './toast';

export const plans = writable([]);
export const companyPlanUsage = writable(null);
export const isPlansLoading = writable(false);

export async function loadPlans() {
  isPlansLoading.set(true);
  try {
    let res;
    try {
      res = await api.get('/api/superadmin/plans');
    } catch (e) {
      res = await api.get('/api/plans');
    }
    if (res && res.plans) {
      plans.set(res.plans);
      return res.plans;
    }
    return [];
  } catch (err) {
    console.error('Error cargando planes:', err);
    return [];
  } finally {
    isPlansLoading.set(false);
  }
}

  export async function loadCompanyPlanUsage(targetCompId = null) {
    try {
      const compId = targetCompId || get(currentCompanyId) || getStoredCompanyId() || 'default';
      const res = await api.get(`/api/company/plan-usage?companyId=${encodeURIComponent(compId)}`);
      if (res && res.usage) {
        companyPlanUsage.set(res.usage);
        return res.usage;
      }
      return null;
    } catch (err) {
      console.warn('Aviso cargando uso del plan:', err?.message);
      return null;
    }
  }

  export async function savePlan(planData) {
    try {
      let res;
      if (planData.id && !planData.isNew) {
        res = await api.put(`/api/superadmin/plans/${planData.id}`, planData);
      } else {
        res = await api.post('/api/superadmin/plans', planData);
      }
      showToast(res.message || 'Plan guardado exitosamente', 'success');
      await loadPlans();
      return { success: true, plan: res.plan };
    } catch (err) {
      console.error('Error guardando plan:', err);
      showToast(err.message || 'Error al guardar el plan', 'error');
      return { success: false, error: err.message };
    }
  }

  export async function deletePlan(planId) {
    try {
      const res = await api.delete(`/api/superadmin/plans/${planId}`);
      showToast(res.message || 'Plan eliminado exitosamente', 'success');
      await loadPlans();
      return { success: true };
    } catch (err) {
      console.error('Error eliminando plan:', err);
      showToast(err.message || 'Error eliminando el plan', 'error');
      return { success: false, error: err.message };
    }
  }

  export async function assignPlanToCompany(companyId, planId) {
    try {
      const res = await api.post(`/api/superadmin/companies/${companyId}/assign-plan`, { planId });
      showToast(res.message || 'Plan asignado exitosamente', 'success');
      return { success: true, company: res.company };
    } catch (err) {
      console.error('Error asignando plan:', err);
      showToast(err.message || 'Error asignando plan', 'error');
      return { success: false, error: err.message };
    }
  }

  export async function resetCompanyQuota(companyId) {
    try {
      const res = await api.post(`/api/superadmin/companies/${companyId}/reset-quota`, {});
      showToast(res.message || 'Cuota reiniciada exitosamente', 'success');
      return { success: true };
    } catch (err) {
      console.error('Error reiniciando cuota:', err);
      showToast(err.message || 'Error al reiniciar cuota', 'error');
      return { success: false, error: err.message };
    }
  }

