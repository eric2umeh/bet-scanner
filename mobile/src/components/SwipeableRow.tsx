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

type Props = {
  children: ReactNode;
  onDelete: () => void;
  style?: ViewStyle;
  /** Web has no swipe — show delete on the card instead. */
  showDeleteOnWeb?: boolean;
};

/** Slide left to reveal delete — works on native + web. */
export function SwipeableRow({ children, onDelete, style, showDeleteOnWeb = true }: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const open = useRef(false);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        const next = open.current ? Math.min(0, Math.max(-DELETE_WIDTH, g.dx - DELETE_WIDTH)) : Math.min(0, g.dx);
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
    <View style={[styles.wrap, style]}>
      {Platform.OS === 'web' && showDeleteOnWeb ? (
        <View style={styles.webRow}>
          <View style={styles.webContent}>{children}</View>
          <Pressable style={styles.webDeleteBtn} onPress={onDelete} accessibilityLabel="Delete">
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.deleteRail}>
            <Pressable
              style={styles.deleteBtn}
              onPress={() => {
                close();
                onDelete();
              }}
            >
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          </View>
          <Animated.View
            style={[styles.foreground, { transform: [{ translateX }] }]}
            {...pan.panHandlers}
          >
            {children}
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', overflow: 'hidden', borderRadius: 14 },
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
  foreground: { backgroundColor: colors.card },
  webRow: { flexDirection: 'row', alignItems: 'stretch' },
  webContent: { flex: 1, minWidth: 0 },
  webDeleteBtn: {
    width: DELETE_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bad,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
  },
});
