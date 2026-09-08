import FontAwesome from '@expo/vector-icons/FontAwesome';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';

type Props = {
  onPress: () => void;
  /** When busy, tapping shows Cancel and calls this (aborts in-flight work). */
  onCancel?: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** Show text label (default true on callers that pass it). */
  showLabel?: boolean;
  /** Show leading icon (download). Set false for non-sync actions. */
  showIcon?: boolean;
  /** Button label — default “Load matches” (not browser refresh). */
  label?: string;
  cancelLabel?: string;
};

export function SyncHeaderButton({
  onPress,
  onCancel,
  disabled,
  busy,
  showLabel = true,
  showIcon = true,
  label = 'Load matches',
  cancelLabel = 'Cancel',
}: Props) {
  if (busy && onCancel) {
    return (
      <Pressable
        style={[styles.btn, showLabel && styles.btnLabeled, styles.btnCancel]}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel={cancelLabel}
      >
        <View style={styles.inner}>
          <ActivityIndicator size="small" color="#fecaca" />
          {showLabel ? <Text style={styles.cancelLabel}>{cancelLabel}</Text> : null}
        </View>
      </Pressable>
    );
  }

  const off = disabled || busy;
  return (
    <Pressable
      style={[styles.btn, showLabel && styles.btnLabeled, off && styles.btnDisabled]}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Fetches fresh odds and rebuilds Home tips — not the same as browser refresh"
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <View style={styles.inner}>
          {showIcon ? (
            <FontAwesome name="download" size={showLabel ? 15 : 18} color={colors.accent} />
          ) : null}
          {showLabel ? <Text style={styles.label}>{label}</Text> : null}
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
  btnCancel: {
    borderColor: 'rgba(248, 113, 113, 0.55)',
    backgroundColor: 'rgba(248, 113, 113, 0.14)',
  },
  btnDisabled: { opacity: 0.45 },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { color: colors.accent, fontWeight: '800', fontSize: 12 },
  cancelLabel: { color: '#fecaca', fontWeight: '800', fontSize: 12 },
});
