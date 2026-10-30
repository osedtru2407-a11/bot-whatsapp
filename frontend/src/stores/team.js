// frontend/src/stores/team.js
import { writable, get } from 'svelte/store';
import { api } from '../services/api';
import { currentCompanyId } from './company';
import { showToast } from './toast';

export const teamMembers = writable([]);
export const companyRoles = writable([]);
export const isInviteModalOpen = writable(false);
export const isEditRoleModalOpen = writable(false);
export const isCustomRoleModalOpen = writable(false);
export const editingMember = writable(null); // { id, name, currentRoleId }

export async function loadTeamData() {
  const compId = get(currentCompanyId);
  if (!compId) return;

  try {
    const data = await api.get(`/api/companies/${compId}/team`);
    teamMembers.set(data.members || []);
    companyRoles.set(data.roles || []);
    return data;
  } catch (err) {
    console.error('Error cargando equipo:', err);
    return { members: [], roles: [] };
  }
}

export async function inviteMember(memberData) {
  const compId = get(currentCompanyId);
  try {
    await api.post(`/api/companies/${compId}/team/members`, memberData);
    showToast(`Colaborador ${memberData.fullName} agregado con éxito`, 'success');
    isInviteModalOpen.set(false);
    await loadTeamData();
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function updateMemberRole(userId, roleId) {
  const compId = get(currentCompanyId);
  try {
    await api.put(`/api/companies/${compId}/team/members/${userId}`, { roleId });
    showToast('Rol de colaborador actualizado', 'success');
    isEditRoleModalOpen.set(false);
    editingMember.set(null);
    await loadTeamData();
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function deleteMember(userId, name) {
  const compId = get(currentCompanyId);
  try {
    await api.delete(`/api/companies/${compId}/team/members/${userId}`);
    showToast(`${name} ha sido eliminado de la empresa`, 'info');
    await loadTeamData();
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function createCustomRole(roleData) {
  const compId = get(currentCompanyId);
  try {
    await api.post(`/api/companies/${compId}/roles`, roleData);
    showToast(`Rol "${roleData.name}" creado exitosamente`, 'success');
    isCustomRoleModalOpen.set(false);
    await loadTeamData();
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}
