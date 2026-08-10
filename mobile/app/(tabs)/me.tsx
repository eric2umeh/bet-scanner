import { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Alert,
} from 'react-native';

import { API_URL } from '../../src/api/client';
import {
  loadSettings,
  saveSettings,
  unitStakeNgn,
  type AppSettings,
} from '../../src/store/settings';
import { colors } from '../../src/theme/colors';

export default function MeScreen() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [bankroll, setBankroll] = useState('50000');
  const [unitPct, setUnitPct] = useState('1');
  const [pickMarket, setPickMarket] = useState<'double_chance' | '1x2'>('double_chance');

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      setBankroll(String(s.bankroll));
      setUnitPct(String(s.unitPct));
      setPickMarket(s.pickMarket);
    });
  }, []);

  async function onSave() {
    const next: AppSettings = {
      bankroll: Math.max(1000, Number(bankroll) || 50000),
      unitPct: Math.min(10, Math.max(0.1, Number(unitPct) || 1)),
      pickMarket,
    };
    await saveSettings(next);
    setSettings(next);
    Alert.alert('Saved', `Unit stake ≈ ₦${unitStakeNgn(next)}`);
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Me</Text>
      <Text style={styles.muted}>API · {API_URL}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Bankroll ₦</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={bankroll}
          onChangeText={setBankroll}
          placeholderTextColor={colors.muted}
        />
        <Text style={styles.label}>Unit %</Text>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          value={unitPct}
          onChangeText={setUnitPct}
          placeholderTextColor={colors.muted}
        />
        <Text style={styles.label}>Safe pick style</Text>
        <View style={styles.row}>
          {(['double_chance', '1x2'] as const).map((m) => (
            <Pressable
              key={m}
              style={[styles.chip, pickMarket === m && styles.chipOn]}
              onPress={() => setPickMarket(m)}
            >
              <Text style={[styles.chipText, pickMarket === m && styles.chipTextOn]}>
                {m === 'double_chance' ? 'Double chance' : '1X2 fav'}
              </Text>
            </Pressable>
          ))}
        </View>
        {settings ? (
          <Text style={styles.muted}>Suggested unit ≈ ₦{unitStakeNgn(settings)}</Text>
        ) : null}
        <Pressable style={styles.btn} onPress={onSave}>
          <Text style={styles.btnText}>Save settings</Text>
        </Pressable>
      </View>

      <Text style={[styles.muted, { marginTop: 16 }]}>
        Phase 11E next: slip converter + morning ops on this tab.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '700' },
  muted: { color: colors.muted, marginTop: 6, fontSize: 13, lineHeight: 18 },
  card: {
    marginTop: 16,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  label: { color: colors.muted, fontSize: 12, fontWeight: '600', marginTop: 6 },
  input: {
    backgroundColor: colors.bg,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    marginTop: 12,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { color: '#06241c', fontWeight: '700' },
});
