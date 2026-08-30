import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { HelpDesk } from '../src/components/HelpDesk';
import { ModalShell } from '../src/components/modal';
import { colors } from '../src/theme/colors';

export default function HelpScreen() {
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <ModalShell
        title="Help"
        variant="sheet"
        fill
        onClose={() => router.back()}
      >
        <HelpDesk embedded />
      </ModalShell>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
});
