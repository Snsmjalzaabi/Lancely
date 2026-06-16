import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('lancely_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      const path = window.location.pathname;
      if (path !== '/login' && path !== '/register') {
        localStorage.removeItem('lancely_token');
        localStorage.removeItem('lancely_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export function formatAED(amount) {
  const n = Number(amount || 0);
  try {
    return new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', minimumFractionDigits: 2 }).format(n);
  } catch {
    return `AED ${n.toFixed(2)}`;
  }
}

export function formatDate(d) {
  if (!d) return '-';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return d; }
}

export function pdfUrl(kind, id) {
  const token = localStorage.getItem('lancely_token');
  return `${API_BASE}/${kind}/${id}/pdf?token=${encodeURIComponent(token || '')}`;
}
