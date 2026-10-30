// frontend/src/stores/library.js
import { writable } from 'svelte/store';
import { api } from '../services/api';
import { showToast } from './toast';

export const documents = writable([]);
export const libraryStats = writable({ activeDocuments: 0, totalWords: 0 });
export const viewingDoc = writable(null); // { id, name, originalFilename, wordCount, content }
export const isLibraryViewModalOpen = writable(false);
export const isLibraryUploadModalOpen = writable(false);

export async function loadLibrary() {
  try {
    const data = await api.get('/api/library');
    const docs = data.documents || [];
    const stats = data.stats || { activeDocuments: 0, totalWords: 0 };
    documents.set(docs);
    libraryStats.set(stats);
    return { docs, stats };
  } catch (err) {
    console.error('Error cargando biblioteca:', err);
    return { docs: [], stats: { activeDocuments: 0, totalWords: 0 } };
  }
}

export async function uploadLibraryDoc(filename, base64Data, name) {
  try {
    const res = await api.post('/api/library/upload', {
      filename,
      data: base64Data,
      name
    });
    showToast(`Documento agregado a la memoria: ${res.document.wordCount} palabras`, 'success');
    isLibraryUploadModalOpen.set(false);
    await loadLibrary();
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function toggleLibraryDoc(id) {
  try {
    const res = await api.post(`/api/library/${id}/toggle`, {});
    documents.update(list => list.map(d => d.id === id ? { ...d, active: res.active } : d));
    showToast(res.active ? 'Documento activado para Gemini' : 'Documento pausado', 'info');
    await loadLibrary();
    return { success: true, active: res.active };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function deleteLibraryDoc(id) {
  try {
    await api.delete(`/api/library/${id}`);
    documents.update(list => list.filter(d => d.id !== id));
    showToast('Documento eliminado de la memoria', 'info');
    await loadLibrary();
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function getLibraryDocDetails(id) {
  try {
    const res = await api.get(`/api/library/${id}`);
    viewingDoc.set({
      id: res.document.id,
      name: res.document.name || res.document.originalFilename,
      originalFilename: res.document.originalFilename,
      wordCount: res.document.wordCount,
      content: res.content || ''
    });
    isLibraryViewModalOpen.set(true);
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function updateLibraryDocContent(id, content) {
  try {
    await api.put(`/api/library/${id}`, { content });
    showToast('Contenido del documento actualizado', 'success');
    isLibraryViewModalOpen.set(false);
    viewingDoc.set(null);
    await loadLibrary();
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}
