import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'betScannerAppApiKey';

/** Web has no SecureStore — fall back to AsyncStorage (dev only). */
async function storageGet(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(KEY);
  }
  return SecureStore.getItemAsync(KEY);
}

async function storageSet(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(KEY, value);
    return;
  }
  await SecureStore.setItemAsync(KEY, value);
}

async function storageDelete(): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(KEY);
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}

export async function loadAccessKey(): Promise<string> {
  try {
    const stored = ((await storageGet()) || '').trim();
    if (stored) return stored;
    // Baked into web/native builds so Render clients don't need Me → access key
    const fromEnv = (process.env.EXPO_PUBLIC_APP_API_KEY || '').trim();
    return fromEnv;
  } catch {
    return (process.env.EXPO_PUBLIC_APP_API_KEY || '').trim();
  }
}

export async function saveAccessKey(key: string): Promise<void> {
  const v = key.trim();
  if (!v) {
    await storageDelete();
    return;
  }
  await storageSet(v);
}
