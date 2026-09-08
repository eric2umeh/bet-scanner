import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { WEB_APP_MAX_WIDTH } from '../theme/layout';
import { colors } from '../theme/colors';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_WIDTH = `${100 / 7}%` as `${number}%`;

type Props = {
  value: string; // YYYY-MM-DD or ''
  onChange: (iso: string) => void;
  placeholder?: string;
  style?: object;
};

function toIso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIso(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatLabel(iso: string) {
  const d = parseIso(iso);
  if (!d) return iso;
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Dark in-app calendar. Entire field opens the modal (web + native).
 */
export function DatePickerField({
  value,
  onChange,
  placeholder = 'Date',
  style,
}: Props) {
  const selected = parseIso(value);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => selected || new Date());

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: Array<{ key: string; day: number | null; iso?: string }> = [];
    for (let i = 0; i < startPad; i++) {
      out.push({ key: `pad-${i}`, day: null });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = toIso(new Date(year, month, day));
      out.push({ key: iso, day, iso });
    }
    return out;
  }, [cursor]);

  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  function openCalendar() {
    setCursor(selected || new Date());
    setOpen(true);
  }

  function pick(iso: string) {
    onChange(iso);
    setOpen(false);
  }

  function clear() {
    onChange('');
    setOpen(false);
  }

  return (
    <>
      <Pressable
        style={[styles.trigger, value ? styles.triggerOn : null, style]}
        onPress={openCalendar}
        accessibilityRole="button"
        accessibilityLabel={value ? `Date ${formatLabel(value)}` : placeholder}
      >
        <FontAwesome name="calendar" size={12} color={value ? colors.accent : colors.muted} />
        <Text style={[styles.triggerText, !value && styles.placeholder]} numberOfLines={1}>
          {value ? formatLabel(value) : placeholder}
        </Text>
        {value ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              clear();
            }}
            hitSlop={8}
            accessibilityLabel="Clear date"
          >
            <Text style={styles.clearX}>×</Text>
          </Pressable>
        ) : (
          <Text style={styles.chevron}>▾</Text>
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.monthRow}>
              <Pressable
                style={styles.navBtn}
                onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              >
                <Text style={styles.navText}>‹</Text>
              </Pressable>
              <Text style={styles.monthLabel}>{monthLabel}</Text>
              <Pressable
                style={styles.navBtn}
                onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              >
                <Text style={styles.navText}>›</Text>
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS.map((w) => (
                <Text key={w} style={styles.weekday}>
                  {w}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((c) => {
                const selectedDay = c.iso && c.iso === value;
                const today = c.iso && c.iso === toIso(new Date());
                return (
                  <Pressable
                    key={c.key}
                    style={[
                      styles.dayCell,
                      selectedDay && styles.daySelected,
                      today && !selectedDay && styles.dayToday,
                      !c.day && styles.dayEmpty,
                    ]}
                    disabled={!c.iso}
                    onPress={() => c.iso && pick(c.iso)}
                  >
                    {c.day ? (
                      <Text
                        style={[
                          styles.dayText,
                          selectedDay && styles.dayTextSelected,
                          today && !selectedDay && styles.dayTextToday,
                        ]}
                      >
                        {c.day}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.footer}>
              <Pressable onPress={clear} hitSlop={8}>
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
              <Pressable onPress={() => pick(toIso(new Date()))} hitSlop={8}>
                <Text style={styles.todayText}>Today</Text>
              </Pressable>
              <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    minWidth: 88,
    maxWidth: 120,
    flexShrink: 0,
  },
  triggerOn: {
    borderColor: 'rgba(15, 138, 95, 0.45)',
    backgroundColor: colors.accentDim,
  },
  triggerText: { color: colors.ink, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  placeholder: { color: colors.muted, fontWeight: '500' },
  chevron: { color: colors.muted, fontSize: 11 },
  clearX: { color: colors.muted, fontSize: 16, fontWeight: '600', paddingHorizontal: 2 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    width: '100%',
    maxWidth: Math.min(WEB_APP_MAX_WIDTH, 360),
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  monthLabel: { color: colors.ink, fontWeight: '800', fontSize: 16 },
  navBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  navText: { color: colors.accent, fontSize: 28, fontWeight: '300', lineHeight: 30 },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: {
    width: DAY_WIDTH,
    textAlign: 'center',
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: DAY_WIDTH,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  dayEmpty: { opacity: 0 },
  daySelected: { backgroundColor: colors.accent },
  dayToday: { borderWidth: 1, borderColor: colors.accent },
  dayText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  dayTextSelected: { color: colors.onAccent, fontWeight: '800' },
  dayTextToday: { color: colors.accent },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  clearText: { color: colors.muted, fontWeight: '600', fontSize: 14 },
  todayText: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  doneText: { color: colors.ink, fontWeight: '700', fontSize: 14 },
});
