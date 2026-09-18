import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { TipstersPanel } from '../../src/components/TipstersPanel';
import { colors } from '../../src/theme/colors';

export default function TipstersToolScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Your tipsters</Text>
        <Text style={styles.heroText}>
          Track booking codes from Instagram, Telegram, or Twitter for this signed-in account.
          Add stake and odds when you can — settle Won / Lost so your private leaderboard can rank
          hit rate and ROI.
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
