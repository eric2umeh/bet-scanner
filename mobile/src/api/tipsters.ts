import { getJson, postJson } from './client';

export type Tipster = {
  id: number;
  name: string;
  handle?: string | null;
  platform?: string | null;
  notes?: string | null;
  codes_total?: number | null;
  codes_pending?: number | null;
  codes_settled?: number | null;
};

export type BookingCode = {
  id: number;
  tipster_id: number;
  tipster_name: string;
  code_text: string;
  bookmaker: string;
  markets_summary?: string | null;
  stake_ngn?: number | string | null;
  odds_price?: number | string | null;
  source?: string;
  notes?: string | null;
  result: string;
  created_at?: string | null;
  settled_at?: string | null;
};

export type LeaderboardRow = {
  tipster_id?: number;
  name?: string;
  handle?: string | null;
  settled?: number;
  won?: number;
  lost?: number;
  hit_rate_pct?: number | null;
  roi_pct?: number | null;
  [key: string]: unknown;
};

export function fetchTipsters(limit = 50) {
  return getJson<Tipster[]>(`/tipsters?limit=${limit}`);
}

export function createTipster(body: {
  name: string;
  handle?: string | null;
  platform?: string | null;
  notes?: string | null;
}) {
  return postJson<Tipster>('/tipsters', body);
}

export function fetchCodes(opts?: { tipster_id?: number; result?: string; limit?: number }) {
  const q = new URLSearchParams();
  if (opts?.tipster_id != null) q.set('tipster_id', String(opts.tipster_id));
  if (opts?.result) q.set('result', opts.result);
  q.set('limit', String(opts?.limit ?? 50));
  return getJson<BookingCode[]>(`/tipsters/codes?${q}`);
}

export function logBookingCode(body: {
  tipster_id: number;
  code_text: string;
  bookmaker?: string;
  stake_ngn?: number | null;
  odds_price?: number | null;
  notes?: string | null;
  source?: string;
}) {
  return postJson<{ status: string; code: BookingCode | null; message: string }>(
    '/tipsters/codes',
    {
      tipster_id: body.tipster_id,
      code_text: body.code_text,
      bookmaker: body.bookmaker || 'sportybet',
      stake_ngn: body.stake_ngn ?? null,
      odds_price: body.odds_price ?? null,
      notes: body.notes || null,
      source: body.source || 'manual',
    }
  );
}

export function settleBookingCode(codeId: number, result: string) {
  return postJson<BookingCode>(`/tipsters/codes/${codeId}/settle`, { result });
}

export function fetchTipsterLeaderboard(minSettled = 1) {
  return getJson<{
    count: number;
    min_settled: number;
    leaderboard: LeaderboardRow[];
    message: string;
  }>(`/tipsters/leaderboard?min_settled=${minSettled}`);
}
