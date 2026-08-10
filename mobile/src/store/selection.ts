import type { TipPick } from '../types/api';
import { tipKey } from '../lib/tipKey';

type Listener = () => void;

let selected: Record<string, TipPick> = {};
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeSelection(listener: Listener) {
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
  emit();
}

export function clearSelection() {
  selected = {};
  emit();
}
