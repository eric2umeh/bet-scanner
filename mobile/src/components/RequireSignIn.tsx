import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { SignInRequiredBanner } from './SignInRequiredBanner';
import { useMustSignIn } from '../hooks/useMustSignIn';
import { colors } from '../theme/colors';

type Props = {
  children: ReactNode;
  /** Optional override copy (no “trial” / paid language). */
  message?: string;
};

/**
 * Blocks tab content until the user signs in (Account stays open for signup).
 */
export function RequireSignIn({ children, message }: Props) {
  const must = useMustSignIn();
  if (!must) return <>{children}</>;
  return (
    <View style={styles.wrap}>
      <SignInRequiredBanner
        title="Sign in to continue"
        message={
          message ||
          'Create a free account or sign in on Account to use Bet Scout tips, surebets, and tools.'
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingTop: 24,
  },
});
