/** Phase 14C — Expo push registration + prefs. */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getJson, postJson } from '../api/client';
import { getAccessToken } from '../store/session';

export type PushPrefs = {
  notifyMorning: boolean;
  notifySettled: boolean;
};

const DEFAULT_PREFS: PushPrefs = {
  notifyMorning: true,
  notifySettled: true,
};

/** True in Expo Go — remote push was removed from Go on Android (SDK 53+). */
export function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

/**
 * Remote push only on real/dev builds — not web, not Expo Go.
 * Importing expo-notifications inside Expo Go logs a hard ERROR on Android.
 */
export function pushSupported(): boolean {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  if (isExpoGo()) return false;
  return true;
}

function projectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId ||
    undefined
  );
}

export async function fetchPushStatus(): Promise<{
  registered: boolean;
  devices: number;
  notify_morning?: boolean | null;
  notify_settled?: boolean | null;
  message: string;
}> {
  return getJson('/push/status');
}

export async function registerPushToken(
  token: string,
  prefs: PushPrefs = DEFAULT_PREFS
): Promise<void> {
  await postJson('/push/register', {
    token,
    platform: Platform.OS,
    notify_morning: prefs.notifyMorning,
    notify_settled: prefs.notifySettled,
  });
}

export async function unregisterPushToken(token?: string): Promise<void> {
  await postJson('/push/unregister', { token: token || null });
}

/**
 * Ask OS permission, get Expo push token, register with API.
 * No-op on web / Expo Go / when signed out.
 */
export async function syncPushRegistration(prefs: PushPrefs = DEFAULT_PREFS): Promise<{
  ok: boolean;
  message: string;
  token?: string;
}> {
  if (isExpoGo()) {
    return {
      ok: false,
      message: 'Push alerts need a Play/App or development build — not Expo Go.',
    };
  }
  if (!pushSupported()) {
    return {
      ok: false,
      message: 'Push alerts work on the Android / iOS app, not in the browser.',
    };
  }
  if (!getAccessToken()) {
    return { ok: false, message: 'Sign in to turn on push alerts.' };
  }

  try {
    const Notifications = await import('expo-notifications');
    const Device = await import('expo-device');

    if (!Device.isDevice) {
      return { ok: false, message: 'Push needs a real phone (not a simulator).' };
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') {
      return { ok: false, message: 'Notification permission was denied.' };
    }

    const pid = projectId();
    if (!pid) {
      return { ok: false, message: 'Missing Expo project id — rebuild the app.' };
    }

    const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId: pid });
    const token = tokenRes.data;
    if (!token) {
      return { ok: false, message: 'Could not get a push token.' };
    }

    await registerPushToken(token, prefs);
    return { ok: true, message: 'Push alerts enabled on this phone.', token };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function disablePushOnThisDevice(): Promise<{ ok: boolean; message: string }> {
  if (!pushSupported() || !getAccessToken()) {
    return { ok: true, message: 'Nothing to disable.' };
  }
  try {
    const Notifications = await import('expo-notifications');
    const pid = projectId();
    let token: string | undefined;
    if (pid) {
      try {
        const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId: pid });
        token = tokenRes.data;
      } catch {
        token = undefined;
      }
    }
    await unregisterPushToken(token);
    return { ok: true, message: 'Push alerts turned off for this phone.' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Configure how notifications appear when the app is open. */
export async function configureNotificationHandler(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    /* optional */
  }
}
