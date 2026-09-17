/** Tip “confidence” is market strength (odds gap / de-vig fair %) — not predicted win %. */

const YOUTH_RE =
  /\b(u\d{1,2})\b|youth|reserve|academy|\b(junior|juniors)\b|\bii\b|\bb\s+team\b/i;

export function isConfidenceMarket(market: string): boolean {
  const m = String(market || '').toLowerCase();
  return (
    m === 'ou_0_5' ||
    m === 'ou_1_5' ||
    m === 'ou_2_5' ||
    m === 'btts' ||
    m === 'tt_2_5' ||
    m === 'double_chance' ||
    m === '1x2'
  );
}

export function formatConfidencePct(market: string, pct: number | null | undefined): string | null {
  if (pct == null || Number.isNaN(pct)) return null;
  if (isConfidenceMarket(market)) {
    return `confidence ${pct}%`;
  }
  return `${pct}%`;
}

export function isYouthOrReserveMatch(home: string, away: string): boolean {
  return YOUTH_RE.test(`${home} ${away}`);
}

export function youthMatchHint(home: string, away: string): string | null {
  if (!isYouthOrReserveMatch(home, away)) return null;
  return 'Youth/reserve — volatile; SportyBet often singles-only for O/U & BTTS.';
}
