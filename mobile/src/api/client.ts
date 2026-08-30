/**
 * FastAPI client for Bet Scanner.
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
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<T>;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(
        `Timed out reaching ${API_URL} (${Math.round(timeoutMs / 1000)}s). ` +
          `If this is Render free tier, open the URL in a browser to wake it, wait ~1 min, then Refresh. ` +
          `Or point EXPO_PUBLIC_API_URL at your Mac LAN IP while uvicorn --host 0.0.0.0 runs.`
      );
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
    if (msg.includes('Timed out') || msg.includes('Network request failed')) {
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

export type HealthResponse = {
  status: string;
  env?: string;
  version?: string;
};

export function pingHealth() {
  return getJson<HealthResponse>('/health');
}
