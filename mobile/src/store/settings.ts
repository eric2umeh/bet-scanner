import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'betScannerSettingsV1';

export type AppSettings = {
  bankroll: number;
  unitPct: number;
  pickMarket: 'double_chance' | '1x2';
};

const DEFAULTS: AppSettings = {
  bankroll: 50000,
  unitPct: 1,
  pickMarket: 'double_chance',
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      bankroll: Number(parsed.bankroll) || DEFAULTS.bankroll,
      unitPct: Number(parsed.unitPct) || DEFAULTS.unitPct,
      pickMarket: parsed.pickMarket === '1x2' ? '1x2' : 'double_chance',
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSettings(next: AppSettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

export function unitStakeNgn(settings: AppSettings): number {
  return Math.max(1, Math.round((settings.bankroll * settings.unitPct) / 100));
}
