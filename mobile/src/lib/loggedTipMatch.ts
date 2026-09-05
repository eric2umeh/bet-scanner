import type { TipPick } from '../types/api';
import type { TipOut } from '../api/tips';

function normMarket(market: string): string {
  const m = String(market || '').toLowerCase().replace(/-/g, '_');
  return m === '1x2' ? '1x2' : m;
}

function normSel(selection: string): string {
  return String(selection || '').trim().toLowerCase();
}

function normTeam(name: string | null | undefined): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compact pending-tip identity for Today strikethrough (no odds / stake). */
export type LoggedTipRef = {
  match_id: number;
  market: string;
  selection: string;
  home_team: string;
  away_team: string;
};

export function tipOutToLoggedRef(t: TipOut): LoggedTipRef {
  return {
    match_id: Number(t.match_id),
    market: String(t.market || ''),
    selection: String(t.selection || ''),
    home_team: String(t.home_team || ''),
    away_team: String(t.away_team || ''),
  };
}

/**
 * True if this Today pick was already logged.
 * Matches by match_id OR same teams — odds sync can create duplicate Match rows
 * for one fixture, so match_id alone is not enough across devices/origins.
 */
export function pickLooksLogged(
  p: Pick<TipPick, 'match_id' | 'market' | 'selection' | 'home_team' | 'away_team'>,
  refs: LoggedTipRef[]
): boolean {
  if (!refs.length) return false;
  const market = normMarket(p.market || '');
  const sel = normSel(p.selection || '');
  const mid = Number(p.match_id);
  const home = normTeam(p.home_team);
  const away = normTeam(p.away_team);

  for (const t of refs) {
    if (normMarket(t.market) !== market || normSel(t.selection) !== sel) continue;
    if (Number(t.match_id) === mid) return true;
    if (home && away && normTeam(t.home_team) === home && normTeam(t.away_team) === away) {
      return true;
    }
  }
  return false;
}
