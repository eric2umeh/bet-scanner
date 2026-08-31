import { Platform } from 'react-native';

import { WEB_TAB_BAR_HEIGHT } from '../theme/layout';

/** Extra scroll padding so content clears the web tab bar. */
export function webScrollBottom(extra = 16): number {
  if (Platform.OS !== 'web') return extra;
  return WEB_TAB_BAR_HEIGHT + extra;
}
