// frontend/src/stores/auth.js
import { writable, derived } from 'svelte/store';
import { api, getStoredToken, setStoredToken, setUnauthorizedHandler } from '../services/api';
import { showToast } from './toast';

export const currentUser = writable(null);
export const userMembership = writable(null);
export const authToken = writable(getStoredToken());
export const permissions = writable(new Set());
export const isAuthModalOpen = writable(false);

export const isAuthenticated = derived(
  [currentUser, authToken],
  ([$user, $token]) => !!($user && $token)
);

export const hasPermission = derived(permissions, ($perms) => {
  const isAdmin = $perms.has('*') || $perms.has('all') || $perms.has('admin');
  return (perm) => {
    if (isAdmin) return true;
    return $perms.has(perm);
  };
});

// Configure 401 callback in API client
setUnauthorizedHandler(() => {
  logout(false);
  isAuthModalOpen.set(true);
});

export async function checkAuth() {
  const token = getStoredToken();
  if (!token) {
    currentUser.set(null);
    userMembership.set(null);
    permissions.set(new Set());
    isAuthModalOpen.set(true);
    return false;
  }

  try {
    const data = await api.get('/api/auth/me');
    currentUser.set(data.user);
    userMembership.set(data.membership || null);
    const permsList = data.membership?.permissions || [];
    permissions.set(new Set(permsList));
    isAuthModalOpen.set(false);
    return true;
  } catch (err) {
    setStoredToken(null);
    authToken.set(null);
    currentUser.set(null);
    userMembership.set(null);
    permissions.set(new Set());
    isAuthModalOpen.set(true);
    return false;
  }
}

export async function login(identifier, password) {
  try {
    const data = await api.post('/api/auth/login', { identifier, password });
    if (!data.token) throw new Error('Respuesta inválida del servidor');

    setStoredToken(data.token);
    authToken.set(data.token);
    currentUser.set(data.user);
    userMembership.set(data.membership || null);

    const permsList = data.membership?.permissions || [];
    permissions.set(new Set(permsList));
    isAuthModalOpen.set(false);

    showToast(`¡Bienvenido de vuelta, ${data.user.fullName || data.user.username}!`, 'success');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export function logout(notify = true) {
  setStoredToken(null);
  authToken.set(null);
  currentUser.set(null);
  userMembership.set(null);
  permissions.set(new Set());
  isAuthModalOpen.set(true);
  if (notify) {
    showToast('Sesión cerrada correctamente', 'info');
  }
}

export async function changePassword(currentPassword, newPassword) {
  try {
    await api.post('/api/auth/change-password', { currentPassword, newPassword });
    showToast('Contraseña actualizada exitosamente', 'success');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
