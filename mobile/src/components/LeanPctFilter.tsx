import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../theme/colors';

const PRESETS = [0, 60, 65, 70, 75, 80, 85] as const;

type Props = {
  /** 0 = no filter; otherwise show tips with lean ≥ this % */
  value: number;
  onChange: (minPct: number) => void;
  style?: object;
};

/**
 * Minimum lean / confidence filter for Today & Tips.
 * Lean % is odds-gap strength (not guaranteed win rate).
 */
export function LeanPctFilter({ value, onChange, style }: Props) {
  const active = value > 0;

  function setFromInput(raw: string) {
    const cleaned = raw.replace(/[^\d]/g, '');
    if (!cleaned) {
      onChange(0);
      return;
    }
    const n = Math.min(99, Math.max(0, Number(cleaned)));
    onChange(Number.isFinite(n) ? n : 0);
  }

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.head}>
        <Text style={styles.label}>Lean ≥</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={active ? String(value) : ''}
          onChangeText={setFromInput}
          placeholder="off"
          placeholderTextColor={colors.muted}
          maxLength={2}
        />
        <Text style={styles.unit}>%</Text>
        {active ? (
          <Pressable onPress={() => onChange(0)} hitSlop={8}>
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.presets}>
        {PRESETS.map((p) => {
          const on = (p === 0 && !active) || (p > 0 && value === p);
          return (
            <Pressable
              key={p}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => onChange(p)}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {p === 0 ? 'All' : `${p}+`}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  input: {
    minWidth: 44,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  unit: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  clear: { color: colors.accent, fontSize: 12, fontWeight: '700', marginLeft: 4 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  chipText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  chipTextOn: { color: colors.accent },
});
