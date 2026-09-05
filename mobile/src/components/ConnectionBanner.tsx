import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pingHealth } from '../api/client';
import { colors } from '../theme/colors';

type Kind = 'offline' | 'server' | null;

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
        await pingHealth();
        if (!cancelled) setKind(null);
      } catch {
        if (!cancelled) setKind('server');
      }
    }

    const unsub = NetInfo.addEventListener((state) => {
      void check(state.isConnected);
    });

    NetInfo.fetch().then((state) => void check(state.isConnected));
    const timer = setInterval(() => {
      NetInfo.fetch().then((state) => void check(state.isConnected));
    }, 45_000);

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
