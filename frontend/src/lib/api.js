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
    if (err?.response?.status === 402) {
      // Pro-gating: surface a global event the UI can listen to and show a friendly modal.
      const detail = err?.response?.data?.detail || {};
      try {
        window.dispatchEvent(new CustomEvent('lancely:upgrade-required', {
          detail: {
            code: detail.code,
            kind: detail.kind,
            message: detail.message,
            limit: detail.limit,
            current: detail.current,
            planTier: detail.plan_tier,
            trialEndsAt: detail.trial_ends_at,
          },
        }));
      } catch (dispatchErr) {
        // CustomEvent unsupported (very old browsers / non-DOM environments) — log so we don't lose context.
        console.warn('Failed to dispatch upgrade-required event:', dispatchErr);
      }
    }
    return Promise.reject(err);
  }
);

const LOCALE_MAP = {
  AED: 'en-AE',
  USD: 'en-US',
  EUR: 'en-GB',
  GBP: 'en-GB',
  SAR: 'en-SA',
  INR: 'en-IN',
};

export function formatMoney(amount, currency = 'AED') {
  const n = Number(amount || 0);
  const cur = (currency || 'AED').toUpperCase();
  const locale = LOCALE_MAP[cur] || 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(n);
  } catch {
    return `${cur} ${n.toFixed(2)}`;
  }
}

// Backwards compatibility alias
export const formatAED = (a) => formatMoney(a, 'AED');

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

export function csvUrl(entity) {
  const token = localStorage.getItem('lancely_token');
  return `${API_BASE}/export/${entity}.csv?token=${encodeURIComponent(token || '')}`;
}
