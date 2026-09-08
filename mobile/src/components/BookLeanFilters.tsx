import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { bookLabel } from '../lib/tipKey';
import { WEB_APP_MAX_WIDTH } from '../theme/layout';
import { colors } from '../theme/colors';
import { LeanPctPanel } from './LeanPctPanel';

export type LoggedFilterValue = 'all' | 'logged' | 'unlogged';

type Props = {
  books: string[];
  bookValue: string;
  onBookChange: (value: string) => void;
  leanValue: number;
  onLeanChange: (minPct: number) => void;
  /** When set, Logged status is included in the Filters control. */
  loggedValue?: LoggedFilterValue;
  onLoggedChange?: (value: LoggedFilterValue) => void;
  /** Hide Lean section (e.g. Arb uses profit filter separately). */
  hideLean?: boolean;
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

function loggedTriggerLabel(value: LoggedFilterValue) {
  if (value === 'logged') return 'Logged';
  if (value === 'unlogged') return 'Unlogged';
  return 'Logged: all';
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

function LoggedOptions({
  value,
  onChange,
  onDone,
}: {
  value: LoggedFilterValue;
  onChange: (v: LoggedFilterValue) => void;
  onDone?: () => void;
}) {
  const opts: { key: LoggedFilterValue; label: string }[] = [
    { key: 'all', label: 'All tips' },
    { key: 'logged', label: 'Logged only' },
    { key: 'unlogged', label: 'Unlogged only' },
  ];
  return (
    <>
      {opts.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            style={[styles.option, on && styles.optionOn]}
            onPress={() => {
              onChange(o.key);
              onDone?.();
            }}
          >
            <Text style={[styles.optionText, on && styles.optionTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </>
  );
}

/**
 * Bookmaker + Lean (+ optional Logged) filters.
 * Narrow: one Filters sheet. Wide: separate triggers.
 */
export function BookLeanFilters({
  books,
  bookValue,
  onBookChange,
  leanValue,
  onLeanChange,
  loggedValue,
  onLoggedChange,
  hideLean,
  forceCombined,
}: Props) {
  const { width, height } = useWindowDimensions();
  const combined = forceCombined ?? width < WIDE_MIN;
  const showLogged = loggedValue != null && onLoggedChange != null;
  const showLean = !hideLean;
  const [openBook, setOpenBook] = useState(false);
  const [openLean, setOpenLean] = useState(false);
  const [openLogged, setOpenLogged] = useState(false);
  const [openAll, setOpenAll] = useState(false);
  const sheetMaxW = Math.min(WEB_APP_MAX_WIDTH, Math.max(280, width - 32));
  const scrollMaxH = Math.min(420, Math.max(200, height * 0.55));

  const bookOptions = useMemo(
    () => [
      { key: 'all', label: 'All bookmakers' },
      ...books.map((b) => ({ key: b, label: bookLabel(b) })),
    ],
    [books]
  );

  const filtersActive =
    bookValue !== 'all' ||
    (showLean && leanValue > 0) ||
    (showLogged && loggedValue !== 'all');

  const combinedLabel = useMemo(() => {
    const parts: string[] = [];
    if (bookValue !== 'all') parts.push(bookLabel(bookValue));
    if (showLean && leanValue > 0) parts.push(`≥${leanValue}%`);
    if (showLogged && loggedValue === 'logged') parts.push('Logged');
    if (showLogged && loggedValue === 'unlogged') parts.push('Unlogged');
    return parts.length ? parts.join(' · ') : showLean || showLogged ? 'Filters' : 'All books';
  }, [bookValue, leanValue, loggedValue, showLean, showLogged]);

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
            <View
              style={[styles.sheet, { maxWidth: sheetMaxW }]}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.sheetHead}>
                <Text style={styles.titleInline}>Filters</Text>
                <View style={styles.sheetHeadRight}>
                  {filtersActive ? (
                    <Pressable
                      onPress={() => {
                        onBookChange('all');
                        if (showLean) onLeanChange(0);
                        if (showLogged) onLoggedChange('all');
                      }}
                      hitSlop={8}
                    >
                      <Text style={styles.clearAll}>Reset</Text>
                    </Pressable>
                  ) : null}
                  <SheetClose onClose={() => setOpenAll(false)} />
                </View>
              </View>

              <ScrollView
                style={[styles.sheetScroll, { maxHeight: scrollMaxH }]}
                contentContainerStyle={styles.sheetScrollContent}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsVerticalScrollIndicator
                bounces={false}
              >
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
                    {(showLean || showLogged) ? <View style={styles.divider} /> : null}
                  </>
                ) : (
                  <Text style={styles.emptyBooks}>No bookmakers in current results.</Text>
                )}

                {showLean ? (
                  <>
                    <Text style={styles.section}>Lean %</Text>
                    <LeanPctPanel
                      value={leanValue}
                      onChange={onLeanChange}
                      onCommit={(v) => {
                        onLeanChange(v);
                        setOpenAll(false);
                      }}
                    />
                  </>
                ) : null}

                {showLogged ? (
                  <>
                    {showLean ? <View style={styles.divider} /> : null}
                    <Text style={styles.section}>Logged</Text>
                    <LoggedOptions
                      value={loggedValue}
                      onChange={onLoggedChange}
                      onDone={() => setOpenAll(false)}
                    />
                  </>
                ) : null}
              </ScrollView>
            </View>
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
            style={[styles.trigger, bookValue !== 'all' && styles.triggerActive]}
            onPress={() => setOpenBook(true)}
            accessibilityRole="button"
            accessibilityLabel={`Bookmaker: ${bookTriggerLabel(books, bookValue)}`}
          >
            <Text
              style={[styles.triggerText, bookValue !== 'all' && styles.triggerTextActive]}
              numberOfLines={1}
            >
              {bookTriggerLabel(books, bookValue)}
            </Text>
            <Text style={styles.chevron}>▾</Text>
          </Pressable>
          <Modal visible={openBook} transparent animationType="fade" onRequestClose={() => setOpenBook(false)}>
            <Pressable style={styles.backdrop} onPress={() => setOpenBook(false)}>
              <View style={[styles.sheet, { maxWidth: sheetMaxW }]} onStartShouldSetResponder={() => true}>
                <View style={styles.sheetHead}>
                  <Text style={styles.titleInline}>Bookmaker</Text>
                  <SheetClose onClose={() => setOpenBook(false)} />
                </View>
                <ScrollView
                  style={[styles.sheetScroll, { maxHeight: scrollMaxH }]}
                  contentContainerStyle={styles.sheetScrollContent}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  bounces={false}
                >
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
                </ScrollView>
              </View>
            </Pressable>
          </Modal>
        </>
      ) : null}

      {showLean ? (
        <>
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
              <View style={[styles.sheet, { maxWidth: sheetMaxW }]} onStartShouldSetResponder={() => true}>
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
              </View>
            </Pressable>
          </Modal>
        </>
      ) : null}

      {showLogged ? (
        <>
          <Pressable
            style={[styles.trigger, loggedValue !== 'all' && styles.triggerActive]}
            onPress={() => setOpenLogged(true)}
            accessibilityRole="button"
            accessibilityLabel={loggedTriggerLabel(loggedValue)}
          >
            <Text
              style={[styles.triggerText, loggedValue !== 'all' && styles.triggerTextActive]}
              numberOfLines={1}
            >
              {loggedTriggerLabel(loggedValue)}
            </Text>
            <Text style={styles.chevron}>▾</Text>
          </Pressable>
          <Modal
            visible={openLogged}
            transparent
            animationType="fade"
            onRequestClose={() => setOpenLogged(false)}
          >
            <Pressable style={styles.backdrop} onPress={() => setOpenLogged(false)}>
              <View style={[styles.sheet, { maxWidth: sheetMaxW }]} onStartShouldSetResponder={() => true}>
                <View style={styles.sheetHead}>
                  <Text style={styles.titleInline}>Logged</Text>
                  <SheetClose onClose={() => setOpenLogged(false)} />
                </View>
                <LoggedOptions
                  value={loggedValue}
                  onChange={onLoggedChange}
                  onDone={() => setOpenLogged(false)}
                />
              </View>
            </Pressable>
          </Modal>
        </>
      ) : null}
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
    maxWidth: 140,
    flexShrink: 0,
  },
  triggerActive: {
    borderColor: 'rgba(15, 138, 95, 0.45)',
    backgroundColor: colors.accentDim,
  },
  triggerText: { color: colors.ink, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  triggerTextActive: { color: colors.accent },
  chevron: { color: colors.muted, fontSize: 11 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 8,
    width: '100%',
    maxWidth: WEB_APP_MAX_WIDTH,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  sheetScroll: {
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: 420,
  },
  sheetScrollContent: {
    paddingBottom: 12,
  },
  emptyBooks: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
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
