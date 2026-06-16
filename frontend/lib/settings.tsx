// Lancely settings provider — bridges the web shared backend's user record + currencies.
// Note: the shared backend stores currency/theme on the User itself (PUT /api/auth/me).
// Other UI-only settings (timezone, accent_color, logo_base64, business_name, report_columns)
// no longer persist server-side; we keep them in memory for the session so the UI keeps working.
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { api } from "./api";
import { useAuth } from "./auth";
import { setActiveCurrency } from "./format";
import type { CurrencyOption, User } from "./types";

export type UserSettings = {
  currency: string;
  timezone: string;
  accent_color: string | null;
  logo_base64: string | null;
  business_name: string;
  report_columns?: Record<string, string[]>;
};

export type SettingsOptions = {
  currencies: string[];
  timezones: string[];
  accent_swatches: string[];
};

const DEFAULTS: UserSettings = {
  currency: "AED",
  timezone: "device",
  accent_color: null,
  logo_base64: null,
  business_name: "",
  report_columns: {},
};

const DEFAULT_OPTIONS: SettingsOptions = {
  currencies: ["AED", "USD", "EUR", "GBP", "SAR", "INR"],
  timezones: ["device", "UTC", "Asia/Dubai", "Asia/Riyadh", "America/New_York", "Europe/London", "Asia/Kolkata"],
  accent_swatches: ["#5b3df0", "#8b5cf6", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899"],
};

type Ctx = {
  settings: UserSettings;
  options: SettingsOptions | null;
  loading: boolean;
  update: (patch: Partial<UserSettings>) => Promise<void>;
};

const SettingsContext = createContext<Ctx | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { user, refresh } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(DEFAULTS);
  const [options, setOptions] = useState<SettingsOptions | null>(DEFAULT_OPTIONS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setSettings(DEFAULTS);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Currency + business_name + theme live on the user record itself.
        // Currencies list comes from /api/currencies.
        const [currencies] = await Promise.all([
          api<CurrencyOption[]>("/currencies").catch(() => [] as CurrencyOption[]),
        ]);
        if (cancelled) return;
        const list = currencies.length ? currencies.map((c) => c.code) : DEFAULT_OPTIONS.currencies;
        setOptions({ ...DEFAULT_OPTIONS, currencies: list });
        const merged: UserSettings = {
          ...DEFAULTS,
          currency: user.currency || "AED",
          business_name: user.business_name || "",
        };
        setSettings(merged);
        setActiveCurrency(merged.currency);
      } catch {
        if (!cancelled) setSettings(DEFAULTS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const update = useCallback(
    async (patch: Partial<UserSettings>) => {
      const next = { ...settings, ...patch };
      // optimistic
      setSettings(next);
      setActiveCurrency(next.currency || "AED");
      // Only currency, business_name, theme persist server-side.
      const serverPatch: Partial<User> = {};
      if (patch.currency !== undefined) serverPatch.currency = patch.currency;
      if (patch.business_name !== undefined) serverPatch.business_name = patch.business_name;
      if (Object.keys(serverPatch).length === 0) return;
      try {
        await api<User>("/auth/me", { method: "PUT", body: serverPatch });
        await refresh();
      } catch (e) {
        // revert on failure
        setSettings(settings);
        throw e;
      }
    },
    [settings, refresh],
  );

  return (
    <SettingsContext.Provider value={{ settings, options, loading, update }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
