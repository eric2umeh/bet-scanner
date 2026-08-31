import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View, Platform } from 'react-native';

import { ToolHubCard } from '../../src/components/ToolHubCard';
import { colors } from '../../src/theme/colors';
import { webScrollBottom } from '../../src/theme/webScroll';

export default function ToolsHubScreen() {
  const router = useRouter();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        Platform.OS === 'web' ? { paddingBottom: webScrollBottom(20) } : null,
      ]}
    >
      <Text style={styles.lead}>
        Extra scanners and utilities. Arbitrage has its own tab — these tools help with value
        bets, tipster codes, and price checks.
      </Text>

      <ToolHubCard
        icon="line-chart"
        title="Value picks"
        description="Find +EV prices vs fair odds across SportyBet and Bet9ja. Log to Tips when ready."
        onPress={() => router.push('/tools/value')}
      />
      <ToolHubCard
        icon="exchange"
        title="Compare slip"
        description="Paste a slip in plain text — see SportyBet vs Bet9ja prices per leg."
        onPress={() => router.push('/tools/slip')}
      />
      <ToolHubCard
        icon="trophy"
        title="Tipsters"
        description="Track Instagram / Telegram booking codes, settle results, view leaderboard."
        onPress={() => router.push('/tools/tipsters')}
        accent="rgba(230, 184, 77, 0.18)"
      />

      <View style={styles.note}>
        <Text style={styles.noteTitle}>Quick tip</Text>
        <Text style={styles.noteText}>
          For surebets, use the Arb tab. For daily Safe picks, stay on Today. Morning routine and
          bankroll live under Me.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  lead: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  note: {
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  noteTitle: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  noteText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
});
