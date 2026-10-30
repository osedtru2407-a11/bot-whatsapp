// frontend/src/stores/ui.js
import { writable } from 'svelte/store';

export const activeTab = writable('tab-rules');
export const isChangePasswordModalOpen = writable(false);
export const quickSendInitialPhone = writable('');
