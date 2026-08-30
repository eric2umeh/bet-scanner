import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { colors } from '../theme/colors';

type Props = {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function AccessDeniedPanel({
  title = 'Sign in required',
  message = 'Sign in on Me to use this page on this server.',
  actionLabel = 'Go to sign in',
  onAction,
}: Props) {
  const router = useRouter();

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.text}>{message}</Text>
      <Pressable
        style={styles.btn}
        onPress={onAction ?? (() => router.push('/(tabs)/me'))}
      >
        <Text style={styles.btnText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 20,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    gap: 10,
    alignItems: 'center',
  },
  title: { color: colors.ink, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  text: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  btn: {
    marginTop: 4,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 18,
  },
  btnText: { color: '#06241c', fontWeight: '700', fontSize: 14 },
});
