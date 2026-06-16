import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Purchases } from '@revenuecat/purchases-js';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { UpgradeModal } from '@/components/billing/UpgradeModal';

const BillingContext = createContext(null);

const RC_WEB_API_KEY = process.env.REACT_APP_RC_WEB_API_KEY || '';

/**
 * Centralised subscription state. Source of truth: the backend `/billing/status`
 * endpoint which reflects the user's MongoDB plan_tier (kept in sync with RevenueCat
 * via webhooks). The RevenueCat Web SDK is initialised lazily so the page still works
 * for users who never open the paywall.
 */
export function BillingProvider({ children }) {
  const { user } = useAuth();
  const [status, setStatus] = useState(null); // { plan_tier, is_pro, is_trial, limits, usage, ... }
  const [loading, setLoading] = useState(false);
  const [rcReady, setRcReady] = useState(false);
  const rcInstanceRef = useRef(null);
  // Global upgrade-modal state driven by 402 events from the axios interceptor
  const [upgradeModal, setUpgradeModal] = useState({ open: false, title: '', reason: '', feature: '' });

  // Load billing status whenever the authenticated user changes
  const refresh = useCallback(async () => {
    if (!user) {
      setStatus(null);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get('/billing/status');
      setStatus(data);
    } catch (err) {
      console.warn('billing/status load failed:', err?.message || err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Listen for 402 events emitted by the axios interceptor and show a friendly modal
  useEffect(() => {
    const handler = (e) => {
      const { code, kind, message, limit, current, planTier } = e.detail || {};
      const isLimit = code === 'FREE_LIMIT_REACHED';
      const featureLabel = (() => {
        if (kind === 'clients') return 'Adding more clients';
        if (kind === 'invoices') return 'Creating more invoices';
        if (kind === 'quotations') return 'Creating more quotations';
        return null;
      })();
      setUpgradeModal({
        open: true,
        title: isLimit ? 'You\u2019ve hit your Free plan limit' : 'Unlock with Lancely Pro',
        reason: message || (planTier === 'free' ? 'This feature is part of the Pro plan.' : 'This feature is part of the Pro plan.'),
        feature: featureLabel || (isLimit ? `Free plan limit: ${current}/${limit}` : 'This feature'),
      });
    };
    window.addEventListener('lancely:upgrade-required', handler);
    return () => window.removeEventListener('lancely:upgrade-required', handler);
  }, []);

  // Lazy RevenueCat init — only when we have a logged-in user AND a configured API key
  const ensureRevenueCat = useCallback(async () => {
    if (!RC_WEB_API_KEY) {
      console.warn('RevenueCat: REACT_APP_RC_WEB_API_KEY is not set — checkout disabled');
      return null;
    }
    if (!user) return null;
    if (rcInstanceRef.current) return rcInstanceRef.current;
    try {
      const instance = Purchases.configure({
        apiKey: RC_WEB_API_KEY,
        appUserId: user.id,
      });
      rcInstanceRef.current = instance;
      setRcReady(true);
      return instance;
    } catch (err) {
      console.error('RevenueCat init failed:', err);
      return null;
    }
  }, [user]);

  // Trigger a server-side refresh of the user's RC entitlements (used right after checkout)
  const refreshFromRevenueCat = useCallback(async () => {
    try {
      const { data } = await api.post('/billing/refresh');
      await refresh();
      return data;
    } catch (err) {
      console.warn('billing/refresh failed:', err?.message || err);
      return null;
    }
  }, [refresh]);

  const value = {
    status,
    loading,
    rcReady,
    isPro: !!status?.is_pro,
    isTrial: !!status?.is_trial,
    planTier: status?.plan_tier || 'free',
    limits: status?.limits || {},
    usage: status?.usage || {},
    trialEndsAt: status?.trial_ends_at || null,
    currentPeriodEnd: status?.current_period_end || null,
    refresh,
    ensureRevenueCat,
    refreshFromRevenueCat,
  };

  return (
    <BillingContext.Provider value={value}>
      {children}
      <UpgradeModal
        open={upgradeModal.open}
        onOpenChange={(o) => setUpgradeModal((m) => ({ ...m, open: o }))}
        title={upgradeModal.title}
        reason={upgradeModal.reason}
        feature={upgradeModal.feature}
      />
    </BillingContext.Provider>
  );
}

export function useBilling() {
  const ctx = useContext(BillingContext);
  if (!ctx) throw new Error('useBilling must be used within BillingProvider');
  return ctx;
}
