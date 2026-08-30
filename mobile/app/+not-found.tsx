import { Link, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandLogo } from '../src/components/BrandLogo';
import { colors } from '../src/theme/colors';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Page not found' }} />
      <View style={styles.container}>
        <BrandLogo size="lg" />
        <Text style={styles.title}>Page not found</Text>
        <Text style={styles.muted}>
          This link does not exist or you may need to sign in first.
        </Text>

        <Link href="/" asChild>
          <Pressable style={styles.btn}>
            <Text style={styles.btnText}>Back to Today</Text>
          </Pressable>
        </Link>

        <Link href="/(tabs)/me" asChild>
          <Pressable style={styles.link}>
            <Text style={styles.linkText}>Sign in on Me</Text>
          </Pressable>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.bg,
    gap: 10,
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '700',
    marginTop: 8,
  },
  muted: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 320,
  },
  btn: {
    marginTop: 12,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  btnText: { color: '#06241c', fontWeight: '700', fontSize: 15 },
  link: { marginTop: 8, paddingVertical: 10 },
  linkText: { color: colors.accent, fontWeight: '600', fontSize: 14 },
});
