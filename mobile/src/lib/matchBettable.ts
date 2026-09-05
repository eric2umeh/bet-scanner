/** True while kickoff is still in the future (placeable as a new bet). */
export function isKickoffUpcoming(iso?: string | null, graceMs = 0): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t > Date.now() - graceMs;
}

const NOT_BETTABLE = new Set([
  'FINISHED',
  'FT',
  'AET',
  'PEN',
  'SETTLED',
  'IN_PLAY',
  'LIVE',
  '1H',
  '2H',
  'HT',
  'ET',
  'BT',
  'INT',
  'POSTPONED',
  'CANCELLED',
  'CANCELED',
  'SUSPENDED',
  'ABANDONED',
  'PST',
  'CANC',
  'ABD',
]);

/** Drop live / finished / voidable / past-kickoff matches from Today & Surebets. */
export function isMatchBettable(m: {
  kickoff_at?: string | null;
  status?: string | null;
}): boolean {
  const s = String(m.status || '')
    .trim()
    .toUpperCase();
  if (s && NOT_BETTABLE.has(s)) return false;
  return isKickoffUpcoming(m.kickoff_at);
}
