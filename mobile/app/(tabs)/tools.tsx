import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Platform } from 'react-native';

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
      <ToolHubCard
        icon="sun-o"
        title="Daily update"
        description="Fixtures, settle tips, decision brief"
        onPress={() => router.push('/tools/morning')}
      />
      <ToolHubCard
        icon="line-chart"
        title="Value picks"
        description="Better prices across your books"
        onPress={() => router.push('/tools/value')}
      />
      <ToolHubCard
        icon="exchange"
        title="Compare slip"
        description="Paste a slip · check book prices"
        onPress={() => router.push('/tools/slip')}
      />
      <ToolHubCard
        icon="trophy"
        title="Tipsters"
        description="Booking codes · settle · leaderboard"
        onPress={() => router.push('/tools/tipsters')}
        accent="rgba(230, 184, 77, 0.18)"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
});
