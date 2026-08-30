import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';
import { EdgePanel } from './EdgePanel';
import { TipstersPanel } from './TipstersPanel';

type Props = {
  onFlash?: (msg: string, bad?: boolean) => void;
};

export function AdvancedTools({ onFlash }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.card}>
      <Pressable
        style={styles.summary}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.chevron}>{open ? '▼' : '▶'}</Text>
        <View style={styles.summaryText}>
          <Text style={styles.summaryTitle}>Advanced tools</Text>
          <Text style={styles.summaryHint}>value · surebets · tipsters</Text>
        </View>
      </Pressable>
      {open ? (
        <View style={styles.body}>
          <EdgePanel active={open} onFlash={onFlash} />
          <TipstersPanel active={open} onFlash={onFlash} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chevron: {
    color: colors.muted,
    fontSize: 12,
    width: 16,
  },
  summaryText: { flex: 1 },
  summaryTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  summaryHint: { color: colors.muted, fontSize: 12, marginTop: 2 },
  body: { marginTop: 4 },
});
