import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TipPick } from '../types/api';
import { tipKey, tipKeyLoose } from '../lib/tipKey';

const KEY = 'bet_scanner_logged_tip_keys_v1';

type Listener = () => void;

let keys = new Set<string>();
let loaded = false;
let loadPromise: Promise<void> | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

async function ensureLoaded() {
  if (loaded) return;
  if (loadPromise) {
    await loadPromise;
    return;
  }
  loadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) keys = new Set(JSON.parse(raw) as string[]);
    } catch {
      keys = new Set();
    }
    loaded = true;
  })();
  await loadPromise;
}

async function persist() {
  await AsyncStorage.setItem(KEY, JSON.stringify([...keys]));
}

function addKeyVariants(raw: string, into: Set<string>) {
  const key = String(raw || '').trim();
  if (!key) return;
  into.add(key);
  const parts = key.split('|');
  // Full: mid|book|market|sel  OR already-loose: mid|market|sel
  if (parts.length === 4) {
    into.add(tipKeyLoose({
      match_id: Number(parts[0]),
      bookmaker: parts[1],
      market: parts[2],
      selection: parts[3],
    }));
  } else if (parts.length === 3) {
    into.add(key);
  }
}

export function subscribeLoggedTips(listener: Listener) {
  void ensureLoaded().then(() => listener());
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function initLoggedTips() {
  await ensureLoaded();
  emit();
}

export async function markTipsLogged(tips: TipPick[]) {
  await ensureLoaded();
  let changed = false;
  for (const t of tips) {
    const before = keys.size;
    addKeyVariants(tipKey(t), keys);
    addKeyVariants(tipKeyLoose(t), keys);
    if (keys.size !== before) changed = true;
  }
  if (changed) {
    await persist();
  }
  emit();
}

/** Merge keys from Tips API (pending logs) so strikethrough survives reload / new devices. */
export async function hydrateLoggedKeys(incoming: Iterable<string>) {
  await ensureLoaded();
  let changed = false;
  for (const k of incoming) {
    const before = keys.size;
    addKeyVariants(k, keys);
    if (keys.size !== before) changed = true;
  }
  if (changed) {
    await persist();
  }
  // Always notify — Today may have mounted before AsyncStorage finished loading.
  emit();
}

export function isTipLogged(p: TipPick): boolean {
  const exact = tipKey(p);
  if (keys.has(exact)) return true;
  const loose = tipKeyLoose(p);
  if (keys.has(loose)) return true;
  // Server tip may have empty/missing bookmaker while Today picks always have one.
  const mid = String(Number(p.match_id));
  const market = exact.split('|')[2];
  const sel = exact.split('|')[3];
  for (const k of keys) {
    const parts = k.split('|');
    if (parts.length === 4) {
      if (parts[0] === mid && parts[2] === market && parts[3] === sel) return true;
    } else if (parts.length === 3) {
      if (parts[0] === mid && parts[1] === market && parts[2] === sel) return true;
    }
  }
  return false;
}

export async function pruneLoggedTips(activeKeys: Set<string>) {
  await ensureLoaded();
  const next = new Set<string>();
  for (const k of activeKeys) addKeyVariants(k, next);
  if (next.size === keys.size && [...next].every((k) => keys.has(k))) return;
  keys = next;
  await persist();
  emit();
}
