import { useRef, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import { colors } from '../theme/colors';

const DELETE_WIDTH = 88;
/** Always-visible red strip so users know the row can be swiped to delete. */
const PEEK = 6;

type Props = {
  children: ReactNode;
  onDelete: () => void;
  style?: ViewStyle;
};

/** Slide left to reveal delete on native. On web, no swipe — use in-card delete buttons. */
export function SwipeableRow({ children, onDelete, style }: Props) {
  if (Platform.OS === 'web') {
    return <View style={[styles.wrap, style]}>{children}</View>;
  }
  const translateX = useRef(new Animated.Value(0)).current;
  const open = useRef(false);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        const next = open.current
          ? Math.min(0, Math.max(-DELETE_WIDTH, g.dx - DELETE_WIDTH))
          : Math.min(0, g.dx);
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        const shouldOpen = g.dx < -36 || (open.current && g.dx < 12);
        open.current = shouldOpen;
        Animated.spring(translateX, {
          toValue: shouldOpen ? -DELETE_WIDTH : 0,
          useNativeDriver: true,
          bounciness: 0,
        }).start();
      },
    })
  ).current;

  function close() {
    open.current = false;
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
  }

  return (
    <View style={[styles.wrap, style]} accessibilityHint="Swipe left to delete">
      <View style={styles.deleteRail}>
        <Pressable
          style={styles.deleteBtn}
          onPress={() => {
            close();
            onDelete();
          }}
          accessibilityRole="button"
          accessibilityLabel="Delete"
        >
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Animated.View
          style={[styles.foreground, { transform: [{ translateX }] }]}
          {...pan.panHandlers}
        >
          {children}
        </Animated.View>
        {/* Transparent spacer — delete rail shows through as a permanent edge cue. */}
        <View style={styles.peek} pointerEvents="none" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 14,
  },
  deleteRail: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-end',
    justifyContent: 'center',
    backgroundColor: colors.bad,
    borderRadius: 14,
  },
  deleteBtn: {
    width: DELETE_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  deleteText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  foreground: {
    flex: 1,
    backgroundColor: colors.card,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    // Keep the card flush against the peek so the red edge reads as the card rim.
    marginRight: 0,
  },
  peek: {
    width: PEEK,
    backgroundColor: 'transparent',
  },
});
