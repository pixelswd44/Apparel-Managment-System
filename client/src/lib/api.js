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

// Resolve a stored image path to an absolute URL.
// Paths are saved as "/uploads/filename" (relative).  When the frontend and
// backend run on different origins (VITE_API_URL is set), we must prepend the
// backend origin so the browser fetches from the right server.
export function imgUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) return path;
  return `${API_ORIGIN}${path}`;
}

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
