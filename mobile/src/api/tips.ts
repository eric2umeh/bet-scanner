import { getJson, postJson } from './client';
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
};

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
      return {
        match_id: p.match_id,
        risk_profile: p.profile || 'manual',
        market: p.market,
        selection: p.selection,
        odds_price: p.odds != null ? Number(p.odds) : null,
        bookmaker: p.bookmaker,
        stake_ngn: stake,
        pick_market: p.pick_market || null,
        dog_odds: p.dog_odds != null ? Number(p.dog_odds) : null,
        fav_odds: p.fav_odds != null ? Number(p.fav_odds) : null,
        source: tipSource(p),
        rationale: p.rationale || null,
      };
    }),
  });
}

export function fetchTips(limit = 50) {
  return getJson<TipOut[]>(`/tips?limit=${limit}`);
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

export function autoSettleTips() {
  return postJson<{
    settled_count: number;
    unresolved_count: number;
    message: string;
  }>('/tips/auto-settle', {});
}
