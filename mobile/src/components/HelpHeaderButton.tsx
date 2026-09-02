import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { colors } from '../theme/colors';

export function HelpHeaderButton() {
  const router = useRouter();
  return (
    <Pressable
      style={styles.btn}
      onPress={() => router.push('/help')}
      accessibilityRole="button"
      accessibilityLabel="Help and FAQ"
    >
      <FontAwesome name="question-circle" size={22} color={colors.accent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    marginRight: 4,
    padding: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 168, 0.35)',
    backgroundColor: 'rgba(45, 212, 168, 0.1)',
  },
});
