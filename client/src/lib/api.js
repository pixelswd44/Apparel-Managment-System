import axios from 'axios';

// In development: Vite proxies /api → localhost:3001
// In production:  set VITE_API_URL=https://your-backend.railway.app
const API_ORIGIN = import.meta.env.VITE_API_URL || '';

const api = axios.create({ baseURL: `${API_ORIGIN}/api` });

// Helper for raw fetch() calls — keeps them pointing to the right backend
export function apiFetch(path, options = {}) {
  return fetch(`${API_ORIGIN}${path}`, options);
}

export default api;
