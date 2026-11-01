// frontend/src/stores/groups.js
import { writable } from 'svelte/store';
import { api } from '../services/api';
import { showToast } from './toast';

export const groups = writable([]);
export const isGroupsModalOpen = writable(false);
export const selectedGroup = writable(null);

export async function loadGroups() {
  try {
    const data = await api.get('/api/groups');
    const list = Array.isArray(data) ? data : [];
    groups.set(list);
    return list;
  } catch (err) {
    console.error('Error cargando grupos:', err);
    return [];
  }
}

export async function createGroup(groupData) {
  try {
    const newGroup = await api.post('/api/groups', groupData);
    groups.update(list => [...list, newGroup]);
    showToast(`Grupo "${newGroup.name}" creado con éxito`, 'success');
    return { success: true, group: newGroup };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function deleteGroup(id) {
  try {
    await api.delete(`/api/groups/${id}`);
    groups.update(list => list.filter(g => g.id !== id));
    showToast('Grupo eliminado', 'info');
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function getGroupMembers(id) {
  try {
    const res = await api.get(`/api/groups/${id}/members`);
    return res.members || [];
  } catch (err) {
    console.error('Error obteniendo miembros del grupo:', err);
    return [];
  }
}

export async function addMembersToGroup(id, phones) {
  try {
    await api.post(`/api/groups/${id}/members`, { phones });
    showToast(`${phones.length} contacto(s) añadidos al grupo`, 'success');
    await loadGroups();
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function removeMemberFromGroup(id, phone) {
  try {
    await api.delete(`/api/groups/${id}/members/${encodeURIComponent(phone)}`);
    showToast('Contacto removido del grupo', 'info');
    await loadGroups();
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

