import { getJson } from './client';
import type { PredictionsScanResponse } from '../types/api';

export function scanGoalMarkets(opts: {
  bookmaker: string;
  markets?: string;
  bankroll_ngn?: number;
  unit_pct?: number;
}) {
  const q = new URLSearchParams({
    bookmaker: opts.bookmaker,
    markets: opts.markets || 'ou_2_5,btts',
    bankroll_ngn: String(opts.bankroll_ngn ?? 50000),
  });
  if (opts.unit_pct != null) q.set('unit_pct', String(opts.unit_pct));
  return getJson<PredictionsScanResponse>(`/predictions/scan?${q}`);
}
