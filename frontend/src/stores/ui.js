// frontend/src/stores/ui.js
import { writable } from 'svelte/store';

export const activeTab = writable('tab-library');
export const isProfileModalOpen = writable(false);
export const isChangePasswordModalOpen = writable(false);
export const quickSendInitialPhone = writable('');

// Estado de la barra lateral izquierda (persistente en localStorage)
const savedSidebarState = typeof localStorage !== 'undefined' ? localStorage.getItem('ws_bot_sidebar_collapsed') === 'true' : false;
export const isSidebarCollapsed = writable(savedSidebarState);

if (typeof localStorage !== 'undefined') {
  isSidebarCollapsed.subscribe(val => {
    localStorage.setItem('ws_bot_sidebar_collapsed', String(val));
  });
}
