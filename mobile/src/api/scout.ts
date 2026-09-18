import { getJson, postJson } from './client';

export type ScoutedCode = {
  id: number;
  code_text: string;
  bookmaker: string;
  source: string;
  source_label?: string | null;
  source_url?: string | null;
  folds?: number | null;
  combined_odds?: number | string | null;
  risk_band: string;
  title?: string | null;
  notes?: string | null;
  scouted_at?: string | null;
  hub_url?: string | null;
};

export type ScoutListResponse = {
  count: number;
  bookmaker: string;
  codes: ScoutedCode[];
  message: string;
};

export type ScoutSort =
  | 'odds_desc'
  | 'odds_asc'
  | 'folds_desc'
  | 'folds_asc'
  | 'date_desc'
  | 'date_asc';

export type ScoutListParams = {
  bookmaker?: string;
  days?: number;
  min_odds?: number;
  max_odds?: number;
  min_folds?: number;
  max_folds?: number;
  risk_band?: string;
  sort?: ScoutSort;
  limit?: number;
  refresh_if_empty?: boolean;
};

export function fetchScoutCodes(params: ScoutListParams = {}) {
  const q = new URLSearchParams();
  q.set('bookmaker', params.bookmaker || 'sportybet');
  q.set('days', String(params.days ?? 14));
  if (params.min_odds != null) q.set('min_odds', String(params.min_odds));
  if (params.max_odds != null) q.set('max_odds', String(params.max_odds));
  if (params.min_folds != null) q.set('min_folds', String(params.min_folds));
  if (params.max_folds != null) q.set('max_folds', String(params.max_folds));
  if (params.risk_band && params.risk_band !== 'all') q.set('risk_band', params.risk_band);
  q.set('sort', params.sort || 'odds_desc');
  q.set('limit', String(params.limit ?? 80));
  if (params.refresh_if_empty === false) q.set('refresh_if_empty', 'false');
  return getJson<ScoutListResponse>(`/scout/codes?${q}`);
}

export function refreshScoutFeed() {
  return postJson<{ status: string; upserted: number; sources: string[]; message: string }>(
    '/scout/refresh',
    {}
  );
}
