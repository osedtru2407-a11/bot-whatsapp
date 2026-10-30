// frontend/src/stores/settings.js
import { writable } from 'svelte/store';
import { api } from '../services/api';
import { showToast } from './toast';

export const settings = writable({
  businessName: '',
  geminiEnabled: true,
  simulateTyping: true,
  typingDelaySeconds: 2,
  ignoreGroups: true,
  fallbackMessage: ''
});

export const geminiStatus = writable({
  configured: false,
  message: ''
});

export async function loadSettings() {
  try {
    const data = await api.get('/api/settings');
    settings.set({
      businessName: data.businessName || '',
      geminiEnabled: data.geminiEnabled ?? true,
      simulateTyping: data.simulateTyping ?? true,
      typingDelaySeconds: data.typingDelaySeconds || 2,
      ignoreGroups: data.ignoreGroups ?? true,
      fallbackMessage: data.fallbackMessage || ''
    });

    try {
      const gStatus = await api.get('/api/gemini/status');
      geminiStatus.set(gStatus);
    } catch (e) {}

    return data;
  } catch (err) {
    console.error('Error cargando configuración:', err);
    return null;
  }
}

export async function saveSettings(settingsData) {
  try {
    await api.post('/api/settings', settingsData);
    settings.set(settingsData);
    showToast('Configuración guardada correctamente', 'success');
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}
