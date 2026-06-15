import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { api } from "./api";
import { useAuth } from "./auth";
import { setActiveCurrency } from "./format";

export type UserSettings = {
  currency: string;
  timezone: string;
  accent_color: string | null;
  logo_base64: string | null;
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
};

type Ctx = {
  settings: UserSettings;
  options: SettingsOptions | null;
  loading: boolean;
  update: (patch: Partial<UserSettings>) => Promise<void>;
};

const SettingsContext = createContext<Ctx | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(DEFAULTS);
  const [options, setOptions] = useState<SettingsOptions | null>(null);
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
        const [s, o] = await Promise.all([
          api<UserSettings>("/me/settings"),
          api<SettingsOptions>("/settings/options"),
        ]);
        if (!cancelled) {
          setSettings(s);
          setOptions(o);
          setActiveCurrency(s.currency || "AED");
        }
      } catch {
        if (!cancelled) setSettings(DEFAULTS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const update = useCallback(
    async (patch: Partial<UserSettings>) => {
      const next = { ...settings, ...patch };
      // optimistic
      setSettings(next);
      try {
        const saved = await api<UserSettings>("/me/settings", { method: "PUT", body: next });
        setSettings(saved);
        setActiveCurrency(saved.currency || "AED");
      } catch (e) {
        // revert on failure
        setSettings(settings);
        throw e;
      }
    },
    [settings],
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
