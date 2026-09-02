import type { TipPick } from '../types/api';

export function tipKey(p: TipPick): string {
  return [
    p.match_id,
    String(p.bookmaker || '').toLowerCase(),
    String(p.market || '').toLowerCase(),
    String(p.selection || '').toLowerCase(),
  ].join('|');
}

export function marketLabel(market: string): string {
  const m = String(market || '').toLowerCase();
  if (m === 'double_chance') return 'DC';
  if (m === '1x2') return '1X2';
  if (m === 'ou_2_5') return 'O/U 2.5';
  if (m === 'btts') return 'BTTS';
  return market;
}

export function bookLabel(book: string): string {
  const b = String(book || '').toLowerCase();
  if (b === 'sportybet') return 'SportyBet';
  if (b === 'bet9ja') return 'Bet9ja';
  if (b === 'onexbet' || b === '1xbet') return '1xBet';
  return book || '—';
}
