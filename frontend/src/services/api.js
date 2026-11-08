// frontend/src/services/api.js
// Centralized API client with automatic token and company injection

const TOKEN_KEY = 'whatsapp_bot_token';
const COMPANY_KEY = 'whatsapp_bot_company_id';

export function getStoredToken() {
    return localStorage.getItem(TOKEN_KEY) || null;
}

export function setStoredToken(token) {
    if (token) {
        localStorage.setItem(TOKEN_KEY, token);
    } else {
        localStorage.removeItem(TOKEN_KEY);
    }
}

export function getStoredCompanyId() {
    return localStorage.getItem(COMPANY_KEY) || null;
}

export function setStoredCompanyId(id) {
    if (id) {
        localStorage.setItem(COMPANY_KEY, id);
    } else {
        localStorage.removeItem(COMPANY_KEY);
    }
}

// Callback for 401 unauthorized
let onUnauthorizedCallback = null;
export function setUnauthorizedHandler(cb) {
    onUnauthorizedCallback = cb;
}

export async function apiRequest(endpoint, options = {}) {
    const token = getStoredToken();
    const companyId = getStoredCompanyId();

    options.headers = options.headers || {};
    const isFormData = options.body instanceof FormData;

    if (
        !isFormData &&
        !options.headers['Content-Type'] &&
        options.method &&
        options.method !== 'GET'
    ) {
        options.headers['Content-Type'] = 'application/json';
    }

    if (
        token &&
        !options.headers['Authorization'] &&
        !options.headers['authorization']
    ) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }

    let url = endpoint;
    const isGlobalEndpoint =
        url.startsWith('/api/auth/') ||
        url === '/api/companies' ||
        url.startsWith('/api/superadmin/');

    if (companyId && companyId !== 'null' && companyId !== 'undefined') {
        if (!isGlobalEndpoint && !options.headers['x-company-id']) {
            options.headers['x-company-id'] = companyId;
        }

        // Ensure companyId query parameter in company-scoped /api/ calls
        if (!isGlobalEndpoint && url.startsWith('/api/') && !url.includes('companyId=')) {
            const separator = url.includes('?') ? '&' : '?';
            url = `${url}${separator}companyId=${encodeURIComponent(companyId)}`;
        }
    }

    const response = await fetch(url, options);

    if (
        response.status === 401 &&
        !url.includes('/api/auth/login') &&
        !url.includes('/api/auth/register')
    ) {
        if (onUnauthorizedCallback) {
            onUnauthorizedCallback();
        }
    }

    const contentType = response.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
        data = await response.json();
    } else {
        data = await response.text();
    }

    if (!response.ok) {
        let errorMsg = `Error HTTP ${response.status}`;
        if (data) {
            if (typeof data === 'string' && data.trim()) {
                errorMsg = data;
            } else if (Array.isArray(data.message)) {
                errorMsg = data.message.join(', ');
            } else if (
                data.message &&
                typeof data.message === 'string' &&
                (!data.error ||
                    [
                        'Bad Request',
                        'Unauthorized',
                        'Forbidden',
                        'Not Found',
                        'Internal Server Error',
                    ].includes(data.error))
            ) {
                errorMsg = data.message;
            } else if (data.error && typeof data.error === 'string') {
                errorMsg = data.error;
            } else if (data.message && typeof data.message === 'string') {
                errorMsg = data.message;
            }
        }
        const err = new Error(errorMsg);
        err.status = response.status;
        err.data = data;
        throw err;
    }

    return data;
}

export const api = {
    get: (url, options) => apiRequest(url, { ...options, method: 'GET' }),
    post: (url, body, options) =>
        apiRequest(url, {
            ...options,
            method: 'POST',
            body: body instanceof FormData ? body : JSON.stringify(body),
        }),
    put: (url, body, options) =>
        apiRequest(url, {
            ...options,
            method: 'PUT',
            body: body instanceof FormData ? body : JSON.stringify(body),
        }),
    delete: (url, body, options) => {
        const opts = options || {};
        if (body && !(body instanceof Event)) {
            opts.body = body instanceof FormData ? body : JSON.stringify(body);
        }
        return apiRequest(url, { ...opts, method: 'DELETE' });
    },
    upload: async (file, category = 'rules') => {
        if (file.size > 50 * 1024 * 1024) {
            throw new Error(
                'El archivo supera los 50 MB. Por favor elige un archivo más liviano.',
            );
        }

        const base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        const res = await api.post('/api/upload', {
            filename: file.name,
            mimetype: file.type || 'application/octet-stream',
            data: base64Data,
            folder: category,
        });

        const fileObj = res.file || {
            url: res.url,
            filename: res.filename || file.name,
            mimetype: res.mimetype || file.type,
            size: res.size || file.size,
        };

        return {
            success: true,
            file: fileObj,
            ...fileObj,
        };
    },
};
