import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { api, clearToken, setToken, getToken } from "./api";
import { signInWithApple as appleSignIn } from "./appleAuth";
import { configureRevenueCat, hasProEntitlement } from "./revenuecat";
import type { User } from "./types";

type LoginResp = { token: string; user: User };

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string, businessName?: string) => Promise<void>;
  signInWithApple: () => Promise<{ cancelled: boolean }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const applyUser = useCallback(async (u: User) => {
    // Pro state lives on RevenueCat (shared backend doesn't track it). Best-effort check.
    let isPro = false;
    try { isPro = await hasProEntitlement(); } catch { /* noop */ }
    const next = { ...u, is_pro: isPro };
    setUser(next);
    if (u.id) {
      try { await configureRevenueCat(u.id); } catch { /* noop */ }
    }
  }, []);

  const fetchMe = useCallback(async () => {
    try {
      const tok = await getToken();
      if (!tok) {
        setUser(null);
        return;
      }
      const me = await api<User>("/auth/me");
      await applyUser(me);
    } catch {
      await clearToken();
      setUser(null);
    }
  }, [applyUser]);

  useEffect(() => {
    (async () => {
      await fetchMe();
      setLoading(false);
    })();
  }, [fetchMe]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api<LoginResp>("/auth/login", {
      method: "POST",
      auth: false,
      body: { email: email.trim().toLowerCase(), password },
    });
    await setToken(res.token);
    await applyUser(res.user);
  }, [applyUser]);

  const signUp = useCallback(async (
    email: string,
    password: string,
    name: string,
    businessName?: string,
  ) => {
    const res = await api<LoginResp>("/auth/register", {
      method: "POST",
      auth: false,
      body: {
        email: email.trim().toLowerCase(),
        password,
        name: name.trim(),
        business_name: (businessName ?? "").trim(),
      },
    });
    await setToken(res.token);
    await applyUser(res.user);
  }, [applyUser]);

  const signOut = useCallback(async () => {
    await clearToken();
    setUser(null);
  }, []);

  const signInWithApple = useCallback(async () => {
    const credential = await appleSignIn();
    if (!credential) return { cancelled: true };
    const res = await api<LoginResp>("/auth/apple", {
      method: "POST",
      auth: false,
      body: {
        identity_token: credential.identityToken,
        authorization_code: credential.authorizationCode,
        email: credential.email,
        full_name: credential.fullName,
        apple_user: credential.user,
      },
    });
    await setToken(res.token);
    await applyUser(res.user);
    return { cancelled: false };
  }, [applyUser]);

  return (
    <AuthContext.Provider
      value={{ user, loading, signIn, signUp, signInWithApple, signOut, refresh: fetchMe }}
    >
      {children}
    </AuthContext.Provider>
  );
}
