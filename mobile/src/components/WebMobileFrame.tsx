import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import { WEB_APP_MAX_WIDTH } from '../theme/layout';
import { colors } from '../theme/colors';

type Props = {
  children: React.ReactNode;
};

/** Below this width: full-bleed (phones / Fold cover). Above: desktop phone shell. */
const SHELL_MIN_WIDTH = 560;

/**
 * Desktop web: centered phone/tablet shell.
 * Narrow web (Samsung Fold cover, phones): full-bleed — no padding that steals width.
 */
export function WebMobileFrame({ children }: Props) {
  const { width } = useWindowDimensions();

  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  const useShell = width >= SHELL_MIN_WIDTH;

  if (!useShell) {
    return <View style={styles.fullBleed}>{children}</View>;
  }

  return (
    <View style={styles.outer}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullBleed: {
    flex: 1,
    width: '100%',
    minHeight: '100%',
    backgroundColor: colors.bg,
  },
  outer: {
    flex: 1,
    minHeight: '100%',
    backgroundColor: '#040608',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: WEB_APP_MAX_WIDTH,
    maxHeight: '94vh',
    backgroundColor: colors.bg,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(42, 53, 64, 0.9)',
    overflow: 'hidden',
    position: 'relative',
    // @ts-expect-error RN web boxShadow
    boxShadow: '0 28px 90px rgba(0, 0, 0, 0.62)',
  },
});
