/**
 * FastAPI client for Bet Scanner.
 *
 * Set EXPO_PUBLIC_API_URL in mobile/.env:
 *   Physical phone (tunnel / any network):  https://bet-scanner-znvg.onrender.com
 *   Same Wi‑Fi LAN:                        http://YOUR_MAC_IP:8000  (+ uvicorn --host 0.0.0.0)
 *   iOS Simulator:                         http://127.0.0.1:8000
 *   Android Emulator:                      http://10.0.2.2:8000
 */

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ||
  'https://bet-scanner-znvg.onrender.com';

const DEFAULT_TIMEOUT_MS = 12000;

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

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<T>;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(
        `Timed out reaching ${API_URL}. Phone cannot use localhost — use Render URL or Mac LAN IP on same Wi‑Fi.`
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function getJson<T>(path: string): Promise<T> {
  return fetchJson<T>(path);
}

export async function postJson<T>(path: string, body: unknown = {}): Promise<T> {
  return fetchJson<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export type HealthResponse = {
  status: string;
  env?: string;
  version?: string;
};

export function pingHealth() {
  return getJson<HealthResponse>('/health');
}
