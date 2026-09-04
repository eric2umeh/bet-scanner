import { Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors } from '../theme/colors';

type Props = {
  pct?: number | null;
  style?: object;
};

/**
 * Legacy-style lean / confidence meter (pct label + pill progress bar).
 * Matches dashboard.html `.conf` / `.conf-bar`.
 */
export function LeanBar({ pct, style }: Props) {
  const raw = Number(pct);
  const n = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0;
  const label = n ? `${Number(n.toFixed(1))}%` : '—';

  const fillStyle: ViewStyle = {
    width: `${n}%`,
  };
  if (Platform.OS === 'web') {
    Object.assign(fillStyle, {
      backgroundImage: 'linear-gradient(90deg, #1fa87f, #2dd4a8)',
    });
  }

  return (
    <View style={[styles.wrap, style]} accessibilityLabel={n ? `Lean ${label}` : 'No lean'}>
      <Text style={styles.pct}>{label}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, fillStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexShrink: 0,
    width: 72,
    alignItems: 'flex-end',
  },
  pct: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
    marginBottom: 4,
  },
  track: {
    width: '100%',
    height: 4,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 99,
    backgroundColor: colors.accent,
  },
});
