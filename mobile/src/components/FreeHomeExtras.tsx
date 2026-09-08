import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';

/**
 * Compact free shortcuts for the Home status line (value tips + morning brief).
 */
export function FreeHomeExtras() {
  const router = useRouter();

  return (
    <View style={styles.row}>
      <Pressable
        style={styles.btn}
        onPress={() => router.push('/tools/value')}
        accessibilityRole="button"
        accessibilityLabel="Free tips"
        hitSlop={4}
      >
        <FontAwesome name="gift" size={11} color={colors.accent} />
        <Text style={styles.btnText}>Free tips</Text>
      </Pressable>
      <Pressable
        style={styles.btn}
        onPress={() => router.push('/tools/morning')}
        accessibilityRole="button"
        accessibilityLabel="Match brief"
        hitSlop={4}
      >
        <FontAwesome name="magic" size={11} color={colors.accent} />
        <Text style={styles.btnText}>Brief</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(15, 138, 95, 0.35)',
    backgroundColor: colors.accentDim,
  },
  btnText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
  },
});
