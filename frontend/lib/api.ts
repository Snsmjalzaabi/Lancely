// Lancely shared-backend API client.
// Uses expo-secure-store for the JWT (key: "lancely_token"), auto-injects Bearer on every
// request, and clears the token on 401 so the app redirects to login.
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "lancely_token";

// SecureStore is unavailable on web — fall back to localStorage there.
async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}
async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try { globalThis.localStorage?.setItem(key, value); } catch { /* noop */ }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}
async function secureRemove(key: string): Promise<void> {
  if (Platform.OS === "web") {
    try { globalThis.localStorage?.removeItem(key); } catch { /* noop */ }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function getToken(): Promise<string | null> {
  return secureGet(TOKEN_KEY);
}
export async function setToken(token: string): Promise<void> {
  await secureSet(TOKEN_KEY, token);
}
export async function clearToken(): Promise<void> {
  await secureRemove(TOKEN_KEY);
}

type ReqOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  auth?: boolean;
  // Override default JSON Accept header (e.g. for CSV downloads)
  responseType?: "json" | "text" | "arraybuffer";
};

export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export async function api<T = unknown>(path: string, opts: ReqOptions = {}): Promise<T> {
  const { method = "GET", body, query, auth = true, responseType = "json" } = opts;
  let url = `${BASE}/api${path}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") qs.append(k, String(v));
    }
    const q = qs.toString();
    if (q) url += `?${q}`;
  }
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const tok = await getToken();
    if (tok) headers["Authorization"] = `Bearer ${tok}`;
  }
  const resp = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (resp.status === 401 && auth) {
    // Token invalid/expired — clear so app redirects to login
    await clearToken();
  }
  if (responseType === "arraybuffer") {
    if (!resp.ok) throw new ApiError(`Request failed (${resp.status})`, resp.status, null);
    const buf = await resp.arrayBuffer();
    return buf as unknown as T;
  }
  if (responseType === "text") {
    const text = await resp.text();
    if (!resp.ok) throw new ApiError(text || `Request failed (${resp.status})`, resp.status, text);
    return text as unknown as T;
  }
  const text = await resp.text();
  const data = text ? safeJson(text) : null;
  if (!resp.ok) {
    const msg = (data as { detail?: string } | null)?.detail || `Request failed (${resp.status})`;
    throw new ApiError(msg, resp.status, data);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return text; }
}

/** Build an absolute URL to a backend asset (e.g. for opening a PDF in the browser/sharing). */
export function absoluteUrl(path: string): string {
  return `${BASE}/api${path}`;
}
