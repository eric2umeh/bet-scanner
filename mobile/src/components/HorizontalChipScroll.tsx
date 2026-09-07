import { Platform, ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

/**
 * Market chips row that scrolls horizontally on phone and laptop web.
 * RN Web often expands the row instead of scrolling unless overflow is set.
 */
export function HorizontalChipScroll({ children, style, contentContainerStyle }: Props) {
  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={Platform.OS === 'web'}
      keyboardShouldPersistTaps="handled"
      style={[styles.scroll, Platform.OS === 'web' && styles.scrollWeb, style]}
      contentContainerStyle={[styles.content, contentContainerStyle]}
      // @ts-expect-error RN web CSS overflow
      {...(Platform.OS === 'web'
        ? { overflowX: 'auto', overflowY: 'hidden' }
        : null)}
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
    // Keep the row inside the viewport so chips slide instead of wrapping.
    maxWidth: '100%',
  },
  content: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    paddingRight: 12,
    flexGrow: 0,
  },
});
