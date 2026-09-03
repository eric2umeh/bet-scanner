import { createElement, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function DatePickerField({
  value,
  onChange,
  placeholder = 'Pick a date',
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

  function pick(iso: string) {
    onChange(iso);
    setOpen(false);
  }

  function clear() {
    onChange('');
    setOpen(false);
  }

  // Web: native date input is the most effortless calendar UX
  if (Platform.OS === 'web') {
    return (
      <View style={[styles.webWrap, style]}>
        {createElement('input', {
          type: 'date',
          value: value || '',
          onChange: (e: { target: { value: string } }) => onChange(e.target.value || ''),
          style: webInputStyle,
          'aria-label': placeholder,
        })}
        {value ? (
          <Pressable onPress={() => onChange('')} hitSlop={8} accessibilityLabel="Clear date">
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <>
      <Pressable
        style={[styles.trigger, style]}
        onPress={() => {
          setCursor(selected || new Date());
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={value ? `Date ${formatLabel(value)}` : placeholder}
      >
        <Text style={[styles.triggerText, !value && styles.placeholder]} numberOfLines={1}>
          {value ? formatLabel(value) : placeholder}
        </Text>
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
              <Pressable onPress={clear}>
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
              <Pressable onPress={() => pick(toIso(new Date()))}>
                <Text style={styles.todayText}>Today</Text>
              </Pressable>
              <Pressable onPress={() => setOpen(false)}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const webInputStyle = {
  backgroundColor: colors.card,
  border: `1px solid ${colors.line}`,
  borderRadius: 10,
  color: colors.ink,
  padding: '8px 10px',
  fontSize: 13,
  minWidth: 140,
  fontFamily: 'inherit',
} as const;

const styles = StyleSheet.create({
  webWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trigger: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 140,
  },
  triggerText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  placeholder: { color: colors.muted, fontWeight: '500' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
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
  dayTextSelected: { color: '#06241c', fontWeight: '800' },
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
