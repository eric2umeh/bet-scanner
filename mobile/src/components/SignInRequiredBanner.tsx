import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { colors } from '../theme/colors';

type Props = {
  message?: string;
};

export function SignInRequiredBanner({ message }: Props) {
  const router = useRouter();
  return (
    <View style={styles.box}>
      <Text style={styles.text}>
        {message || 'Sign in on Me to log and view your tips on this server.'}
      </Text>
      <Pressable style={styles.btn} onPress={() => router.push('/(tabs)/me')}>
        <Text style={styles.btnText}>Go to Me → Account</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.warn,
    backgroundColor: 'rgba(230, 184, 77, 0.12)',
    gap: 10,
  },
  text: { color: colors.ink, fontSize: 13, lineHeight: 18 },
  btn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  btnText: { color: '#06241c', fontWeight: '700', fontSize: 13 },
});
