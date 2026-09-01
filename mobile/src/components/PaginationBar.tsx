import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../theme/colors';

export const DEFAULT_PAGE_SIZES = [10, 20, 50] as const;

export type PageToken = number | 'ellipsis';

export function buildPageItems(current: number, totalPages: number): PageToken[] {
  if (totalPages <= 0) return [];
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', totalPages];
  }
  if (current >= totalPages - 3) {
    return [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', totalPages];
}

type Props = {
  page: number;
  totalPages: number;
  pageSize: number;
  pageSizeOptions?: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  disabled?: boolean;
};

export function PaginationBar({
  page,
  totalPages,
  pageSize,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  onPageChange,
  onPageSizeChange,
  disabled = false,
}: Props) {
  const [sizeOpen, setSizeOpen] = useState(false);
  const items = useMemo(() => buildPageItems(page, totalPages), [page, totalPages]);
  const canPrev = page > 1 && !disabled;
  const canNext = page < totalPages && !disabled;

  if (totalPages <= 0) return null;

  return (
    <View style={styles.outer}>
      <View style={styles.shell}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          style={styles.scroll}
        >
          <Pressable
            style={[styles.iconBtn, !canPrev && styles.iconBtnDisabled]}
            disabled={!canPrev}
            onPress={() => onPageChange(page - 1)}
          >
            <Ionicons name="chevron-back" size={16} color={canPrev ? colors.ink : colors.muted} />
          </Pressable>

          {items.map((token, idx) =>
            token === 'ellipsis' ? (
              <Text key={`e-${idx}`} style={styles.ellipsis}>
                …
              </Text>
            ) : (
              <Pressable
                key={token}
                style={[styles.pageBtn, token === page && styles.pageBtnActive]}
                disabled={disabled || token === page}
                onPress={() => onPageChange(token)}
              >
                <Text style={[styles.pageText, token === page && styles.pageTextActive]}>
                  {token}
                </Text>
              </Pressable>
            )
          )}

          <Pressable
            style={[styles.iconBtn, !canNext && styles.iconBtnDisabled]}
            disabled={!canNext}
            onPress={() => onPageChange(page + 1)}
          >
            <Ionicons name="chevron-forward" size={16} color={canNext ? colors.ink : colors.muted} />
          </Pressable>
        </ScrollView>

        <Pressable
          style={styles.sizePill}
          disabled={disabled}
          onPress={() => setSizeOpen((o) => !o)}
        >
          <Text style={styles.sizePillText}>
            {pageSize} / page
          </Text>
          <Ionicons
            name={sizeOpen ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.muted}
          />
        </Pressable>
      </View>

      {sizeOpen ? (
        <View style={styles.sizeMenu}>
          {pageSizeOptions.map((size) => (
            <Pressable
              key={size}
              style={[styles.sizeOption, pageSize === size && styles.sizeOptionOn]}
              onPress={() => {
                setSizeOpen(false);
                if (size !== pageSize) onPageSizeChange(size);
              }}
            >
              <Text style={[styles.sizeOptionText, pageSize === size && styles.sizeOptionTextOn]}>
                {size} / page
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { marginTop: 16, zIndex: 2 },
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    gap: 4,
  },
  scroll: { flex: 1, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 2,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDisabled: { opacity: 0.35 },
  pageBtn: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 6,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBtnActive: {
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  pageText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  pageTextActive: { color: colors.accent },
  ellipsis: {
    color: colors.muted,
    fontSize: 13,
    paddingHorizontal: 4,
    lineHeight: 28,
  },
  sizePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.card,
  },
  sizePillText: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  sizeMenu: {
    position: 'absolute',
    right: 8,
    top: '100%',
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    overflow: 'hidden',
    minWidth: 110,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  sizeOption: { paddingVertical: 10, paddingHorizontal: 14 },
  sizeOptionOn: { backgroundColor: colors.accentDim },
  sizeOptionText: { color: colors.ink, fontSize: 13 },
  sizeOptionTextOn: { color: colors.accent, fontWeight: '700' },
});
