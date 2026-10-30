// frontend/src/stores/company.js
import { writable, derived } from 'svelte/store';
import { api, getStoredCompanyId, setStoredCompanyId } from '../services/api';
import { showToast } from './toast';

export const companies = writable([]);
export const currentCompanyId = writable(getStoredCompanyId());
export const isCompanyModalOpen = writable(false);
export const companyModalMode = writable('create'); // 'create' | 'edit'

export const activeCompany = derived(
  [companies, currentCompanyId],
  ([$companies, $id]) => $companies.find(c => c.id === $id) || $companies[0] || null
);

export async function loadCompanies() {
  try {
    const data = await api.get('/api/companies');
    const compList = Array.isArray(data) ? data : (data.companies || []);
    companies.set(compList);

    const storedId = getStoredCompanyId();
    const exists = compList.some(c => c.id === storedId);

    if (!exists && compList.length > 0) {
      const fallbackId = compList[0].id;
      currentCompanyId.set(fallbackId);
      setStoredCompanyId(fallbackId);
    }

    return compList;
  } catch (err) {
    console.error('Error cargando empresas:', err);
    return [];
  }
}

export async function selectCompany(id, onSwitchCallback) {
  try {
    currentCompanyId.set(id);
    setStoredCompanyId(id);
    await api.post(`/api/companies/${id}/select`, {});
    showToast(`Empresa cambiada a ${id}`, 'info');

    if (onSwitchCallback) {
      await onSwitchCallback(id);
    }
    return true;
  } catch (err) {
    showToast(err.message, 'error');
    return false;
  }
}

export async function createCompany(companyData) {
  try {
    const res = await api.post('/api/companies', companyData);
    showToast('Empresa creada exitosamente', 'success');
    await loadCompanies();
    if (res.company?.id) {
      await selectCompany(res.company.id);
    }
    isCompanyModalOpen.set(false);
    return { success: true, company: res.company };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function updateCompany(id, companyData) {
  try {
    const res = await api.put(`/api/companies/${id}`, companyData);
    showToast('Datos de empresa actualizados', 'success');
    await loadCompanies();
    isCompanyModalOpen.set(false);
    return { success: true, company: res.company };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function deleteCompany(id) {
  try {
    await api.delete(`/api/companies/${id}`);
    showToast('Empresa eliminada', 'info');
    const list = await loadCompanies();
    if (list.length > 0) {
      await selectCompany(list[0].id);
    }
    isCompanyModalOpen.set(false);
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}
