import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'betScannerSettingsV1';

export type PreferredBook = 'sportybet' | 'bet9ja';

export type AppSettings = {
  bankroll: number;
  unitPct: number;
  pickMarket: 'double_chance' | '1x2';
  /** Book used for Code Scout feed + default open-book actions. */
  preferredBook: PreferredBook;
};

const DEFAULTS: AppSettings = {
  bankroll: 50000,
  unitPct: 1,
  pickMarket: 'double_chance',
  preferredBook: 'sportybet',
};

function normalizeBook(raw: unknown): PreferredBook {
  return String(raw || '').toLowerCase() === 'bet9ja' ? 'bet9ja' : 'sportybet';
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      bankroll: Number(parsed.bankroll) || DEFAULTS.bankroll,
      unitPct: Number(parsed.unitPct) || DEFAULTS.unitPct,
      pickMarket: parsed.pickMarket === '1x2' ? '1x2' : 'double_chance',
      preferredBook: normalizeBook(parsed.preferredBook),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSettings(next: AppSettings): Promise<void> {
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({
      ...next,
      preferredBook: normalizeBook(next.preferredBook),
    })
  );
}

export function unitStakeNgn(settings: AppSettings): number {
  return Math.max(1, Math.round((settings.bankroll * settings.unitPct) / 100));
}
