import { Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';

import { bookLabel } from './tipKey';

type BookOpenConfig = {
  /** Normalized key (sportybet, melbet, …). */
  key: string;
  homeUrl: string;
  /**
   * Best URL for this book. Prefer a real search route when the SPA reads
   * `keyword` / `q` on load; otherwise a stable football landing.
   */
  openUrl: (q: string) => string;
  /** True when openUrl should run the book’s own search UI. */
  hasSearch: boolean;
};

const BOOK_OPEN: Record<string, BookOpenConfig> = {
  sportybet: {
    key: 'sportybet',
    homeUrl: 'https://www.sportybet.com/ng/m',
    // SportyBet reads query param `key` (not `keyword`) and runs firstSearch on mount.
    // Do NOT use `/m/sport/football` — that lands on live/football, not search.
    // We cannot type into their input from Bet Scout (cross-origin); `key=` is the auto-fill.
    openUrl: (q) =>
      `https://www.sportybet.com/ng/m/search?key=${encodeURIComponent(q)}`,
    hasSearch: true,
  },
  melbet: {
    key: 'melbet',
    homeUrl: 'https://melbet.com/en',
    // MelBet `/en/search` 404s; football line is the stable hand-off.
    openUrl: () => 'https://melbet.com/en/line/football',
    hasSearch: false,
  },
  onexbet: {
    key: 'onexbet',
    homeUrl: 'https://1xbet.com/en',
    openUrl: () => 'https://1xbet.com/en/line/football',
    hasSearch: false,
  },
  '1xbet': {
    key: 'onexbet',
    homeUrl: 'https://1xbet.com/en',
    openUrl: () => 'https://1xbet.com/en/line/football',
    hasSearch: false,
  },
  bet9ja: {
    key: 'bet9ja',
    homeUrl: 'https://shop.bet9ja.com/',
    openUrl: (q) =>
      `https://www.google.com/search?q=${encodeURIComponent(`Bet9ja ${q} football`)}`,
    hasSearch: true,
  },
  betwinner: {
    key: 'betwinner',
    homeUrl: 'https://betwinner.com/',
    openUrl: () => 'https://betwinner.com/en/line/football',
    hasSearch: false,
  },
  megapari: {
    key: 'megapari',
    homeUrl: 'https://megapari.com/',
    openUrl: () => 'https://megapari.com/en/line/football',
    hasSearch: false,
  },
};

function normBook(bookmaker: string): string {
  return String(bookmaker || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

export function resolveBookOpenConfig(bookmaker: string): BookOpenConfig {
  const key = normBook(bookmaker);
  if (key && BOOK_OPEN[key]) return BOOK_OPEN[key];
  const label = bookLabel(bookmaker) || 'bookmaker';
  return {
    key: key || 'book',
    homeUrl: 'https://www.google.com/',
    openUrl: (q) =>
      `https://www.google.com/search?q=${encodeURIComponent(`${label} ${q} football bet`)}`,
    hasSearch: true,
  };
}

/** Strip noise so bookmaker search hits the club name. SportyBet needs ≥3 chars. */
export function bookmakerSearchQuery(home: string, away: string): string {
  const h = cleanTeam(home);
  const a = cleanTeam(away);
  let primary = preferSearchName(h, a).slice(0, 48);
  // SportyBet rejects searches under 3 non-space characters.
  if (primary.replace(/\s/g, '').length < 3) {
    const fallback = `${significantWords(h) || h} ${significantWords(a) || a}`.trim();
    primary = (fallback || primary || 'football').slice(0, 48);
  }
  return primary;
}

function cleanTeam(name: string): string {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function preferSearchName(home: string, away: string): string {
  const h = significantWords(home);
  const a = significantWords(away);
  if (h && a) {
    if (h.length <= a.length) return h;
    return a;
  }
  return h || a || home || away || 'football';
}

function significantWords(name: string): string {
  const stripped = name
    .replace(/\b(fc|cf|sc|afc|ac|as|fk|sk|nk|u\d{2}|u\d|youth|reserves?|ii|b)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = stripped.split(' ').filter((w) => w.length > 1);
  if (!parts.length) return name.trim();
  if (parts.length <= 2) return parts.join(' ');
  return parts.slice(0, 3).join(' ');
}

export function bookmakerMatchUrl(
  bookmaker: string,
  home: string,
  away: string
): {
  url: string;
  searchFor: string;
  label: string;
  homeUrl: string;
  hasSearch: boolean;
} {
  const cfg = resolveBookOpenConfig(bookmaker);
  const searchFor = bookmakerSearchQuery(home, away);
  const label = bookLabel(bookmaker) || bookLabel(cfg.key);
  return {
    url: cfg.openUrl(searchFor),
    searchFor,
    label,
    homeUrl: cfg.homeUrl,
    hasSearch: cfg.hasSearch,
  };
}

export type OpenBookmakerResult = {
  ok: boolean;
  searchFor: string;
  url: string;
  label: string;
  hasSearch: boolean;
  /** True when the team name was copied as a paste backup. */
  copied: boolean;
  error?: string;
};

/**
 * Open the bookmaker to a search (when supported) or football landing.
 * Always copies the team name as a backup — native apps sometimes ignore query params.
 */
export async function openBookmakerMatch(opts: {
  bookmaker: string;
  home: string;
  away: string;
}): Promise<OpenBookmakerResult> {
  const { url, searchFor, label, homeUrl, hasSearch } = bookmakerMatchUrl(
    opts.bookmaker,
    opts.home,
    opts.away
  );

  let copied = false;
  try {
    await Clipboard.setStringAsync(searchFor);
    copied = true;
  } catch {
    copied = false;
  }

  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return { ok: true, searchFor, url, label, hasSearch, copied };
    }
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
      return { ok: true, searchFor, url, label, hasSearch, copied };
    }
    await Linking.openURL(homeUrl);
    return { ok: true, searchFor, url: homeUrl, label, hasSearch, copied };
  } catch (e) {
    return {
      ok: false,
      searchFor,
      url,
      label,
      hasSearch,
      copied,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
