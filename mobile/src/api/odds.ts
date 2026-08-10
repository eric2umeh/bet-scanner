import { postJson } from './client';

export type OddsSyncResult = {
  ok?: boolean;
  message?: string;
  inserted?: number;
  providers?: string[];
};

export function syncOdds() {
  return postJson<OddsSyncResult>('/odds/sync', {});
}
