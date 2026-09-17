import { tipKey } from '../lib/tipKey';
import { loadSettings } from '../store/settings';
import type { Match, TipPick } from '../types/api';
import { fetchPublicAppConfig } from '../api/appConfig';
import { fetchBettableMatches } from '../api/matches';
import { scanGoalMarkets } from '../api/predictions';
import { scanSafeBuilder } from '../api/safe';

const UPCOMING_DAYS = 21;

export type HomeFeed = {
  matches: Match[];
  picks: TipPick[];
  books: string[];
  fetchedAt: string;
};

function dedupePicks(picks: TipPick[]): TipPick[] {
  const seen = new Set<string>();
  const out: TipPick[] = [];
  for (const p of picks) {
    if (p.match_id == null) continue;
    const k = tipKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function enrichMatchesFromPicks(list: Match[], tipList: TipPick[]): Match[] {
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const p of tipList) {
    if (!p.match_id || byId.has(p.match_id)) continue;
    byId.set(p.match_id, {
      id: p.match_id,
      competition_code: p.competition_code || 'UNK',
      competition_name: p.competition_code || 'Unknown',
      home_team: p.home_team || 'Home',
      away_team: p.away_team || 'Away',
      kickoff_at: p.kickoff_at || new Date().toISOString(),
      status: 'SCHEDULED',
      home_score: null,
      away_score: null,
    });
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime()
  );
}

/** Load bettable matches + Safe / goal scans (no odds sync). */
export async function fetchHomeFeed(opts?: { signal?: AbortSignal }): Promise<HomeFeed> {
  const signal = opts?.signal;
  if (signal?.aborted) {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    throw err;
  }

  const s = await loadSettings();
  const cfg = await fetchPublicAppConfig();
  const books = cfg.odds_bookmakers?.length ? cfg.odds_bookmakers : ['sportybet', 'bet9ja'];

  const bankroll = {
    bankroll_ngn: s.bankroll,
    unit_pct: s.unitPct,
  };
  const oddsAge = { max_odds_age_minutes: 24 * 60 };

  const bettable = await fetchBettableMatches(UPCOMING_DAYS, books.join(','));
  if (signal?.aborted) {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    throw err;
  }

  const safeCalls = books.flatMap((bookmaker) => [
    scanSafeBuilder({
      bookmaker,
      pick_market: 'double_chance',
      ...bankroll,
      ...oddsAge,
    }).catch(() => ({ picks: [] as TipPick[] })),
    scanSafeBuilder({
      bookmaker,
      pick_market: '1x2',
      ...bankroll,
      ...oddsAge,
    }).catch(() => ({ picks: [] as TipPick[] })),
  ]);
  const goalCalls = books.map((bookmaker) =>
    scanGoalMarkets({
      bookmaker,
      markets: 'ou_0_5,ou_1_5,tt_2_5',
      ...bankroll,
      ...oddsAge,
    }).catch(() => ({ picks: [] as TipPick[] }))
  );

  const results = await Promise.all([...safeCalls, ...goalCalls]);
  if (signal?.aborted) {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    throw err;
  }

  const picks = dedupePicks(results.flatMap((r) => r.picks || []));
  const matches = enrichMatchesFromPicks(bettable, picks);

  return {
    matches,
    picks,
    books,
    fetchedAt: new Date().toISOString(),
  };
}
