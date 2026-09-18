import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandLogo } from './BrandLogo';
import { LoadingRadar } from './LoadingRadar';
import { colors } from '../theme/colors';
import {
  appLockSupported,
  authenticateAppUnlock,
  loadAppLockPrefs,
} from '../store/appLock';

type Props = {
  children: React.ReactNode;
};

/**
 * Optional device biometrics / PIN gate when user enables App Lock in Settings.
 * Skipped on web and when lock is off.
 */
export function AppLockGate({ children }: Props) {
  const [checking, setChecking] = useState(appLockSupported());
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const evaluate = useCallback(async (forcePrompt: boolean) => {
    if (!appLockSupported()) {
      setChecking(false);
      setLocked(false);
      return;
    }
    const prefs = await loadAppLockPrefs();
    if (!prefs.enabled) {
      setLocked(false);
      setChecking(false);
      return;
    }
    setLocked(true);
    setChecking(false);
    if (!forcePrompt) return;
    setBusy(true);
    setHint(null);
    const res = await authenticateAppUnlock();
    setBusy(false);
    if (res.ok) {
      setLocked(false);
      setHint(null);
    } else {
      setHint(res.message || 'Unlock failed.');
    }
  }, []);

  useEffect(() => {
    void evaluate(true);
  }, [evaluate]);

  useEffect(() => {
    if (!appLockSupported()) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void (async () => {
          const prefs = await loadAppLockPrefs();
          if (prefs.enabled) {
            setLocked(true);
            await evaluate(true);
          }
        })();
      }
    });
    return () => sub.remove();
  }, [evaluate]);

  if (!appLockSupported() || Platform.OS === 'web') {
    return <>{children}</>;
  }

  if (checking) {
    return (
      <View style={styles.gate}>
        <LoadingRadar />
      </View>
    );
  }

  if (!locked) {
    return <>{children}</>;
  }

  return (
    <View style={styles.gate}>
      <BrandLogo size="lg" showWordmark stacked />
      <Text style={styles.title}>App locked</Text>
      <Text style={styles.muted}>Use fingerprint, Face ID, or your device PIN to continue.</Text>
      {hint ? <Text style={styles.error}>{hint}</Text> : null}
      <Pressable
        style={[styles.btn, busy && styles.disabled]}
        disabled={busy}
        onPress={() => void evaluate(true)}
      >
        {busy ? (
          <LoadingRadar color={colors.onAccent} />
        ) : (
          <Text style={styles.btnText}>Unlock</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  gate: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  title: { color: colors.ink, fontSize: 22, fontWeight: '800', marginTop: 12 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  error: { color: colors.bad, fontSize: 13, textAlign: 'center' },
  btn: {
    marginTop: 16,
    minWidth: 160,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  btnText: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },
});
