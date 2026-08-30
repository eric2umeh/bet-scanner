import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { TipstersPanel } from '../../src/components/TipstersPanel';
import { colors } from '../../src/theme/colors';

export default function TipstersToolScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Tipster tracker</Text>
        <Text style={styles.heroText}>
          Log booking codes from Instagram, Telegram, or Twitter. Settle won/lost when you know the
          result — the leaderboard ranks hit rate over time.
        </Text>
      </View>
      <TipstersPanel active />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  hero: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    marginBottom: 4,
  },
  heroTitle: { color: colors.ink, fontWeight: '800', fontSize: 16 },
  heroText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
});
