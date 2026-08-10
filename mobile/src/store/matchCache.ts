import type { Match, TipPick } from '../types/api';

/** In-memory cache so match detail can show tips without re-scanning. */
let matchesById: Record<number, Match> = {};
let picksByMatch: Record<number, TipPick[]> = {};

export function setMatchCache(matches: Match[], picks: TipPick[]) {
  const mMap: Record<number, Match> = {};
  for (const m of matches) mMap[m.id] = m;
  matchesById = mMap;

  const pMap: Record<number, TipPick[]> = {};
  for (const p of picks) {
    if (p.match_id == null) continue;
    if (!pMap[p.match_id]) pMap[p.match_id] = [];
    pMap[p.match_id].push(p);
  }
  picksByMatch = pMap;
}

export function getCachedMatch(id: number): Match | null {
  return matchesById[id] || null;
}

export function getCachedPicks(id: number): TipPick[] {
  return picksByMatch[id] || [];
}
