import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TipPick } from '../types/api';
import { tipKey } from '../lib/tipKey';

const KEY = 'bet_scanner_selection_v1';

type Listener = () => void;

let selected: Record<string, TipPick> = {};
let loaded = false;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

async function persist() {
  await AsyncStorage.setItem(KEY, JSON.stringify(selected));
}

async function ensureLoaded() {
  if (loaded) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) selected = JSON.parse(raw) as Record<string, TipPick>;
  } catch {
    selected = {};
  }
  loaded = true;
  emit();
}

export async function initSelection() {
  await ensureLoaded();
}

export function subscribeSelection(listener: Listener) {
  void ensureLoaded().then(() => listener());
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSelectedTips(): TipPick[] {
  return Object.values(selected);
}

export function getSelectedCount(): number {
  return Object.keys(selected).length;
}

export function isTipSelected(p: TipPick): boolean {
  return !!selected[tipKey(p)];
}

export function toggleTip(p: TipPick, on?: boolean) {
  const key = tipKey(p);
  const nextOn = on ?? !selected[key];
  if (nextOn) selected[key] = p;
  else delete selected[key];
  void persist();
  emit();
}

export function clearSelection() {
  selected = {};
  void persist();
  emit();
}

/** Drop picks for matches no longer on Today (finished / removed). */
export function pruneSelection(activeMatchIds: Set<number>) {
  let changed = false;
  for (const [k, p] of Object.entries(selected)) {
    if (!activeMatchIds.has(p.match_id)) {
      delete selected[k];
      changed = true;
    }
  }
  if (changed) {
    void persist();
    emit();
  }
}

export function combinedSelectionOdds(): number {
  let product = 1;
  let n = 0;
  for (const p of Object.values(selected)) {
    const o = Number(p.odds);
    if (Number.isFinite(o) && o > 1) {
      product *= o;
      n += 1;
    }
  }
  return n ? product : 0;
}

/** True when 2+ selected legs share the same match (same-game multi / bet builder). */
export function selectionHasSameMatchLegs(): boolean {
  const ids = new Set<number>();
  for (const p of Object.values(selected)) {
    if (p.match_id == null) continue;
    const id = Number(p.match_id);
    if (!Number.isFinite(id)) continue;
    if (ids.has(id)) return true;
    ids.add(id);
  }
  return false;
}

/** Distinct match count among selected tips. */
export function selectionDistinctMatchCount(): number {
  const ids = new Set<number>();
  for (const p of Object.values(selected)) {
    if (p.match_id == null) continue;
    const id = Number(p.match_id);
    if (Number.isFinite(id)) ids.add(id);
  }
  return ids.size;
}
