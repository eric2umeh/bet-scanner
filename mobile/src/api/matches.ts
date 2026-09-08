import { ApiError, getJson, postJson } from './client';
import type { Match } from '../types/api';

export type SyncFixturesResult = {
  competitions: string[];
  upserted: number;
  message: string;
  providers?: string[];
};

export function fetchTodayMatches() {
  return getJson<Match[]>('/matches/today');
}

export function fetchUpcomingMatches(days = 21) {
  return getJson<Match[]>(`/matches/upcoming?days=${days}`);
}

export async function fetchBettableMatches(
  days = 21,
  bookmakers?: string,
  /** Odds older than this are ignored (default 24h so evening fixtures stay listed). */
  maxAgeMinutes = 24 * 60
): Promise<Match[]> {
  const q = new URLSearchParams({
    days: String(days),
    max_age_minutes: String(maxAgeMinutes),
  });
  if (bookmakers) q.set('bookmakers', bookmakers);
  try {
    return await getJson<Match[]>(`/matches/bettable?${q}`);
  } catch (e) {
    // Older servers (e.g. Render before deploy) — caller enriches from scan picks.
    if (e instanceof ApiError && e.status === 404) {
      return [];
    }
    throw e;
  }
}

export function syncFixtures(opts?: { signal?: AbortSignal }) {
  return postJson<SyncFixturesResult>('/matches/sync', {}, { signal: opts?.signal });
}
