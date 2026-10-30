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
  return localStorage.getItem(COMPANY_KEY) || 'default';
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

  if (!isFormData && !options.headers['Content-Type'] && options.method && options.method !== 'GET') {
    options.headers['Content-Type'] = 'application/json';
  }

  if (token && !options.headers['Authorization'] && !options.headers['authorization']) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  if (!options.headers['x-company-id']) {
    options.headers['x-company-id'] = companyId;
  }

  // Ensure companyId query parameter in /api/ calls
  let url = endpoint;
  if (url.startsWith('/api/') && !url.includes('companyId=')) {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}companyId=${encodeURIComponent(companyId)}`;
  }

  const response = await fetch(url, options);

  if (response.status === 401 && !url.includes('/api/auth/login') && !url.includes('/api/auth/register')) {
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
    const errorMsg = (data && data.error) ? data.error : (typeof data === 'string' && data ? data : `Error HTTP ${response.status}`);
    const err = new Error(errorMsg);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  get: (url, options) => apiRequest(url, { ...options, method: 'GET' }),
  post: (url, body, options) => apiRequest(url, {
    ...options,
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body)
  }),
  put: (url, body, options) => apiRequest(url, {
    ...options,
    method: 'PUT',
    body: body instanceof FormData ? body : JSON.stringify(body)
  }),
  delete: (url, options) => apiRequest(url, { ...options, method: 'DELETE' }),
  upload: async (file, category = 'rules') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);
    return apiRequest('/api/upload', {
      method: 'POST',
      body: formData
    });
  }
};
