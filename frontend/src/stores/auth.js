// frontend/src/stores/auth.js
import { writable, derived, get } from 'svelte/store';
import {
    api,
    getStoredToken,
    setStoredToken,
    setStoredCompanyId,
    setUnauthorizedHandler,
} from '../services/api';
import { showToast } from './toast';
import { activeTab } from './ui';
import { clearSuperadminStores } from './superadmin';
import { clearCompanyStores, companies, currentCompanyId } from './company';
import { rules } from './rules';
import {
    leads,
    selectedLead,
    selectedChatLead,
    chatMessages,
    stopCompanyRealtimeEvents,
} from './leads';
import { contacts } from './contacts';
import { groups } from './groups';
import { schedules } from './schedules';
import { documents, libraryStats } from './library';
import { teamMembers, companyRoles } from './team';
import { botStatus, stopStatusPolling } from './botStatus';

export const currentUser = writable(null);
export const userMembership = writable(null);
export const authToken = writable(getStoredToken());
export const permissions = writable(new Set());
export const isAuthModalOpen = writable(false);
export const pendingResetData = writable(null); // { token, email }

export const isAuthenticated = derived(
    [currentUser, authToken],
    ([$user, $token]) => !!($user && $token),
);

export const isSuperadmin = derived(currentUser, ($user) =>
    Boolean($user?.isSuperadmin),
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
        clearAllUserData();
        return false;
    }

    try {
        const data = await api.get('/api/auth/me');
        currentUser.set(data.user);
        userMembership.set(data.membership || null);
        const permsList = data.membership?.permissions || [];
        permissions.set(new Set(permsList));

        if (data.companies) {
            companies.set(data.companies);
        }

        const currentId = get(currentCompanyId) || getStoredCompanyId();
        const userComps = data.companies || [];
        const isValid = userComps.some((c) => c.id === currentId);
        const activeCompId = isValid
            ? currentId
            : data.activeCompany?.id || userComps[0]?.id || null;
        if (activeCompId) {
            currentCompanyId.set(activeCompId);
            setStoredCompanyId(activeCompId);
        }

        if (!data.user?.isSuperadmin) {
            clearSuperadminStores();
            if (get(activeTab) === 'tab-superadmin') {
                activeTab.set('tab-rules');
            }
        }

        isAuthModalOpen.set(false);
        return true;
    } catch (err) {
        clearAllUserData();
        return false;
    }
}

export async function login(identifier, password) {
    try {
        const data = await api.post('/api/auth/login', {
            identifier,
            password,
        });
        if (!data.token) throw new Error('Respuesta inválida del servidor');

        setStoredToken(data.token);
        authToken.set(data.token);
        currentUser.set(data.user);
        userMembership.set(data.membership || null);

        if (data.companies) {
            companies.set(data.companies);
        }

        const activeCompId =
            data.activeCompany?.id ||
            (data.companies && data.companies[0]?.id) ||
            null;
        if (activeCompId) {
            currentCompanyId.set(activeCompId);
            setStoredCompanyId(activeCompId);
        }

        const permsList = data.membership?.permissions || [];
        permissions.set(new Set(permsList));

        // Si el usuario que ingresa NO es superadmin, limpiar datos y salir del panel superadmin
        if (!data.user?.isSuperadmin) {
            clearSuperadminStores();
            if (get(activeTab) === 'tab-superadmin') {
                activeTab.set('tab-rules');
            }
        }

        isAuthModalOpen.set(false);

        showToast(
            `¡Bienvenido de vuelta, ${data.user.fullName || data.user.username}!`,
            'success',
        );
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

export async function register(fullName, email, password, companyName) {
    try {
        const data = await api.post('/api/auth/register', {
            fullName: (fullName || '').trim(),
            email: (email || '').trim(),
            password,
            companyName: companyName ? companyName.trim() : undefined,
        });
        if (!data.token) throw new Error('Respuesta inválida del servidor');

        setStoredToken(data.token);
        authToken.set(data.token);
        currentUser.set(data.user);
        userMembership.set(data.membership || null);

        const compId = data.activeCompanyId || data.company?.id;
        if (data.companies) {
            companies.set(data.companies);
        }
        if (compId) {
            currentCompanyId.set(compId);
            setStoredCompanyId(compId);
        }

        const permsList = data.membership?.permissions || ['*'];
        permissions.set(new Set(permsList));
        clearSuperadminStores();
        if (get(activeTab) === 'tab-superadmin') {
            activeTab.set('tab-rules');
        }
        isAuthModalOpen.set(false);

        showToast(
            `¡Cuenta creada con éxito! Bienvenido, ${data.user.fullName}!`,
            'success',
        );
        return { success: true, activeCompanyId: compId };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

export async function forgotPassword(email) {
    try {
        const data = await api.post('/api/auth/forgot-password', { email });
        showToast(data.message || 'Correo de recuperación enviado.', 'info');
        return { success: true, message: data.message };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

export async function resetPassword({ email, code, token, newPassword }) {
    try {
        const data = await api.post('/api/auth/reset-password', {
            email,
            code,
            token,
            newPassword,
        });
        showToast(
            data.message || 'Contraseña actualizada con éxito.',
            'success',
        );
        return { success: true, message: data.message };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

export function clearAllUserData() {
    setStoredToken(null);
    authToken.set(null);
    currentUser.set(null);
    userMembership.set(null);
    permissions.set(new Set());
    clearSuperadminStores();

    // Limpiar stores de datos del usuario y empresa para que nada quede en memoria ni en DOM
    clearCompanyStores();
    rules.set([]);
    leads.set([]);
    selectedLead.set(null);
    selectedChatLead.set(null);
    chatMessages.set([]);
    contacts.set([]);
    groups.set([]);
    schedules.set([]);
    documents.set([]);
    libraryStats.set({ activeDocuments: 0, totalWords: 0 });
    teamMembers.set([]);
    companyRoles.set([]);
    botStatus.set({
        status: 'disconnected',
        phone: '',
        qrCode: null,
        botEnabled: false,
        companyName: '',
        pendingSchedulesCount: 0,
    });

    stopStatusPolling();
    stopCompanyRealtimeEvents();

    activeTab.set('tab-rules');
    isAuthModalOpen.set(true);
}

export function logout(notify = true) {
    clearAllUserData();
    if (notify) {
        showToast('Sesión cerrada correctamente', 'info');
    }
}

export async function changePassword(currentPassword, newPassword) {
    try {
        await api.post('/api/auth/change-password', {
            currentPassword,
            newPassword,
        });
        showToast('Contraseña actualizada exitosamente', 'success');
        currentUser.update((curr) =>
            curr ? { ...curr, mustChangePassword: false } : null,
        );
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

export async function updateProfile(profileData) {
    try {
        const res = await api.put('/api/auth/profile', profileData);
        if (res.user) {
            currentUser.update((curr) => ({ ...curr, ...res.user }));
        }
        showToast('Perfil actualizado exitosamente', 'success');
        return { success: true, user: res.user };
    } catch (err) {
        return { success: false, error: err.message };
    }
}
