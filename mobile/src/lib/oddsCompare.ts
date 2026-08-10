import type { OddRow } from '../api/odds';

export type CompareCell = {
  a: number | null;
  b: number | null;
  bestA: boolean;
  bestB: boolean;
  tie: boolean;
  deltaA: string;
  deltaB: string;
};

export function oddsAgeLabel(iso?: string | null): { text: string; stale: boolean } {
  if (!iso) return { text: 'Age unknown', stale: true };
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return { text: 'Age unknown', stale: true };
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return { text: `Odds ~${mins}m old`, stale: mins > 180 };
  const hrs = Math.round(mins / 60);
  return { text: `Odds ~${hrs}h old`, stale: mins > 180 };
}

export function packOddsMarket(rows: OddRow[], market: string, keys: string[]) {
  const prices: Record<string, number | null> = {};
  let newest: string | null = null;
  for (const k of keys) prices[k] = null;
  for (const r of rows) {
    if (r.market !== market) continue;
    const sel = String(r.selection).toLowerCase();
    if (!(sel in prices)) continue;
    const n = Number(r.price);
    prices[sel] = Number.isFinite(n) ? n : null;
    if (r.captured_at && (!newest || r.captured_at > newest)) newest = r.captured_at;
  }
  return { prices, captured_at: newest };
}

export function compareCell(a: number | null, b: number | null): CompareCell {
  const av = a != null ? Number(a) : null;
  const bv = b != null ? Number(b) : null;
  const tie = av != null && bv != null && Math.abs(av - bv) < 0.0005;
  const bestA = av != null && (bv == null || av > bv + 0.0005 || tie);
  const bestB = bv != null && (av == null || bv > av + 0.0005 || tie);
  let deltaA = '';
  let deltaB = '';
  if (av != null && bv != null && !tie) {
    const d = Math.abs(av - bv);
    const pct = ((d / Math.min(av, bv)) * 100).toFixed(1);
    if (av > bv) deltaA = `+${d.toFixed(3)} (${pct}%)`;
    else deltaB = `+${d.toFixed(3)} (${pct}%)`;
  }
  return { a: av, b: bv, bestA, bestB, tie, deltaA, deltaB };
}
