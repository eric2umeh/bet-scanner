import { getJson } from './client';
import type { SafeScanResponse } from '../types/api';

export function scanSafeBuilder(opts: {
  bookmaker: string;
  pick_market?: string;
  bankroll_ngn?: number;
  unit_pct?: number;
  /** Default API uses arb freshness (~90m); Home passes 24h for full-day fixtures. */
  max_odds_age_minutes?: number;
}) {
  const q = new URLSearchParams({
    bookmaker: opts.bookmaker,
    pick_market: opts.pick_market || 'double_chance',
    bankroll_ngn: String(opts.bankroll_ngn ?? 50000),
  });
  if (opts.unit_pct != null) q.set('unit_pct', String(opts.unit_pct));
  if (opts.max_odds_age_minutes != null) {
    q.set('max_odds_age_minutes', String(opts.max_odds_age_minutes));
  }
  return getJson<SafeScanResponse>(`/safe-builder/scan?${q}`);
}
