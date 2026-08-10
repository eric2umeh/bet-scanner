import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'betScannerOnboardingDoneV1';
const SETTINGS_KEY = 'betScannerSettingsV1';

export async function isOnboardingDone(): Promise<boolean> {
  try {
    if ((await AsyncStorage.getItem(KEY)) === '1') return true;
    // Returning users who already saved settings skip the wizard once.
    if (await AsyncStorage.getItem(SETTINGS_KEY)) {
      await AsyncStorage.setItem(KEY, '1');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function markOnboardingDone(): Promise<void> {
  await AsyncStorage.setItem(KEY, '1');
}

export async function resetOnboarding(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
