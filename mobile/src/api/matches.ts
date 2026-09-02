import { getJson, postJson } from './client';
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

export function syncFixtures() {
  return postJson<SyncFixturesResult>('/matches/sync', {});
}
