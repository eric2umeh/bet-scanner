import { Platform, StyleSheet, View } from 'react-native';

import { WEB_APP_MAX_WIDTH } from '../theme/layout';
import { colors } from '../theme/colors';

type Props = {
  children: React.ReactNode;
};

/**
 * Desktop web: centered phone/tablet shell (legacy dashboard feel).
 */
export function WebMobileFrame({ children }: Props) {
  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  return (
    <View style={styles.outer}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    // @ts-expect-error RN web boxShadow
    boxShadow: '0 28px 90px rgba(0, 0, 0, 0.62)',
  },
});
