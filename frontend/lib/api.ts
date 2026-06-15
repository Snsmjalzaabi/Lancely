import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "lancely_session_token";

export async function getToken(): Promise<string | null> {
  const tok = await storage.secureGet<string>(TOKEN_KEY, "");
  return tok ? tok : null;
}

export async function setToken(token: string): Promise<void> {
  await storage.secureSet(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await storage.secureRemove(TOKEN_KEY);
}

type ReqOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  auth?: boolean;
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
  const { method = "GET", body, query, auth = true } = opts;
  let url = `${BASE}/api${path}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") qs.append(k, String(v));
    }
    const q = qs.toString();
    if (q) url += `?${q}`;
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const tok = await getToken();
    if (tok) headers["Authorization"] = `Bearer ${tok}`;
  }
  const resp = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  const data = text ? safeJson(text) : null;
  if (!resp.ok) {
    const msg = (data as { detail?: string } | null)?.detail || `Request failed (${resp.status})`;
    throw new ApiError(msg, resp.status, data);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
