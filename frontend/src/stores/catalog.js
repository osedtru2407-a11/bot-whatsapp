// frontend/src/stores/catalog.js
import { writable } from 'svelte/store';
import { api } from '../services/api';
import { showToast } from './toast';

export const products = writable([]);
export const catalogStats = writable({ total: 0, available: 0, unavailable: 0 });
export const isValidating = writable(false);
export const isSyncing = writable(false);
export const validationError = writable(null);
export const parsedPreview = writable(null);

export async function loadProducts() {
  try {
    const res = await api.get('/api/catalog/products');
    const list = res.products || [];
    products.set(list);
    
    const available = list.filter(p => p.isAvailable !== false).length;
    const unavailable = list.length - available;
    catalogStats.set({ total: list.length, available, unavailable });
    return list;
  } catch (err) {
    console.error('Error cargando productos:', err);
    return [];
  }
}

export async function validateCatalogDocx(filename, base64Data) {
  isValidating.set(true);
  validationError.set(null);
  parsedPreview.set(null);

  try {
    const res = await api.post('/api/catalog/validate', {
      filename,
      data: base64Data,
    });

    parsedPreview.set(res);
    showToast(`Archivo válido: ${res.total} productos detectados en la tabla.`, 'success');
    return { success: true, data: res };
  } catch (err) {
    const errorMsg = err?.message || 'Error validando el catálogo en Word.';
    validationError.set(errorMsg);
    showToast(errorMsg, 'error');
    return { success: false, error: errorMsg };
  } finally {
    isValidating.set(false);
  }
}

export async function syncCatalogDocx(filename, base64Data, productsList) {
  isSyncing.set(true);
  try {
    const res = await api.post('/api/catalog/sync', {
      filename,
      data: base64Data,
      products: productsList,
    });

    if (!res.missing || res.missing.length === 0) {
      showToast(res.message || 'Catálogo sincronizado exitosamente.', 'success');
    }
    await loadProducts();
    parsedPreview.set(null);
    validationError.set(null);
    return { success: true, data: res };
  } catch (err) {
    const errorMsg = err?.message || 'Error sincronizando el catálogo.';
    showToast(errorMsg, 'error');
    return { success: false, error: errorMsg };
  } finally {
    isSyncing.set(false);
  }
}

export async function toggleProductAvailability(id, isAvailable, showToastNotification = true) {
  try {
    const res = await api.put(`/api/catalog/products/${id}/availability`, { isAvailable });
    products.update(list => list.map(p => p.id === id ? { ...p, isAvailable: res.product.isAvailable } : p));
    if (showToastNotification) {
      showToast(`Estado actualizado: ${isAvailable ? 'Disponible' : 'No disponible'}`, 'info');
    }
    const current = await loadProducts();
    return { success: true, products: current };
  } catch (err) {
    showToast(err?.message || 'Error actualizando disponibilidad.', 'error');
    return { success: false };
  }
}

export async function batchUpdateAvailability(updates) {
  try {
    const res = await api.put('/api/catalog/products/batch-availability', { updates });
    await loadProducts();
    return { success: true, count: res.updatedCount };
  } catch (err) {
    showToast(err?.message || 'Error actualizando disponibilidad en lote.', 'error');
    return { success: false };
  }
}

export async function uploadProductPhoto(productId, filename, base64Data) {
  try {
    const res = await api.post(`/api/catalog/products/${productId}/photos`, {
      filename,
      data: base64Data,
    });
    products.update(list => list.map(p => p.id === productId ? res.product : p));
    showToast('Fotografía agregada al producto.', 'success');
    return { success: true, product: res.product };
  } catch (err) {
    const msg = err?.message || 'Error subiendo fotografía.';
    showToast(msg, 'error');
    return { success: false, error: msg };
  }
}

export async function deleteProductPhoto(productId, imageUrl) {
  try {
    const res = await api.delete(`/api/catalog/products/${productId}/photos`, { imageUrl });
    products.update(list => list.map(p => p.id === productId ? res.product : p));
    showToast('Fotografía eliminada.', 'info');
    return { success: true, product: res.product };
  } catch (err) {
    const msg = err?.message || 'Error eliminando fotografía.';
    showToast(msg, 'error');
    return { success: false, error: msg };
  }
}

export async function deleteProduct(productId) {
  try {
    await api.delete(`/api/catalog/products/${productId}`);
    products.update(list => list.filter(p => p.id !== productId));
    await loadProducts();
    showToast('Producto eliminado del catálogo.', 'info');
    return { success: true };
  } catch (err) {
    const msg = err?.message || 'Error eliminando producto.';
    showToast(msg, 'error');
    return { success: false, error: msg };
  }
}

