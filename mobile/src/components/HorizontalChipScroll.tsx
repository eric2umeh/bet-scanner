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

const DRAG_THRESHOLD = 8;

/**
 * Market chips that scroll horizontally on phone and laptop web.
 * On web: drag-to-pan without stealing pill taps; scrollbar hidden.
 */
export function HorizontalChipScroll({ children, style, contentContainerStyle }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const drag = useRef({
    pointerId: null as number | null,
    dragging: false,
    startX: 0,
    startOffset: 0,
    offset: 0,
    /** Suppress the click that follows a drag. */
    suppressClick: false,
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
        // Do not capture yet — let Pressable receive a real click when the user taps.
        drag.current.pointerId = e.pointerId ?? e.nativeEvent?.pointerId ?? null;
        drag.current.dragging = false;
        drag.current.suppressClick = false;
        drag.current.startX = e.clientX ?? e.nativeEvent?.clientX ?? 0;
        drag.current.startOffset = drag.current.offset;
      },
      onPointerMove: (e: any) => {
        if (drag.current.pointerId == null) return;
        const clientX = e.clientX ?? e.nativeEvent?.clientX ?? 0;
        const dx = clientX - drag.current.startX;
        if (!drag.current.dragging) {
          if (Math.abs(dx) < DRAG_THRESHOLD) return;
          drag.current.dragging = true;
          drag.current.suppressClick = true;
          try {
            e.currentTarget?.setPointerCapture?.(drag.current.pointerId);
          } catch {
            /* ignore */
          }
        }
        e.preventDefault?.();
        scrollToX(drag.current.startOffset - dx);
      },
      onPointerUp: (e: any) => {
        if (drag.current.dragging) {
          e.preventDefault?.();
          try {
            e.currentTarget?.releasePointerCapture?.(drag.current.pointerId);
          } catch {
            /* ignore */
          }
        }
        drag.current.pointerId = null;
        drag.current.dragging = false;
      },
      onPointerCancel: () => {
        drag.current.pointerId = null;
        drag.current.dragging = false;
      },
      onClickCapture: (e: any) => {
        if (drag.current.suppressClick) {
          e.preventDefault?.();
          e.stopPropagation?.();
          drag.current.suppressClick = false;
        }
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
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={[styles.innerScroll, styles.hideScrollbar]}
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
  hideScrollbar: {
    // @ts-expect-error web CSS
    scrollbarWidth: 'none',
    // @ts-expect-error web CSS
    msOverflowStyle: 'none',
  },
  content: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    paddingRight: 12,
    flexGrow: 0,
  },
});
