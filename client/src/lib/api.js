import axios from 'axios';

// In development: Vite proxies /api → localhost:3001
// In production:  set VITE_API_URL=https://your-backend.railway.app
const API_ORIGIN = import.meta.env.VITE_API_URL || '';

const api = axios.create({ baseURL: `${API_ORIGIN}/api` });

// Attach JWT token to every axios request automatically
api.interceptors.request.use(config => {
  const token = localStorage.getItem('crm_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Helper for raw fetch() calls — auto-attaches JWT token
export function apiFetch(path, options = {}) {
  const token = localStorage.getItem('crm_token');
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  return fetch(`${API_ORIGIN}${path}`, { ...options, headers });
}

export default api;
