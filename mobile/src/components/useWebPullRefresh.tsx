import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { colors } from '../theme/colors';

const PULL_THRESHOLD = 72;

type Args = {
  enabled?: boolean;
  refreshing: boolean;
  onRefresh: () => void;
};

/**
 * Mobile browsers rarely fire RN RefreshControl. Track pull-down at scroll top
 * and show a small in-app refresh cue instead of relying on Chrome overscroll.
 */
export function useWebPullRefresh({ enabled = true, refreshing, onRefresh }: Args) {
  const atTopRef = useRef(true);
  const startYRef = useRef<number | null>(null);
  const [pullPx, setPullPx] = useState(0);
  const armedRef = useRef(false);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    atTopRef.current = e.nativeEvent.contentOffset.y <= 4;
    if (!atTopRef.current && pullPx) setPullPx(0);
  }, [pullPx]);

  const onTouchStart = useCallback(
    (e: { nativeEvent: { pageY: number } }) => {
      if (!enabled || Platform.OS !== 'web' || refreshing) return;
      if (!atTopRef.current) {
        startYRef.current = null;
        return;
      }
      startYRef.current = e.nativeEvent.pageY;
      armedRef.current = false;
    },
    [enabled, refreshing]
  );

  const onTouchMove = useCallback(
    (e: { nativeEvent: { pageY: number } }) => {
      if (!enabled || Platform.OS !== 'web' || refreshing) return;
      if (startYRef.current == null || !atTopRef.current) return;
      const dy = e.nativeEvent.pageY - startYRef.current;
      if (dy <= 0) {
        setPullPx(0);
        return;
      }
      const clamped = Math.min(dy * 0.45, PULL_THRESHOLD + 24);
      setPullPx(clamped);
      armedRef.current = clamped >= PULL_THRESHOLD;
    },
    [enabled, refreshing]
  );

  const onTouchEnd = useCallback(() => {
    if (!enabled || Platform.OS !== 'web') return;
    const shouldRefresh = armedRef.current && !refreshing;
    startYRef.current = null;
    armedRef.current = false;
    setPullPx(0);
    if (shouldRefresh) onRefresh();
  }, [enabled, refreshing, onRefresh]);

  return {
    pullPx,
    scrollProps:
      enabled && Platform.OS === 'web'
        ? {
            onScroll,
            scrollEventThrottle: 16,
            onTouchStart,
            onTouchMove,
            onTouchEnd,
            onTouchCancel: onTouchEnd,
          }
        : {},
  };
}

export function WebPullHint({ pullPx, refreshing }: { pullPx: number; refreshing: boolean }) {
  if (Platform.OS !== 'web') return null;
  if (!refreshing && pullPx < 8) return null;

  const ready = pullPx >= PULL_THRESHOLD;
  return (
    <View style={[styles.hint, { height: refreshing ? 36 : Math.max(24, pullPx * 0.5) }]}>
      {refreshing ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <Text style={[styles.hintText, ready && styles.hintReady]}>
          {ready ? 'Release to refresh' : 'Pull to refresh'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  hintText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  hintReady: { color: colors.accent },
});
