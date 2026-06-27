import { createContext, useContext, useState, useEffect } from 'react';
import api from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // Set/clear axios Authorization header
  function applyToken(token) {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      localStorage.setItem('crm_token', token);
    } else {
      delete api.defaults.headers.common['Authorization'];
      localStorage.removeItem('crm_token');
    }
  }

  // On mount — restore session from localStorage
  useEffect(() => {
    const token = localStorage.getItem('crm_token');
    if (!token) { setLoading(false); return; }
    applyToken(token);
    api.get('/auth/me')
      .then(r => setUser(r.data))
      .catch(() => { applyToken(null); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  async function login(username, password) {
    const { data } = await api.post('/auth/login', { username, password });
    applyToken(data.token);
    setUser(data.user);
    return data.user;
  }

  function logout() {
    applyToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Role-based permission map
export const ROLE_PERMISSIONS = {
  super_admin: ['/', '/quotations', '/invoices', '/products', '/projects', '/vendors', '/inventory', '/payroll', '/expenses', '/financials', '/clients', '/templates', '/settings'],
  sales:       ['/', '/quotations', '/invoices', '/clients'],
  inventory:   ['/', '/products', '/inventory'],
};

export function canAccess(user, path) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  const allowed = ROLE_PERMISSIONS[user.role] || [];
  return allowed.some(p => p === path || path.startsWith(p + '/'));
}
