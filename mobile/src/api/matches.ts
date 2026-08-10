import { getJson } from './client';
import type { Match } from '../types/api';

export function fetchTodayMatches() {
  return getJson<Match[]>('/matches/today');
}

export function fetchUpcomingMatches(days = 21) {
  return getJson<Match[]>(`/matches/upcoming?days=${days}`);
}
