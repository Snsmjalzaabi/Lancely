import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Platform } from "react-native";

import { api, clearToken, setToken, getToken } from "./api";
import { configureRevenueCat } from "./revenuecat";
import type { User } from "./types";

type AuthState = {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInDemo: () => Promise<void>;
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

  const fetchMe = useCallback(async () => {
    try {
      const tok = await getToken();
      if (!tok) {
        setUser(null);
        return;
      }
      const me = await api<User>("/auth/me");
      setUser(me);
      // Configure RevenueCat with our backend user id so receipts are bound
      // to the same user across devices. Safe to call repeatedly.
      if (me?.user_id) {
        await configureRevenueCat(me.user_id);
      }
    } catch {
      await clearToken();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchMe();
      setLoading(false);
    })();
  }, [fetchMe]);

  const exchangeSessionId = useCallback(async (sessionId: string) => {
    const res = await api<{ session_token: string; user: User }>("/auth/session", {
      method: "POST",
      auth: false,
      body: { session_id: sessionId },
    });
    await setToken(res.session_token);
    setUser(res.user);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const redirectUrl =
      Platform.OS === "web"
        ? `${(globalThis as { location?: { origin?: string } }).location?.origin ?? ""}/`
        : Linking.createURL("auth");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

    if (Platform.OS === "web") {
      (globalThis as { location?: { href?: string } }).location!.href = authUrl;
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    if (result.type !== "success" || !result.url) return;
    // session_id may arrive as hash or query
    const url = result.url;
    const hashIdx = url.indexOf("#");
    const fragment = hashIdx >= 0 ? url.slice(hashIdx + 1) : "";
    const queryIdx = url.indexOf("?");
    const query = queryIdx >= 0 ? url.slice(queryIdx + 1, hashIdx >= 0 ? hashIdx : undefined) : "";
    const params = new URLSearchParams(fragment || query);
    const sessionId = params.get("session_id");
    if (!sessionId) return;
    await exchangeSessionId(sessionId);
  }, [exchangeSessionId]);

  const signInDemo = useCallback(async () => {
    // Demo affordance — uses the same auth endpoint with a well-known demo session id
    // handled by the Emergent OAuth dev server. If unavailable, falls back to local-only demo.
    try {
      const res = await api<{ session_token: string; user: User }>("/auth/demo-session", {
        method: "POST",
        auth: false,
      });
      await setToken(res.session_token);
      setUser(res.user);
    } catch (e) {
      throw e;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    await clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, signInWithGoogle, signInDemo, signOut, refresh: fetchMe }}
    >
      {children}
    </AuthContext.Provider>
  );
}
