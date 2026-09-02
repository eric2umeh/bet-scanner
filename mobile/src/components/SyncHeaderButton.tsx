import FontAwesome from '@expo/vector-icons/FontAwesome';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { colors } from '../theme/colors';

type Props = {
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
};

export function SyncHeaderButton({ onPress, disabled, busy }: Props) {
  const off = disabled || busy;
  return (
    <Pressable
      style={[styles.btn, off && styles.btnDisabled]}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel="Sync odds and rescan Safe picks"
      accessibilityHint="Same as pull down to refresh on Today"
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <FontAwesome name="refresh" size={20} color={colors.accent} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    padding: 8,
    borderRadius: 20,
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 168, 0.35)',
    backgroundColor: 'rgba(45, 212, 168, 0.1)',
  },
  btnDisabled: { opacity: 0.45 },
});
