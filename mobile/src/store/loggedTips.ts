import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TipPick } from '../types/api';
import { tipKey } from '../lib/tipKey';

const KEY = 'bet_scanner_logged_tip_keys_v1';

type Listener = () => void;

let keys = new Set<string>();
let loaded = false;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

async function ensureLoaded() {
  if (loaded) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) keys = new Set(JSON.parse(raw) as string[]);
  } catch {
    keys = new Set();
  }
  loaded = true;
}

async function persist() {
  await AsyncStorage.setItem(KEY, JSON.stringify([...keys]));
}

export function subscribeLoggedTips(listener: Listener) {
  void ensureLoaded().then(() => listener());
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function initLoggedTips() {
  await ensureLoaded();
}

export async function markTipsLogged(tips: TipPick[]) {
  await ensureLoaded();
  let changed = false;
  for (const t of tips) {
    const k = tipKey(t);
    if (!keys.has(k)) {
      keys.add(k);
      changed = true;
    }
  }
  if (changed) {
    await persist();
    emit();
  } else {
    emit();
  }
}

/** Merge keys from Tips API (pending logs) so strikethrough survives reload / new devices. */
export async function hydrateLoggedKeys(incoming: Iterable<string>) {
  await ensureLoaded();
  let changed = false;
  for (const k of incoming) {
    const key = String(k || '').trim();
    if (!key || keys.has(key)) continue;
    keys.add(key);
    changed = true;
  }
  if (changed) {
    await persist();
    emit();
  }
}

export function isTipLogged(p: TipPick): boolean {
  return keys.has(tipKey(p));
}

export async function pruneLoggedTips(activeKeys: Set<string>) {
  await ensureLoaded();
  const next = new Set([...keys].filter((k) => activeKeys.has(k)));
  if (next.size === keys.size) return;
  keys = next;
  await persist();
  emit();
}
