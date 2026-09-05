import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { bookLabel } from '../lib/tipKey';
import { colors } from '../theme/colors';
import { LeanPctPanel } from './LeanPctPanel';

type Props = {
  books: string[];
  bookValue: string;
  onBookChange: (value: string) => void;
  leanValue: number;
  onLeanChange: (minPct: number) => void;
  /** Force one combined Filters button (default: auto by width). */
  forceCombined?: boolean;
};

const WIDE_MIN = 720;

function leanTriggerLabel(value: number) {
  return value > 0 ? `Lean ≥${value}%` : 'Lean all';
}

function bookTriggerLabel(books: string[], value: string) {
  if (value === 'all' || !value) return 'All books';
  return bookLabel(value);
}

function SheetClose({ onClose }: { onClose: () => void }) {
  return (
    <Pressable
      onPress={onClose}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Close"
      style={styles.closeBtn}
    >
      <Text style={styles.closeX}>×</Text>
    </Pressable>
  );
}

/**
 * Bookmaker + Lean filters on one row when wide; one Filters sheet when narrow.
 */
export function BookLeanFilters({
  books,
  bookValue,
  onBookChange,
  leanValue,
  onLeanChange,
  forceCombined,
}: Props) {
  const { width } = useWindowDimensions();
  const combined = forceCombined ?? width < WIDE_MIN;
  const [openBook, setOpenBook] = useState(false);
  const [openLean, setOpenLean] = useState(false);
  const [openAll, setOpenAll] = useState(false);

  const bookOptions = useMemo(
    () => [
      { key: 'all', label: 'All bookmakers' },
      ...books.map((b) => ({ key: b, label: bookLabel(b) })),
    ],
    [books]
  );

  const filtersActive = bookValue !== 'all' || leanValue > 0;
  const combinedLabel = useMemo(() => {
    const parts: string[] = [];
    if (bookValue !== 'all') parts.push(bookLabel(bookValue));
    if (leanValue > 0) parts.push(`≥${leanValue}%`);
    return parts.length ? parts.join(' · ') : 'Filters';
  }, [bookValue, leanValue]);

  if (combined) {
    return (
      <>
        <Pressable
          style={[styles.trigger, filtersActive && styles.triggerActive]}
          onPress={() => setOpenAll(true)}
          accessibilityRole="button"
          accessibilityLabel={`Filters: ${combinedLabel}`}
        >
          <Text style={[styles.triggerText, filtersActive && styles.triggerTextActive]} numberOfLines={1}>
            {combinedLabel}
          </Text>
          <Text style={styles.chevron}>▾</Text>
        </Pressable>

        <Modal visible={openAll} transparent animationType="fade" onRequestClose={() => setOpenAll(false)}>
          <Pressable style={styles.backdrop} onPress={() => setOpenAll(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetHead}>
                <Text style={styles.titleInline}>Filters</Text>
                <View style={styles.sheetHeadRight}>
                  {filtersActive ? (
                    <Pressable
                      onPress={() => {
                        onBookChange('all');
                        onLeanChange(0);
                      }}
                      hitSlop={8}
                    >
                      <Text style={styles.clearAll}>Reset</Text>
                    </Pressable>
                  ) : null}
                  <SheetClose onClose={() => setOpenAll(false)} />
                </View>
              </View>

              {books.length > 0 ? (
                <>
                  <Text style={styles.section}>Bookmaker</Text>
                  {bookOptions.map((o) => {
                    const on = o.key === bookValue;
                    return (
                      <Pressable
                        key={o.key}
                        style={[styles.option, on && styles.optionOn]}
                        onPress={() => {
                          onBookChange(o.key);
                          setOpenAll(false);
                        }}
                      >
                        <Text style={[styles.optionText, on && styles.optionTextOn]}>{o.label}</Text>
                      </Pressable>
                    );
                  })}
                  <View style={styles.divider} />
                </>
              ) : null}

              <Text style={styles.section}>Lean %</Text>
              <LeanPctPanel
                value={leanValue}
                onChange={onLeanChange}
                onCommit={(v) => {
                  onLeanChange(v);
                  setOpenAll(false);
                }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      </>
    );
  }

  return (
    <View style={styles.row}>
      {books.length > 0 ? (
        <>
          <Pressable
            style={styles.trigger}
            onPress={() => setOpenBook(true)}
            accessibilityRole="button"
            accessibilityLabel={`Bookmaker: ${bookTriggerLabel(books, bookValue)}`}
          >
            <Text style={styles.triggerText} numberOfLines={1}>
              {bookTriggerLabel(books, bookValue)}
            </Text>
            <Text style={styles.chevron}>▾</Text>
          </Pressable>
          <Modal visible={openBook} transparent animationType="fade" onRequestClose={() => setOpenBook(false)}>
            <Pressable style={styles.backdrop} onPress={() => setOpenBook(false)}>
              <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
                <View style={styles.sheetHead}>
                  <Text style={styles.titleInline}>Bookmaker</Text>
                  <SheetClose onClose={() => setOpenBook(false)} />
                </View>
                {bookOptions.map((o) => {
                  const on = o.key === bookValue;
                  return (
                    <Pressable
                      key={o.key}
                      style={[styles.option, on && styles.optionOn]}
                      onPress={() => {
                        onBookChange(o.key);
                        setOpenBook(false);
                      }}
                    >
                      <Text style={[styles.optionText, on && styles.optionTextOn]}>{o.label}</Text>
                    </Pressable>
                  );
                })}
              </Pressable>
            </Pressable>
          </Modal>
        </>
      ) : null}

      <Pressable
        style={[styles.trigger, leanValue > 0 && styles.triggerActive]}
        onPress={() => setOpenLean(true)}
        accessibilityRole="button"
        accessibilityLabel={leanTriggerLabel(leanValue)}
      >
        <Text
          style={[styles.triggerText, leanValue > 0 && styles.triggerTextActive]}
          numberOfLines={1}
        >
          {leanTriggerLabel(leanValue)}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal visible={openLean} transparent animationType="fade" onRequestClose={() => setOpenLean(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpenLean(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHead}>
              <Text style={styles.titleInline}>Lean %</Text>
              <SheetClose onClose={() => setOpenLean(false)} />
            </View>
            <LeanPctPanel
              value={leanValue}
              onChange={onLeanChange}
              onCommit={(v) => {
                onLeanChange(v);
                setOpenLean(false);
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    maxWidth: 128,
    flexShrink: 0,
  },
  triggerActive: {
    borderColor: 'rgba(45, 212, 168, 0.45)',
    backgroundColor: colors.accentDim,
  },
  triggerText: { color: colors.ink, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  triggerTextActive: { color: colors.accent },
  chevron: { color: colors.muted, fontSize: 11 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 28,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    maxHeight: '80%',
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  sheetHeadRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleInline: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  closeX: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 24,
    marginTop: -1,
  },
  section: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
    marginTop: 4,
  },
  clearAll: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: 14,
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  optionOn: { backgroundColor: colors.accentDim },
  optionText: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  optionTextOn: { color: colors.accent },
});
