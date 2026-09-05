import type { TipPick } from '../types/api';

/** Stable id for selection / logged strikethrough (no odds — survives reload). */
export function tipKey(
  p: Pick<TipPick, 'match_id' | 'bookmaker' | 'market' | 'selection'>
): string {
  const market = String(p.market || '').toLowerCase().replace(/-/g, '_');
  // Safe builder may emit 1X2; tips API stores lowercased/normalized variants.
  const marketNorm = market === '1x2' ? '1x2' : market;
  return [
    Number(p.match_id),
    String(p.bookmaker || '').trim().toLowerCase(),
    marketNorm,
    String(p.selection || '').trim().toLowerCase(),
  ].join('|');
}

export function marketLabel(market: string): string {
  const m = String(market || '').toLowerCase();
  if (m === 'double_chance') return 'DC';
  if (m === '1x2') return '1X2';
  if (m === 'ou_0_5') return 'O/U 0.5';
  if (m === 'ou_1_5') return 'O/U 1.5';
  if (m === 'ou_2_5') return 'O/U 2.5';
  if (m === 'btts') return 'BTTS';
  if (m === 'tt_2_5') return 'Team 3+';
  return market;
}

export function bookLabel(book: string): string {
  const b = String(book || '').toLowerCase();
  if (b === 'sportybet') return 'SportyBet';
  if (b === 'bet9ja') return 'Bet9ja';
  if (b === 'onexbet' || b === '1xbet') return '1xBet';
  if (b === 'melbet') return 'MelBet';
  if (b === 'betwinner') return 'BetWinner';
  if (b === 'megapari') return 'MegaPari';
  if (b === 'betano') return 'Betano';
  if (b === 'ivibet') return 'Ivibet';
  if (b === 'rabona') return 'Rabona';
  if (b === 'stake') return 'Stake';
  return book || '—';
}
