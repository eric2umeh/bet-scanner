import { getJson, postJson } from './client';

export type OddsSyncResult = {
  ok?: boolean;
  message?: string;
  inserted?: number;
  providers?: string[];
};

export type OddRow = {
  id?: number;
  match_id: number;
  bookmaker: string;
  market: string;
  selection: string;
  price: number | string;
  captured_at?: string;
};

export function syncOdds() {
  return postJson<OddsSyncResult>('/odds/sync', {});
}

export function fetchLatestOdds(opts: {
  bookmaker: string;
  match_id: number;
  limit?: number;
}) {
  const q = new URLSearchParams({
    bookmaker: opts.bookmaker,
    match_id: String(opts.match_id),
    limit: String(opts.limit ?? 80),
  });
  return getJson<OddRow[]>(`/odds/latest?${q}`);
}
