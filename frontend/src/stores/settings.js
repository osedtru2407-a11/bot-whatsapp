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
  fallbackMessage: '',
  geminiApiKeyMasked: null,
  isCustomGeminiKey: false,
  geminiModel: 'gemini-3.5-flash-lite'
});

export const geminiStatus = writable({
  configured: false,
  isCustom: false,
  maskedKey: null,
  model: 'gemini-3.5-flash-lite',
  hasGlobalKey: false,
  supportsAudio: true
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
      fallbackMessage: data.fallbackMessage || '',
      geminiApiKeyMasked: data.geminiApiKeyMasked || null,
      isCustomGeminiKey: data.isCustomGeminiKey ?? false,
      geminiModel: data.geminiModel || 'gemini-3.5-flash-lite'
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
    const data = await api.post('/api/settings', settingsData);
    settings.update(s => ({ ...s, ...data }));
    try {
      const gStatus = await api.get('/api/gemini/status');
      geminiStatus.set(gStatus);
    } catch (e) {}
    showToast('Configuración guardada correctamente', 'success');
    return { success: true };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function saveGeminiConfig(apiKey, model) {
  try {
    const data = await api.post('/api/gemini/config', { apiKey, model });
    geminiStatus.set({
      configured: data.configured,
      isCustom: data.isCustom,
      maskedKey: data.maskedKey,
      model: data.model,
      hasGlobalKey: data.hasGlobalKey,
      supportsAudio: true
    });
    settings.update(s => ({
      ...s,
      geminiApiKeyMasked: data.maskedKey,
      isCustomGeminiKey: data.isCustom,
      geminiModel: data.model
    }));
    showToast('Configuración de Gemini actualizada para esta empresa', 'success');
    return { success: true, data };
  } catch (err) {
    showToast(err.message, 'error');
    return { success: false, error: err.message };
  }
}

export async function testGeminiApiKey(apiKey, model) {
  try {
    const res = await api.post('/api/gemini/test-key', { apiKey, model });
    return res;
  } catch (err) {
    throw err;
  }
}
