import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getJson } from '../api/client';
import { colors } from '../theme/colors';

type Kind = 'offline' | 'server' | 'db' | null;

type HealthPayload = {
  status?: string;
  db_ok?: boolean;
};

/**
 * Top banner when the phone has no internet, or Bet Scout's server
 * does not answer a quick health check.
 */
export function ConnectionBanner() {
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState<Kind>(null);

  useEffect(() => {
    let cancelled = false;

    async function check(isConnected: boolean | null) {
      if (isConnected === false) {
        if (!cancelled) setKind('offline');
        return;
      }
      try {
        // Short timeout — don't sit on the 55s Render wake used by data calls.
        const health = await getJson<HealthPayload>('/health', { timeoutMs: 10000 });
        if (cancelled) return;
        if (health?.db_ok === false) {
          setKind('db');
        } else {
          setKind(null);
        }
      } catch {
        if (!cancelled) setKind('server');
      }
    }

    const unsub = NetInfo.addEventListener((state) => {
      void check(state.isConnected);
    });

    NetInfo.fetch().then((state) => void check(state.isConnected));
    // Retry faster while broken so the banner clears soon after wake / pool free.
    const timer = setInterval(() => {
      NetInfo.fetch().then((state) => void check(state.isConnected));
    }, 15_000);

    return () => {
      cancelled = true;
      unsub();
      clearInterval(timer);
    };
  }, []);

  if (!kind) return null;

  const message =
    kind === 'offline'
      ? 'No internet connection. Tips and prices will not update until you are back online.'
      : kind === 'db'
        ? 'Server is up but the database is busy or full (connection pool). Wait a minute, then pull down to refresh. Avoid running many local + Render copies at once.'
        : 'Cannot reach the Bet Scout server. It may be waking up — wait a minute and pull down to refresh.';

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) }]}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#5c2b2b',
    borderBottomWidth: 1,
    borderBottomColor: colors.bad,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  text: {
    color: '#ffd4d4',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
});
