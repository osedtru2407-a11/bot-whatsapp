// frontend/src/stores/contacts.js
import { writable } from 'svelte/store';
import { api } from '../services/api';
import { showToast } from './toast';
import { loadGroups } from './groups';

export const contacts = writable([]);
export const isContactModalOpen = writable(false);
export const isLoadingContacts = writable(false);

export async function loadContacts() {
  isLoadingContacts.set(true);
  try {
    const data = await api.get('/api/contacts');
    const list = Array.isArray(data) ? data : [];
    contacts.set(list);
    return list;
  } catch (err) {
    console.error('Error cargando contactos:', err);
    return [];
  } finally {
    isLoadingContacts.set(false);
  }
}

export async function createContact(contactData) {
  try {
    const res = await api.post('/api/contacts', contactData);
    if (res.contact) {
      contacts.update(list => [res.contact, ...list.filter(c => c.phone !== res.contact.phone)]);
    }
    showToast('Contacto guardado con éxito', 'success');
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function deleteContact(phone) {
  try {
    await api.delete(`/api/contacts/${encodeURIComponent(phone)}`);
    contacts.update(list => list.filter(c => c.phone !== phone));
    showToast('Contacto eliminado de la agenda', 'info');
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function importContactsCsv(csvText, defaultTag = 'Importado Google', defaultPrefix = '57', groupId = null) {
  try {
    const res = await api.post('/api/contacts/import-csv', {
      csv: csvText,
      defaultTag,
      defaultPrefix,
      groupId
    });

    showToast(`Se importaron ${res.importedCount} contactos a la agenda`, 'success');
    await loadContacts();
    if (groupId) {
      await loadGroups();
    }
    return { success: true, count: res.importedCount };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function syncContactsFromWhatsApp(defaultTag = 'Agenda WhatsApp', groupId = null) {
  try {
    const res = await api.post('/api/contacts/sync-whatsapp', {
      defaultTag,
      groupId
    });

    showToast(`Se sincronizaron ${res.syncedCount} contactos de WhatsApp a tu agenda`, 'success');
    await loadContacts();
    if (groupId) {
      await loadGroups();
    }
    return { success: true, count: res.syncedCount };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

