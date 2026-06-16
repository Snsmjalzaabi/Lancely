import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';

const AuthContext = createContext(null);

const TOKEN_KEY = 'lancely_token';
const USER_KEY = 'lancely_user';

// NOTE: Token is stored in localStorage rather than an httpOnly cookie. This is a deliberate
// trade-off so that PDF/CSV download URLs (which open in new tabs via window.open) can pass the
// token as a query string. Migrating to httpOnly cookies would require backend Set-Cookie
// handling, CSRF protection, and a different download strategy. Mitigations applied:
//   1) Strict CSP and sanitized HTML in the email composer modal (no eval/innerHTML).
//   2) Token is short-lived (7 days) and tied to a strong JWT secret.
//   3) No third-party scripts are loaded that could read localStorage.
function readUserFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch (err) {
    console.warn('Failed to parse cached user from localStorage:', err);
    return null;
  }
}

function writeAuth(token, user) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (err) {
    console.error('Failed to persist auth to localStorage:', err);
  }
}

function clearAuth() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch (err) {
    console.warn('Failed to clear auth from localStorage:', err);
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readUserFromStorage());
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
      try { localStorage.setItem(USER_KEY, JSON.stringify(data)); } catch (err) { console.warn('Failed to cache user:', err); }
    } catch (err) {
      console.warn('Auth refresh failed; clearing session:', err?.message || err);
      clearAuth();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    writeAuth(data.token, data.user);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    writeAuth(data.token, data.user);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
