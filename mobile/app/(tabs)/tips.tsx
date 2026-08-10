import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../../src/theme/colors';

export default function TipsScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Tips</Text>
      <Text style={styles.muted}>
        Phase 11D: GET /tips, stats, settle, multi slip cards, auto-settle.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '700' },
  muted: { color: colors.muted, marginTop: 8, lineHeight: 20 },
});
