// frontend/src/stores/superadmin.js
import { writable } from 'svelte/store';
import { api } from '../services/api';
import { showToast } from './toast';
import { loadCompanies } from './company';
import { isSuperadmin } from './auth';

export const adminStats = writable({
  companiesCount: 0,
  usersCount: 0,
  superadminsCount: 0,
  leadsCount: 0,
  messagesCount: 0,
  activeBotsCount: 0
});

export const adminCompanies = writable([]);
export const adminUsers = writable([]);
export const isSuperadminLoading = writable(false);

export function clearSuperadminStores() {
  adminStats.set({
    companiesCount: 0,
    usersCount: 0,
    superadminsCount: 0,
    leadsCount: 0,
    messagesCount: 0,
    activeBotsCount: 0
  });
  adminCompanies.set([]);
  adminUsers.set([]);
  isSuperadminLoading.set(false);
}

export async function loadAdminStats() {
  let isSuper = false;
  const unsub = isSuperadmin.subscribe(v => isSuper = v);
  unsub();
  if (!isSuper) return null;

  try {
    const res = await api.get('/api/superadmin/stats');
    if (res.stats) {
      adminStats.set(res.stats);
    }
    return res.stats;
  } catch (err) {
    console.error('Error cargando métricas de superadmin:', err);
    return null;
  }
}

export async function loadAdminCompanies() {
  let isSuper = false;
  const unsub = isSuperadmin.subscribe(v => isSuper = v);
  unsub();
  if (!isSuper) return [];

  try {
    const res = await api.get('/api/superadmin/companies');
    const list = res.companies || [];
    adminCompanies.set(list);
    return list;
  } catch (err) {
    console.error('Error cargando empresas:', err);
    showToast(err.message, 'error');
    return [];
  }
}

export async function loadAdminUsers() {
  let isSuper = false;
  const unsub = isSuperadmin.subscribe(v => isSuper = v);
  unsub();
  if (!isSuper) return [];

  try {
    const res = await api.get('/api/superadmin/users');
    const list = res.users || [];
    adminUsers.set(list);
    return list;
  } catch (err) {
    console.error('Error cargando usuarios:', err);
    showToast(err.message, 'error');
    return [];
  }
}

export async function loadAllSuperAdminData() {
  let isSuper = false;
  const unsub = isSuperadmin.subscribe(v => isSuper = v);
  unsub();
  if (!isSuper) {
    clearSuperadminStores();
    return;
  }

  isSuperadminLoading.set(true);
  try {
    await Promise.all([
      loadAdminStats(),
      loadAdminCompanies(),
      loadAdminUsers()
    ]);
  } finally {
    isSuperadminLoading.set(false);
  }
}

export async function createCompany(name) {
  try {
    const res = await api.post('/api/superadmin/companies', { name });
    showToast(res.message || 'Empresa creada con éxito', 'success');
    await loadAdminCompanies();
    await loadAdminStats();
    await loadCompanies();
    return { success: true, companyId: res.companyId };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function updateCompany(id, data) {
  try {
    const res = await api.put(`/api/superadmin/companies/${id}`, data);
    showToast(res.message || 'Empresa actualizada', 'success');
    await loadAdminCompanies();
    await loadCompanies();
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function deleteCompany(id) {
  try {
    const res = await api.delete(`/api/superadmin/companies/${id}`);
    showToast(res.message || 'Empresa eliminada', 'success');
    await loadAdminCompanies();
    await loadAdminStats();
    await loadCompanies();
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function disconnectCompanyWhatsApp(id) {
  try {
    const res = await api.post(`/api/superadmin/companies/${id}/disconnect-whatsapp`, {});
    showToast(res.message || 'WhatsApp desvinculado exitosamente', 'info');
    await loadAdminCompanies();
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function cleanCompanyData(id) {
  try {
    const res = await api.post(`/api/superadmin/companies/${id}/clean-data`, {});
    showToast(res.message || 'Data de la empresa limpiada', 'success');
    await loadAdminCompanies();
    await loadAdminStats();
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function saveCompanyGeminiConfig(id, apiKey, model) {
  try {
    const res = await api.post(`/api/superadmin/companies/${id}/gemini-config`, { apiKey, model });
    showToast('Configuración de Gemini actualizada para la empresa', 'success');
    await loadAdminCompanies();
    return { success: true, data: res };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function createUser(userData) {
  try {
    const res = await api.post('/api/superadmin/users', userData);
    showToast(res.message || 'Usuario creado exitosamente', 'success');
    await loadAdminUsers();
    await loadAdminStats();
    return { success: true, userId: res.userId };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function updateUser(id, userData) {
  try {
    const res = await api.put(`/api/superadmin/users/${id}`, userData);
    showToast(res.message || 'Usuario actualizado', 'success');
    await loadAdminUsers();
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function deleteUser(id) {
  try {
    const res = await api.delete(`/api/superadmin/users/${id}`);
    showToast(res.message || 'Usuario eliminado', 'success');
    await loadAdminUsers();
    await loadAdminStats();
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function resetUserPassword(id, newPassword, requireChangeOnLogin = false) {
  try {
    const res = await api.post(`/api/superadmin/users/${id}/reset-password`, { newPassword, requireChangeOnLogin });
    showToast('Contraseña restablecida correctamente', 'success');
    return { success: true, temporaryPassword: res.temporaryPassword };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function toggleUserSuperadmin(id, isSuperadmin) {
  try {
    const res = await api.post(`/api/superadmin/users/${id}/toggle-superadmin`, { isSuperadmin });
    showToast(res.message || 'Permiso de superusuario actualizado', 'info');
    await loadAdminUsers();
    await loadAdminStats();
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function assignUserToCompany(userId, companyId, roleId, isOwner = false) {
  try {
    const res = await api.post(`/api/superadmin/users/${userId}/companies`, { companyId, roleId, isOwner });
    showToast(res.message || 'Usuario vinculado a la empresa', 'success');
    await loadAdminUsers();
    await loadAdminCompanies();
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function removeUserFromCompany(userId, companyId) {
  try {
    const res = await api.delete(`/api/superadmin/users/${userId}/companies/${companyId}`);
    showToast(res.message || 'Usuario desvinculado de la empresa', 'info');
    await loadAdminUsers();
    await loadAdminCompanies();
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

