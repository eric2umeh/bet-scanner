import FontAwesome from '@expo/vector-icons/FontAwesome';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';

type Props = {
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** Show “Refresh” label — helpful on narrow web where the icon alone can be missed. */
  showLabel?: boolean;
};

export function SyncHeaderButton({ onPress, disabled, busy, showLabel }: Props) {
  const off = disabled || busy;
  return (
    <Pressable
      style={[styles.btn, showLabel && styles.btnLabeled, off && styles.btnDisabled]}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel="Sync odds and rescan Safe picks"
      accessibilityHint="Refresh odds and tips"
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <View style={styles.inner}>
          <FontAwesome name="refresh" size={showLabel ? 16 : 20} color={colors.accent} />
          {showLabel ? <Text style={styles.label}>Refresh</Text> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    padding: 8,
    borderRadius: 20,
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 168, 0.45)',
    backgroundColor: 'rgba(45, 212, 168, 0.14)',
  },
  btnLabeled: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: undefined,
  },
  btnDisabled: { opacity: 0.45 },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { color: colors.accent, fontWeight: '800', fontSize: 13 },
});
