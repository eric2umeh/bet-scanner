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

import { API_URL, setCachedAccessKey } from '../src/api/client';
import { saveAccessKey } from '../src/store/accessKey';
import { markOnboardingDone } from '../src/store/onboarding';
import { BrandLogo } from '../src/components/BrandLogo';
import { saveSettings, unitStakeNgn, type AppSettings } from '../src/store/settings';
import { colors } from '../src/theme/colors';

export default function OnboardingScreen() {
  const router = useRouter();
  const [bankroll, setBankroll] = useState('50000');
  const [unitPct, setUnitPct] = useState('1');
  const [pickMarket, setPickMarket] = useState<'double_chance' | '1x2'>('double_chance');
  const [accessKey, setAccessKey] = useState('');
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
      };
      await saveSettings(next);
      await saveAccessKey(accessKey);
      setCachedAccessKey(accessKey.trim() || null);
      await markOnboardingDone();
      router.replace('/(tabs)');
    } catch (e) {
      setHint(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const preview: AppSettings = {
    bankroll: Math.max(1000, Number(bankroll) || 50000),
    unitPct: Math.min(10, Math.max(0.1, Number(unitPct) || 1)),
    pickMarket,
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <BrandLogo size="xl" showWordmark stacked style={{ marginBottom: 16 }} />
      <Text style={styles.title}>Quick setup</Text>
      <Text style={styles.muted}>
        Set your bankroll and how you like Safe tips. You can change everything later under Me.
      </Text>
      <Text style={styles.muted}>Server · {API_URL.replace(/^https?:\/\//, '')}</Text>

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

      <Text style={styles.label}>App access key (optional)</Text>
      <Text style={styles.hint}>
        Only needed if your server has APP_API_KEY set. Leave blank for open local / learning
        servers.
      </Text>
      <TextInput
        style={styles.input}
        value={accessKey}
        onChangeText={setAccessKey}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        placeholder="Same value as APP_API_KEY on the server"
        placeholderTextColor={colors.muted}
      />

      {hint ? <Text style={styles.error}>{hint}</Text> : null}

      <Pressable style={[styles.btn, busy && styles.disabled]} disabled={busy} onPress={onFinish}>
        <Text style={styles.btnText}>Get started</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48, gap: 8 },
  kicker: { color: colors.accent, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  title: { color: colors.ink, fontSize: 30, fontWeight: '700', marginTop: 4 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginBottom: 2 },
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
  disabled: { opacity: 0.6 },
  btnText: { color: '#06241c', fontWeight: '700', fontSize: 16 },
  error: { color: colors.bad, marginTop: 8, fontSize: 13 },
});
