import { Platform } from 'react-native';
import * as Linking from 'expo-linking';

import { bookLabel } from './tipKey';

type BookOpenConfig = {
  /** Normalized key (sportybet, melbet, …). */
  key: string;
  homeUrl: string;
  /** Team keyword → bookmaker search / landing URL. */
  searchUrl: (q: string) => string;
};

const BOOK_OPEN: Record<string, BookOpenConfig> = {
  sportybet: {
    key: 'sportybet',
    homeUrl: 'https://www.sportybet.com/ng/m',
    searchUrl: (q) =>
      `https://www.sportybet.com/ng/m?keyword=${encodeURIComponent(q)}`,
  },
  melbet: {
    key: 'melbet',
    homeUrl: 'https://melbet.com/',
    searchUrl: (q) =>
      `https://melbet.com/en/search/?q=${encodeURIComponent(q)}`,
  },
  onexbet: {
    key: 'onexbet',
    homeUrl: 'https://1xbet.com/',
    searchUrl: (q) =>
      `https://1xbet.com/en/search?external_search=1&q=${encodeURIComponent(q)}`,
  },
  '1xbet': {
    key: 'onexbet',
    homeUrl: 'https://1xbet.com/',
    searchUrl: (q) =>
      `https://1xbet.com/en/search?external_search=1&q=${encodeURIComponent(q)}`,
  },
  bet9ja: {
    key: 'bet9ja',
    homeUrl: 'https://shop.bet9ja.com/',
    searchUrl: (q) =>
      `https://www.google.com/search?q=${encodeURIComponent(`Bet9ja ${q} football`)}`,
  },
  betwinner: {
    key: 'betwinner',
    homeUrl: 'https://betwinner.com/',
    searchUrl: (q) =>
      `https://betwinner.com/en/search/?q=${encodeURIComponent(q)}`,
  },
  megapari: {
    key: 'megapari',
    homeUrl: 'https://megapari.com/',
    searchUrl: (q) =>
      `https://megapari.com/en/search/?q=${encodeURIComponent(q)}`,
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
  // Unknown book — Google search with brand + team (still useful hand-off).
  return {
    key: key || 'book',
    homeUrl: 'https://www.google.com/',
    searchUrl: (q) =>
      `https://www.google.com/search?q=${encodeURIComponent(`${label} ${q} football bet`)}`,
  };
}

/** Strip noise so bookmaker search hits the club name. */
export function bookmakerSearchQuery(home: string, away: string): string {
  const h = cleanTeam(home);
  const a = cleanTeam(away);
  const primary = preferSearchName(h, a);
  return primary.slice(0, 48);
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
): { url: string; searchFor: string; label: string; homeUrl: string } {
  const cfg = resolveBookOpenConfig(bookmaker);
  const searchFor = bookmakerSearchQuery(home, away);
  const label = bookLabel(bookmaker) || bookLabel(cfg.key);
  return {
    url: cfg.searchUrl(searchFor),
    searchFor,
    label,
    homeUrl: cfg.homeUrl,
  };
}

export type OpenBookmakerResult = {
  ok: boolean;
  searchFor: string;
  url: string;
  label: string;
  error?: string;
};

/**
 * Open a bookmaker site/app to a search for this fixture.
 * Exact event deep links are rarely public; keyword search is the reliable hand-off.
 */
export async function openBookmakerMatch(opts: {
  bookmaker: string;
  home: string;
  away: string;
}): Promise<OpenBookmakerResult> {
  const { url, searchFor, label, homeUrl } = bookmakerMatchUrl(
    opts.bookmaker,
    opts.home,
    opts.away
  );
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return { ok: true, searchFor, url, label };
    }
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
      return { ok: true, searchFor, url, label };
    }
    await Linking.openURL(homeUrl);
    return { ok: true, searchFor, url: homeUrl, label };
  } catch (e) {
    return {
      ok: false,
      searchFor,
      url,
      label,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
