/** Women's / ladies fixtures — show "Women" in full and keep one-line titles short. */

const WOMENS_RE =
  /\b(women|womens|woman|ladies|feminine|femmes|feminin)\b|\(w\)|\bw\b(?=\s|$)/i;

export function isWomensMatch(home: string, away: string): boolean {
  return WOMENS_RE.test(`${home} ${away}`);
}

function stripWomensMarker(name: string): string {
  return name
    .replace(/\s*\(w\)\s*/gi, ' ')
    .replace(/\s+women'?s?\s*/gi, ' ')
    .replace(/\s+ladies\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shortenTeam(name: string, maxLen: number): string {
  const clean = stripWomensMarker(name);
  if (clean.length <= maxLen) return clean;
  const words = clean.split(/\s+/);
  if (words.length > 1 && words[0].length >= 4) {
    const short = `${words[0]} ${words[words.length - 1].charAt(0)}.`;
    if (short.length <= maxLen) return short;
  }
  return `${clean.slice(0, maxLen - 1)}…`;
}

/** One-line match title; appends "Women" when fixture is women's football. */
export function formatMatchTitle(home: string, away: string, maxEach = 14): string {
  const w = isWomensMatch(home, away);
  const h = shortenTeam(home, maxEach);
  const a = shortenTeam(away, maxEach);
  const base = `${h} vs ${a}`;
  return w ? `${base} · Women` : base;
}
