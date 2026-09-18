import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { API_URL, userFacingError } from '../src/api/client';
import { BrandLogo } from '../src/components/BrandLogo';
import { LoadingRadar } from '../src/components/LoadingRadar';
import { markOnboardingDone } from '../src/store/onboarding';
import { saveSettings, unitStakeNgn, type AppSettings } from '../src/store/settings';
import { colors } from '../src/theme/colors';

export default function OnboardingScreen() {
  const router = useRouter();
  const [bankroll, setBankroll] = useState('50000');
  const [unitPct, setUnitPct] = useState('1');
  const [pickMarket, setPickMarket] = useState<'double_chance' | '1x2'>('double_chance');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  async function onFinish() {
    setBusy(true);
    setHint(null);
    try {
      const next: AppSettings = {
        bankroll: Math.max(1000, Number(bankroll) || 50000),
        unitPct: Math.min(10, Math.max(0.1, Number(unitPct) || 1)),
        pickMarket,
        preferredBook: 'sportybet',
      };
      await saveSettings(next);
      // Access key is developer-only (Account → Settings when signed in as developer).
      await markOnboardingDone();
      router.replace('/(tabs)');
    } catch (e) {
      setHint(userFacingError(e));
    } finally {
      setBusy(false);
    }
  }

  const preview: AppSettings = {
    bankroll: Math.max(1000, Number(bankroll) || 50000),
    unitPct: Math.min(10, Math.max(0.1, Number(unitPct) || 1)),
    pickMarket,
    preferredBook: 'sportybet',
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <BrandLogo size="xl" showWordmark stacked style={{ marginBottom: 16 }} />
      <Text style={styles.title}>Welcome to Bet Scout</Text>
      <Text style={styles.muted}>
        Set your bankroll and Safe tip style. Change anything later under Account → Settings.
      </Text>
      <Text style={styles.muted}>
        After you finish, sign in on Account so tips, tipsters, and history stay with your account.
      </Text>
      {__DEV__ ? (
        <Text style={styles.devLine}>Dev server · {API_URL.replace(/^https?:\/\//, '')}</Text>
      ) : null}

      <Text style={styles.label}>Bankroll (₦)</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={bankroll}
        onChangeText={setBankroll}
        placeholderTextColor={colors.muted}
      />

      <Text style={styles.label}>Unit size (% of bankroll)</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        value={unitPct}
        onChangeText={setUnitPct}
        placeholderTextColor={colors.muted}
      />
      <Text style={styles.muted}>Suggested stake ≈ ₦{unitStakeNgn(preview)}</Text>

      <Text style={styles.label}>Safe tip style</Text>
      <View style={styles.row}>
        {(['double_chance', '1x2'] as const).map((m) => (
          <Pressable
            key={m}
            style={[styles.chip, pickMarket === m && styles.chipOn]}
            onPress={() => setPickMarket(m)}
          >
            <Text style={[styles.chipText, pickMarket === m && styles.chipTextOn]}>
              {m === 'double_chance' ? 'Double chance' : '1X2 favourite'}
            </Text>
          </Pressable>
        ))}
      </View>

      {hint ? <Text style={styles.error}>{hint}</Text> : null}

      <Pressable
        style={[styles.btn, busy && styles.disabled]}
        disabled={busy}
        onPress={() => void onFinish()}
      >
        {busy ? (
          <View style={styles.btnInner}>
            <LoadingRadar color={colors.onAccent} style={{ marginRight: 8 }} />
            <Text style={styles.btnText}>Saving…</Text>
          </View>
        ) : (
          <Text style={styles.btnText}>Get started</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48, gap: 8 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '700', marginTop: 4 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  devLine: { color: colors.muted, fontSize: 11, marginTop: 4, opacity: 0.8 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '600', marginTop: 12 },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.ink,
  },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  chipText: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  chipTextOn: { color: colors.accent },
  btn: {
    marginTop: 20,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnInner: { flexDirection: 'row', alignItems: 'center' },
  disabled: { opacity: 0.6 },
  btnText: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },
  error: { color: colors.bad, marginTop: 8, fontSize: 13 },
});
