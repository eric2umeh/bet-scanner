import { deleteJson, getJson, postJson } from './client';
import type { TipPick } from '../types/api';

export type TipOut = {
  id: number;
  match_id: number;
  home_team: string;
  away_team: string;
  competition_code?: string;
  kickoff_at?: string | null;
  match_status?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  market: string;
  selection: string;
  bookmaker?: string | null;
  odds_price?: number | string | null;
  stake_ngn?: number | string | null;
  result: string;
  slip_id?: string | null;
  risk_profile: string;
  source?: string;
  confidence_pct?: number | null;
  created_at?: string | null;
};

export type TipListPage = {
  items: TipOut[];
  has_more: boolean;
  total: number;
  limit: number;
  offset: number;
};

export type FetchTipsParams = {
  limit?: number;
  offset?: number;
  result?: string;
  market?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
};

export const TIPS_PAGE_SIZE = 10;

function tipsQuery(params: FetchTipsParams): string {
  const q = new URLSearchParams();
  q.set('limit', String(params.limit ?? TIPS_PAGE_SIZE));
  if (params.offset != null) q.set('offset', String(params.offset));
  if (params.result) q.set('result', params.result);
  if (params.market && params.market !== 'all') q.set('market', params.market);
  if (params.q?.trim()) q.set('q', params.q.trim());
  if (params.date_from) q.set('date_from', params.date_from);
  if (params.date_to) q.set('date_to', params.date_to);
  return `?${q.toString()}`;
}

export function tipSource(p: TipPick): string {
  const m = String(p.market || '').toLowerCase();
  if (m === 'ou_2_5' || m === 'btts') return 'goal_markets';
  if (String(p.profile || '').includes('safe') || m === 'double_chance' || m === '1x2') {
    return 'safe_builder';
  }
  return 'manual';
}

export function logTipBatch(opts: {
  tips: TipPick[];
  as_multi?: boolean;
  notify_telegram?: boolean;
  stakeFallback?: number | null;
}) {
  return postJson<{
    created_count: number;
    skipped_duplicates: number;
    message: string;
  }>('/tips/log-batch', {
    as_multi: opts.as_multi !== false,
    notify_telegram: !!opts.notify_telegram,
    tips: opts.tips.map((p) => {
      const stakeRaw = Number(p.suggested_stake_ngn);
      const stake =
        Number.isFinite(stakeRaw) && stakeRaw > 0
          ? stakeRaw
          : opts.stakeFallback ?? null;
      const oddsN = p.odds != null ? Number(p.odds) : null;
      const dogN = p.dog_odds != null ? Number(p.dog_odds) : null;
      return {
        match_id: p.match_id,
        risk_profile: p.profile || 'manual',
        market: p.market,
        selection: p.selection,
        odds_price: oddsN,
        bookmaker: p.bookmaker,
        stake_ngn: stake,
        pick_market: p.pick_market || null,
        dog_odds: dogN,
        fav_odds: p.fav_odds != null ? Number(p.fav_odds) : oddsN,
        source: tipSource(p),
        rationale: p.rationale || null,
        confidence_pct: p.confidence_pct != null ? Number(p.confidence_pct) : null,
      };
    }),
  });
}

export function fetchTipsPage(params: FetchTipsParams = {}) {
  const limit = params.limit ?? TIPS_PAGE_SIZE;
  const offset = params.offset ?? 0;
  return getJson<TipListPage | TipOut[]>(`/tips${tipsQuery(params)}`).then((raw) => {
    if (Array.isArray(raw)) {
      const slice = raw.slice(offset, offset + limit);
      const total = raw.length;
      return {
        items: slice,
        has_more: offset + limit < total,
        total,
        limit,
        offset,
      };
    }
    const items = raw.items ?? [];
    const total = raw.total ?? items.length;
    return {
      items,
      has_more: Boolean(raw.has_more),
      total,
      limit: raw.limit ?? limit,
      offset: raw.offset ?? offset,
    };
  });
}

export function fetchTipStats() {
  return getJson<{
    hit_rate_pct: number | null;
    won: number;
    lost: number;
    pending: number;
    total: number;
    message: string;
  }>('/tips/stats');
}

export function settleTip(
  tipId: number,
  result: string,
  opts?: { apply_to_slip?: boolean }
) {
  return postJson<TipOut>(`/tips/${tipId}/settle`, {
    result,
    apply_to_slip: !!opts?.apply_to_slip,
  });
}

export function deleteTip(tipId: number) {
  return deleteJson<{ ok: boolean; message: string }>(`/tips/${tipId}`);
}

export function autoSettleTips(opts?: { refreshScores?: boolean }) {
  const refresh = opts?.refreshScores !== false;
  const q = refresh ? '' : '?refresh_scores=false';
  return postJson<{
    settled_count: number;
    voided_count?: number;
    unresolved_count: number;
    message: string;
  }>(`/tips/auto-settle${q}`, {});
}
