/**
 * FastAPI client for Bet Scout.
 *
 * Set EXPO_PUBLIC_API_URL in mobile/.env:
 *   Physical phone (tunnel / any network):  https://bet-scanner-znvg.onrender.com
 *   Same Wi‑Fi LAN:                        http://YOUR_MAC_IP:8000  (+ uvicorn --host 0.0.0.0)
 *   iOS Simulator:                         http://127.0.0.1:8000
 *   Android Emulator:                      http://10.0.2.2:8000
 */

import { loadAccessKey } from '../store/accessKey';
import { getAccessToken } from '../store/session';

function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  // Expo web served from FastAPI (/) — API is same origin.
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'https://bet-scanner-znvg.onrender.com';
}

export const API_URL = resolveApiUrl();

/** Render free tier can take 30–60s to wake from sleep. */
const DEFAULT_TIMEOUT_MS = 55000;

const TIMEOUT_USER_MSG =
  'The server is taking too long to respond. Pull down to try again in a moment.';
const NETWORK_USER_MSG =
  'Could not connect to Bet Scout. Check your internet and try again.';

let cachedAccessKey: string | null = null;

/** Call after saving the access key on Me / setup. */
export function setCachedAccessKey(key: string | null) {
  cachedAccessKey = key?.trim() || null;
}

async function resolveAccessKey(): Promise<string> {
  if (cachedAccessKey != null) return cachedAccessKey;
  const k = await loadAccessKey();
  cachedAccessKey = k;
  return k;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function isAuthError(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 401 || e.status === 403);
}

/** Short copy for status lines / alerts — never dump env URLs or setup hints. */
export function userFacingError(e: unknown): string {
  if (isAuthError(e)) return 'Please sign in and try again.';
  const msg = e instanceof Error ? e.message : String(e);
  if (
    msg === TIMEOUT_USER_MSG ||
    msg.includes('Timed out') ||
    (e instanceof Error && e.name === 'AbortError')
  ) {
    return TIMEOUT_USER_MSG;
  }
  if (
    msg === NETWORK_USER_MSG ||
    msg.includes('Network request failed') ||
    msg.includes('Failed to fetch') ||
    msg.includes('Load failed')
  ) {
    return NETWORK_USER_MSG;
  }
  if (msg.length > 140) return `${msg.slice(0, 120).trim()}…`;
  return msg || 'Something went wrong. Try again.';
}

async function parseError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    if (typeof j.detail === 'string') return j.detail;
    return text.slice(0, 280);
  } catch {
    return text.slice(0, 280) || res.statusText;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const key = await resolveAccessKey();
  if (key) headers['X-API-Key'] = key;
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchOnce<T>(path: string, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        ...(await authHeaders()),
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) throw new ApiError(await parseError(res), res.status);
    return res.json() as Promise<T>;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(TIMEOUT_USER_MSG);
    }
    if (
      e instanceof TypeError ||
      (e instanceof Error &&
        (e.message.includes('Network request failed') || e.message.includes('Failed to fetch')))
    ) {
      throw new Error(NETWORK_USER_MSG);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  try {
    return await fetchOnce<T>(path, init, timeoutMs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // One retry — often the first call only woke the dyno
    if (msg === TIMEOUT_USER_MSG || msg === NETWORK_USER_MSG) {
      return fetchOnce<T>(path, init, timeoutMs);
    }
    throw e;
  }
}

export async function getJson<T>(path: string, opts?: { timeoutMs?: number }): Promise<T> {
  return fetchJson<T>(path, undefined, opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
}

export async function postJson<T>(
  path: string,
  body: unknown = {},
  opts?: { timeoutMs?: number }
): Promise<T> {
  return fetchJson<T>(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
}

export async function deleteJson<T>(path: string): Promise<T> {
  return fetchJson<T>(path, { method: 'DELETE' });
}

export type HealthResponse = {
  status: string;
  env?: string;
  version?: string;
  db_ok?: boolean;
};

export function pingHealth() {
  return getJson<HealthResponse>('/health', { timeoutMs: 10000 });
}
