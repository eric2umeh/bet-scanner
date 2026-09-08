import { getJson } from './client';
import type { PredictionsScanResponse } from '../types/api';

export function scanGoalMarkets(opts: {
  bookmaker: string;
  markets?: string;
  bankroll_ngn?: number;
  unit_pct?: number;
  /** Default API uses arb freshness (~90m); Home passes 24h for full-day fixtures. */
  max_odds_age_minutes?: number;
}) {
  const q = new URLSearchParams({
    bookmaker: opts.bookmaker,
    // Keep in sync with Today filter chips + API default
    markets: opts.markets || 'ou_0_5,ou_1_5,ou_2_5,btts,tt_2_5',
    bankroll_ngn: String(opts.bankroll_ngn ?? 50000),
  });
  if (opts.unit_pct != null) q.set('unit_pct', String(opts.unit_pct));
  if (opts.max_odds_age_minutes != null) {
    q.set('max_odds_age_minutes', String(opts.max_odds_age_minutes));
  }
  return getJson<PredictionsScanResponse>(`/predictions/scan?${q}`);
}
