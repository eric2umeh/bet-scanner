import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'betScannerPushPrefsV1';

export type PushPrefsLocal = {
  enabled: boolean;
  notifyMorning: boolean;
  notifySettled: boolean;
};

const DEFAULTS: PushPrefsLocal = {
  enabled: true,
  notifyMorning: true,
  notifySettled: true,
};

export async function loadPushPrefs(): Promise<PushPrefsLocal> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<PushPrefsLocal>;
    return {
      enabled: parsed.enabled !== false,
      notifyMorning: parsed.notifyMorning !== false,
      notifySettled: parsed.notifySettled !== false,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function savePushPrefs(next: PushPrefsLocal): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}
