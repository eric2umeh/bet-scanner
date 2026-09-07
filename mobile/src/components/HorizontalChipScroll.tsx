import { useRef, type ReactNode } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

const DRAG_THRESHOLD = 6;

/**
 * Market chips that scroll horizontally on phone and laptop web.
 * On web, pointer-drag and shift/horizontal wheel pan the row.
 */
export function HorizontalChipScroll({ children, style, contentContainerStyle }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const drag = useRef({
    active: false,
    moved: false,
    startX: 0,
    startOffset: 0,
    offset: 0,
  });

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    drag.current.offset = e.nativeEvent.contentOffset.x;
  }

  function scrollToX(x: number) {
    const next = Math.max(0, x);
    scrollRef.current?.scrollTo({ x: next, animated: false });
    drag.current.offset = next;
  }

  if (Platform.OS === 'web') {
    const webHandlers = {
      onPointerDown: (e: any) => {
        drag.current.active = true;
        drag.current.moved = false;
        drag.current.startX = e.clientX ?? e.nativeEvent?.clientX ?? 0;
        drag.current.startOffset = drag.current.offset;
        try {
          e.currentTarget?.setPointerCapture?.(e.pointerId ?? e.nativeEvent?.pointerId);
        } catch {
          /* ignore */
        }
      },
      onPointerMove: (e: any) => {
        if (!drag.current.active) return;
        const clientX = e.clientX ?? e.nativeEvent?.clientX ?? 0;
        const dx = clientX - drag.current.startX;
        if (!drag.current.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
        drag.current.moved = true;
        scrollToX(drag.current.startOffset - dx);
      },
      onPointerUp: () => {
        drag.current.active = false;
      },
      onPointerCancel: () => {
        drag.current.active = false;
      },
      onWheel: (e: any) => {
        const deltaX = e.deltaX ?? e.nativeEvent?.deltaX ?? 0;
        const deltaY = e.deltaY ?? e.nativeEvent?.deltaY ?? 0;
        const shiftKey = e.shiftKey ?? e.nativeEvent?.shiftKey;
        const horizontal = Math.abs(deltaX) > Math.abs(deltaY) || shiftKey;
        if (!horizontal) return;
        e.preventDefault?.();
        const delta = shiftKey ? deltaY : deltaX || deltaY;
        scrollToX(drag.current.offset + delta);
      },
    };

    return (
      <View style={[styles.scroll, styles.scrollWeb, style]} {...webHandlers}>
        <ScrollView
          ref={scrollRef}
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={styles.innerScroll}
          contentContainerStyle={[styles.content, contentContainerStyle]}
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={[styles.scroll, style]}
      contentContainerStyle={[styles.content, contentContainerStyle]}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    marginTop: 4,
    marginBottom: 2,
    maxHeight: 48,
    width: '100%',
    flexGrow: 0,
    flexShrink: 0,
  },
  scrollWeb: {
    maxWidth: '100%',
    // @ts-expect-error web cursor
    cursor: 'grab',
    userSelect: 'none',
  },
  innerScroll: {
    width: '100%',
    maxHeight: 48,
  },
  content: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    paddingRight: 12,
    flexGrow: 0,
  },
});
