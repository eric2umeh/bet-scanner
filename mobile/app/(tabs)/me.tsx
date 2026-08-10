import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../../src/theme/colors';

export default function MeScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Me</Text>
      <Text style={styles.muted}>
        Phase 11E: bankroll settings, morning ops, slip converter (POST /convert/slip).
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '700' },
  muted: { color: colors.muted, marginTop: 8, lineHeight: 20 },
});
