import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TipPick } from '../types/api';
import { tipKey, tipKeyLoose } from '../lib/tipKey';
import { getSessionEmail, getSessionUserId, subscribeSession } from './session';

const KEY_PREFIX = 'bet_scanner_logged_tip_keys_v2:';
/** Legacy shared key — never reuse across accounts. */
const LEGACY_SHARED_KEY = 'bet_scanner_logged_tip_keys_v1';

type Listener = () => void;

let keys = new Set<string>();
let ownerKey = 'anon';
let loaded = false;
let loadPromise: Promise<void> | null = null;
const listeners = new Set<Listener>();
let sessionWired = false;

function emit() {
  listeners.forEach((l) => l());
}

function storageKeyFor(owner: string) {
  return `${KEY_PREFIX}${owner}`;
}

function currentOwnerKey(): string {
  const id = (getSessionUserId() || '').trim();
  if (id) return id;
  const em = (getSessionEmail() || '').trim().toLowerCase();
  if (em) return em;
  return 'anon';
}

async function readOwnerKeys(owner: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(storageKeyFor(owner));
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* ignore */
  }
  return new Set();
}

async function ensureLoaded() {
  wireSessionIfNeeded();
  const nextOwner = currentOwnerKey();
  if (loaded && nextOwner === ownerKey) return;
  if (loadPromise) {
    await loadPromise;
    if (loaded && currentOwnerKey() === ownerKey) return;
  }
  loadPromise = (async () => {
    const owner = currentOwnerKey();
    ownerKey = owner;
    keys = await readOwnerKeys(owner);
    // One-time: if this signed-in user has no keys yet, adopt legacy shared
    // keys only for them (then delete the shared blob so other accounts stay clean).
    if (owner !== 'anon' && keys.size === 0) {
      try {
        const legacy = await AsyncStorage.getItem(LEGACY_SHARED_KEY);
        if (legacy) {
          keys = new Set(JSON.parse(legacy) as string[]);
          await AsyncStorage.setItem(storageKeyFor(owner), JSON.stringify([...keys]));
          await AsyncStorage.removeItem(LEGACY_SHARED_KEY);
        }
      } catch {
        /* ignore */
      }
    }
    loaded = true;
  })();
  await loadPromise;
  loadPromise = null;
}

async function persist() {
  await AsyncStorage.setItem(storageKeyFor(ownerKey), JSON.stringify([...keys]));
}

function addKeyVariants(raw: string, into: Set<string>) {
  const key = String(raw || '').trim();
  if (!key) return;
  into.add(key);
  const parts = key.split('|');
  // Full: mid|book|market|sel  OR already-loose: mid|market|sel
  if (parts.length === 4) {
    into.add(
      tipKeyLoose({
        match_id: Number(parts[0]),
        bookmaker: parts[1],
        market: parts[2],
        selection: parts[3],
      })
    );
  } else if (parts.length === 3) {
    into.add(key);
  }
}

function wireSessionIfNeeded() {
  if (sessionWired) return;
  sessionWired = true;
  subscribeSession(() => {
    void (async () => {
      const next = currentOwnerKey();
      if (next === ownerKey && loaded) return;
      loaded = false;
      loadPromise = null;
      keys = new Set();
      await ensureLoaded();
      emit();
    })();
  });
}

export function subscribeLoggedTips(listener: Listener) {
  wireSessionIfNeeded();
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
  // Never attach logged tips to the shared anon bucket while signed out.
  if (ownerKey === 'anon') return;
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
  if (ownerKey === 'anon') return;
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
  const owner = currentOwnerKey();
  // Unsigned, or still switching accounts — never show another user's strikes.
  if (owner === 'anon') return false;
  if (!loaded || owner !== ownerKey) return false;
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
  if (ownerKey === 'anon') return;
  const next = new Set<string>();
  for (const k of activeKeys) addKeyVariants(k, next);
  if (next.size === keys.size && [...next].every((k) => keys.has(k))) return;
  keys = next;
  await persist();
  emit();
}

/** Clear in-memory + disk keys for the current account (tests / support). */
export async function clearLoggedTipsForCurrentUser() {
  await ensureLoaded();
  keys = new Set();
  await AsyncStorage.removeItem(storageKeyFor(ownerKey));
  emit();
}
