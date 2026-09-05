import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../theme/colors';

const PRESETS = [0, 60, 65, 70, 75, 80, 85] as const;

type Props = {
  value: number;
  onChange: (minPct: number) => void;
  /** Fired for preset / Clear taps so the parent can close the sheet immediately. */
  onCommit?: (minPct: number) => void;
};

/** Lean ≥ controls (presets + number). Used inside filter sheets. */
export function LeanPctPanel({ value, onChange, onCommit }: Props) {
  const active = value > 0;

  function commit(n: number) {
    onChange(n);
    onCommit?.(n);
  }

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
    <View>
      <View style={styles.head}>
        <Text style={styles.label}>Lean ≥</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={active ? String(value) : ''}
          onChangeText={setFromInput}
          onEndEditing={(e) => {
            const cleaned = String(e.nativeEvent.text || '').replace(/[^\d]/g, '');
            if (!cleaned) {
              commit(0);
              return;
            }
            const n = Math.min(99, Math.max(0, Number(cleaned)));
            commit(Number.isFinite(n) ? n : 0);
          }}
          placeholder="off"
          placeholderTextColor={colors.muted}
          maxLength={2}
        />
        <Text style={styles.unit}>%</Text>
        {active ? (
          <Pressable onPress={() => commit(0)} hitSlop={8}>
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.hint}>Hide tips below this lean strength (odds gap, not win rate).</Text>
      <View style={styles.presets}>
        {PRESETS.map((p) => {
          const on = (p === 0 && !active) || (p > 0 && value === p);
          return (
            <Pressable key={p} style={[styles.chip, on && styles.chipOn]} onPress={() => commit(p)}>
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
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  input: {
    minWidth: 44,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  unit: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  clear: { color: colors.accent, fontSize: 12, fontWeight: '700', marginLeft: 4 },
  hint: { color: colors.muted, fontSize: 11, lineHeight: 15, marginBottom: 10 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  chipText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  chipTextOn: { color: colors.accent },
});
