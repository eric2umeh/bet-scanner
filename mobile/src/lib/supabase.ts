import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const anon = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anon);
}

/** Expo SecureStore warns / will throw above 2048 bytes; JWT sessions are larger. */
const SECURE_CHUNK = 1800;

function chunkKey(key: string, i: number) {
  return `${key}__${i}`;
}

async function nativeRemove(key: string) {
  await SecureStore.deleteItemAsync(key);
  for (let i = 0; ; i++) {
    const k = chunkKey(key, i);
    const part = await SecureStore.getItemAsync(k);
    if (part == null) break;
    await SecureStore.deleteItemAsync(k);
  }
}

async function nativeSet(key: string, value: string) {
  await nativeRemove(key);
  if (value.length <= SECURE_CHUNK) {
    await SecureStore.setItemAsync(key, value);
    return;
  }
  for (let i = 0, o = 0; o < value.length; i++, o += SECURE_CHUNK) {
    await SecureStore.setItemAsync(chunkKey(key, i), value.slice(o, o + SECURE_CHUNK));
  }
}

async function nativeGet(key: string) {
  const whole = await SecureStore.getItemAsync(key);
  if (whole != null) {
    if (whole.length > SECURE_CHUNK) await nativeSet(key, whole);
    return whole;
  }
  const parts: string[] = [];
  for (let i = 0; ; i++) {
    const part = await SecureStore.getItemAsync(chunkKey(key, i));
    if (part == null) break;
    parts.push(part);
  }
  return parts.length ? parts.join('') : null;
}

/** Native: chunked SecureStore. Web: AsyncStorage (no SecureStore). */
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    if (Platform.OS === 'web') return AsyncStorage.getItem(key);
    return nativeGet(key);
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === 'web') return AsyncStorage.setItem(key, value);
    return nativeSet(key, value);
  },
  removeItem: (key: string) => {
    if (Platform.OS === 'web') return AsyncStorage.removeItem(key);
    return nativeRemove(key);
  },
};

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(url, anon, {
      auth: {
        storage: ExpoSecureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

export type { Session };
