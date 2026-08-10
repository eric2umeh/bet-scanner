import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { API_URL, pingHealth, type HealthResponse } from '../../src/api/client';
import { colors } from '../../src/theme/colors';

export default function TodayScreen() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const h = await pingHealth();
      setHealth(h);
    } catch (e) {
      setHealth(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />
      }
    >
      <Text style={styles.kicker}>Bet Scanner</Text>
      <Text style={styles.title}>Today</Text>
      <Text style={styles.muted}>
        Native Expo client (SDK 54) → FastAPI. Next: matches + Safe tips.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>API</Text>
        <Text style={styles.mono}>{API_URL}</Text>
        {loading && !health ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} />
        ) : error ? (
          <>
            <Text style={styles.bad}>Offline / error</Text>
            <Text style={styles.muted}>{error}</Text>
            <Text style={styles.hint}>
              On phone: API must be http://YOUR_MAC_IP:8000 with uvicorn --host 0.0.0.0
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.good}>Connected · v{health?.version ?? '?'}</Text>
            <Text style={styles.muted}>
              env: {health?.env ?? '—'} · status: {health?.status}
            </Text>
          </>
        )}
        <Pressable style={styles.btn} onPress={load}>
          <Text style={styles.btnText}>Ping /health</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  kicker: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.4,
  },
  title: { color: colors.ink, fontSize: 28, fontWeight: '700', marginTop: 4 },
  muted: { color: colors.muted, marginTop: 8, lineHeight: 20 },
  hint: { color: colors.muted, marginTop: 8, fontSize: 12, lineHeight: 18 },
  card: {
    marginTop: 20,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  cardLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  mono: { color: colors.ink, marginTop: 6, fontSize: 13 },
  good: { color: colors.good, marginTop: 12, fontWeight: '700' },
  bad: { color: colors.bad, marginTop: 12, fontWeight: '700' },
  btn: {
    marginTop: 16,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { color: '#06241c', fontWeight: '700' },
});
