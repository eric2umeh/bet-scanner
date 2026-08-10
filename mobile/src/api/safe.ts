import { getJson } from './client';
import type { SafeScanResponse } from '../types/api';

export function scanSafeBuilder(opts: {
  bookmaker: string;
  pick_market?: string;
  bankroll_ngn?: number;
  unit_pct?: number;
}) {
  const q = new URLSearchParams({
    bookmaker: opts.bookmaker,
    pick_market: opts.pick_market || 'double_chance',
    bankroll_ngn: String(opts.bankroll_ngn ?? 50000),
  });
  if (opts.unit_pct != null) q.set('unit_pct', String(opts.unit_pct));
  return getJson<SafeScanResponse>(`/safe-builder/scan?${q}`);
}
