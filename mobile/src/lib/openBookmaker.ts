import { Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';

import { bookLabel } from './tipKey';

type BookOpenConfig = {
  /** Normalized key (sportybet, melbet, …). */
  key: string;
  homeUrl: string;
  /**
   * Stable landing page (football line / sports). Book “search” URLs often 404
   * or open the native app without applying the keyword — so we land here and
   * rely on a clipboard paste into in-app search.
   */
  landingUrl: string;
};

const BOOK_OPEN: Record<string, BookOpenConfig> = {
  sportybet: {
    key: 'sportybet',
    homeUrl: 'https://www.sportybet.com/ng/m',
    landingUrl: 'https://www.sportybet.com/ng/m/sport/football',
  },
  melbet: {
    key: 'melbet',
    homeUrl: 'https://melbet.com/en',
    landingUrl: 'https://melbet.com/en/line/football',
  },
  onexbet: {
    key: 'onexbet',
    homeUrl: 'https://1xbet.com/en',
    landingUrl: 'https://1xbet.com/en/line/football',
  },
  '1xbet': {
    key: 'onexbet',
    homeUrl: 'https://1xbet.com/en',
    landingUrl: 'https://1xbet.com/en/line/football',
  },
  bet9ja: {
    key: 'bet9ja',
    homeUrl: 'https://shop.bet9ja.com/',
    landingUrl: 'https://shop.bet9ja.com/',
  },
  betwinner: {
    key: 'betwinner',
    homeUrl: 'https://betwinner.com/',
    landingUrl: 'https://betwinner.com/en/line/football',
  },
  megapari: {
    key: 'megapari',
    homeUrl: 'https://megapari.com/',
    landingUrl: 'https://megapari.com/en/line/football',
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
    landingUrl: `https://www.google.com/search?q=${encodeURIComponent(`${label} football bet`)}`,
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
    url: cfg.landingUrl,
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
  /** True when the team name was copied for paste into book search. */
  copied: boolean;
  error?: string;
};

/**
 * Open a bookmaker football page and copy a team name for in-app search.
 * Exact event deep links are rarely public; search URLs often 404 or open the
 * native app without applying the keyword.
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
      return { ok: true, searchFor, url, label, copied };
    }
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
      return { ok: true, searchFor, url, label, copied };
    }
    await Linking.openURL(homeUrl);
    return { ok: true, searchFor, url: homeUrl, label, copied };
  } catch (e) {
    return {
      ok: false,
      searchFor,
      url,
      label,
      copied,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
