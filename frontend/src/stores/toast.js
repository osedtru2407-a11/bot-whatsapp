// frontend/src/stores/toast.js
import { writable } from 'svelte/store';

export const toasts = writable([]);

let toastIdCounter = 0;

export function showToast(message, type = 'info', duration = 4000) {
  const id = ++toastIdCounter;
  const newToast = { id, message, type };

  toasts.update(current => [...current, newToast]);

  if (duration > 0) {
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }

  return id;
}

export function removeToast(id) {
  toasts.update(current => current.filter(t => t.id !== id));
}
