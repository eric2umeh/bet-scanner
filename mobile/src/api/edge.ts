import { getJson, postJson } from './client';

export type ValuePick = {
  match_id: number;
  home_team: string;
  away_team: string;
  competition_code: string;
  kickoff_at?: string | null;
  market?: string;
  selection: string;
  bookmaker: string;
  odds: number | string;
  fair_odds: number | string;
  fair_prob?: number | string;
  ev_pct: number | string;
  kelly_fraction?: number | string;
  suggested_stake_ngn: number | string;
  potential_return_ngn?: number | string;
  profile?: string;
  books_used?: string[];
  age_minutes?: number | null;
  rationale?: string | null;
  warning?: string | null;
};

export type ValueScanResponse = {
  count: number;
  min_ev_pct: number | string;
  max_odds_age_minutes: number;
  bankroll_ngn: number | string;
  unit_pct: number | string;
  one_unit_ngn: number | string;
  picks: ValuePick[];
  message: string;
};

export type ArbLeg = {
  bookmaker: string;
  market?: string;
  selection: string;
  odds: number | string;
  stake_ngn?: number | string;
  potential_return_ngn?: number | string;
  captured_at?: string;
  age_minutes?: number;
};

export type ArbOpportunity = {
  match_id: number;
  home_team: string;
  away_team: string;
  competition_code: string;
  kickoff_at?: string;
  market?: string;
  profit_pct: number | string;
  implied_sum?: number | string;
  legs: ArbLeg[];
  books_used?: string[];
  sample_total_stake_ngn: number | string;
  sample_profit_ngn: number | string;
  sample_legs: ArbLeg[];
  warning?: string;
};

export type ArbScanResponse = {
  count: number;
  min_profit_pct: number | string;
  max_odds_age_minutes: number;
  books_scanned?: string[];
  opportunities: ArbOpportunity[];
  message: string;
};

export type LogScanResponse = {
  message: string;
  scan_count?: number;
  created_count?: number;
  skipped_duplicates?: number;
  opportunities?: ArbOpportunity[];
  picks?: ValuePick[];
  stake_plans?: string[];
};

/** Scan all bookmakers with fresh 1X2 odds in the DB (no book filter). */
export function scanSurebets(opts: { sample_stake_ngn: number }) {
  const q = new URLSearchParams({
    min_profit_pct: '0.01',
    sample_stake_ngn: String(opts.sample_stake_ngn),
  });
  return getJson<ArbScanResponse>(`/arbitrage/scan?${q}`);
}

export async function scanValue(opts: { bankroll_ngn: number; unit_pct: number }) {
  const q = new URLSearchParams({
    bankroll_ngn: String(opts.bankroll_ngn),
    unit_pct: String(opts.unit_pct),
  });
  return getJson<ValueScanResponse>(`/value/scan?${q}`);
}

export function logValueScan(opts: {
  bankroll_ngn: number;
  unit_pct: number;
  notify_telegram?: boolean;
}) {
  return postJson<LogScanResponse>('/tips/log-value-scan', {
    bankroll_ngn: opts.bankroll_ngn,
    unit_pct: opts.unit_pct,
    log_tips: true,
    notify_telegram: opts.notify_telegram ?? false,
  });
}

export function logSurebetScan(opts: {
  bankroll_ngn: number;
  notify_telegram?: boolean;
}) {
  return postJson<LogScanResponse>('/tips/log-arbitrage-scan', {
    bankmakers: '',
    bankroll_ngn: opts.bankroll_ngn,
    min_profit_pct: '0.01',
    log_tips: true,
    notify_telegram: opts.notify_telegram ?? false,
  });
}

export function formatSurebetPlan(opp: ArbOpportunity): string {
  const legs = (opp.sample_legs || []).map(
    (l) =>
      `${l.bookmaker} ${l.selection} @${l.odds} → ₦${l.stake_ngn}` +
      (l.potential_return_ngn != null ? ` (ret ₦${l.potential_return_ngn})` : '')
  );
  const books = opp.books_used?.length
    ? `Books: ${opp.books_used.join(', ')}`
    : '';
  return [
    `${opp.home_team} vs ${opp.away_team}`,
    `Profit ~${opp.profit_pct}% · sample ₦${opp.sample_profit_ngn} on ₦${opp.sample_total_stake_ngn}`,
    books,
    ...legs,
    opp.warning ? `Note: ${opp.warning}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
