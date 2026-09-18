import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

const KEY = 'betScannerAppLockV1';

export type AppLockPrefs = {
  enabled: boolean;
};

const DEFAULTS: AppLockPrefs = { enabled: false };

export function appLockSupported(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export async function loadAppLockPrefs(): Promise<AppLockPrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AppLockPrefs>;
    return { enabled: !!parsed.enabled };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveAppLockPrefs(next: AppLockPrefs): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify({ enabled: !!next.enabled }));
}

export async function hardwareAuthAvailable(): Promise<boolean> {
  if (!appLockSupported()) return false;
  try {
    const has = await LocalAuthentication.hasHardwareAsync();
    if (!has) return false;
    return await LocalAuthentication.isEnrolledAsync();
  } catch {
    return false;
  }
}

export async function authenticateAppUnlock(): Promise<{ ok: boolean; message?: string }> {
  if (!appLockSupported()) {
    return { ok: true };
  }
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Bet Scout',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    if (result.success) return { ok: true };
    return { ok: false, message: 'Unlock cancelled or failed.' };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Could not unlock',
    };
  }
}
