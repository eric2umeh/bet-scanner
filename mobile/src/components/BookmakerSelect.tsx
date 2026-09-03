import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { bookLabel } from '../lib/tipKey';
import { colors } from '../theme/colors';

type Props = {
  books: string[];
  value: string; // 'all' or book key
  onChange: (value: string) => void;
  style?: object;
};

export function BookmakerSelect({ books, value, onChange, style }: Props) {
  const [open, setOpen] = useState(false);
  const options = [
    { key: 'all', label: 'All bookmaker' },
    ...books.map((b) => ({ key: b, label: bookLabel(b) })),
  ];
  const current = options.find((o) => o.key === value) || options[0];

  return (
    <>
      <Pressable
        style={[styles.trigger, style]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Bookmaker filter: ${current.label}`}
      >
        <Text style={styles.triggerText} numberOfLines={1}>
          {current.label}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.title}>Bookmaker</Text>
            {options.map((o) => {
              const on = o.key === value;
              return (
                <Pressable
                  key={o.key}
                  style={[styles.option, on && styles.optionOn]}
                  onPress={() => {
                    onChange(o.key);
                    setOpen(false);
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
  );
}

const styles = StyleSheet.create({
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
    maxWidth: 118,
    flexShrink: 0,
  },
  triggerText: { color: colors.ink, fontSize: 12, fontWeight: '600', flexShrink: 1 },
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
    padding: 12,
    maxHeight: '70%',
  },
  title: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    paddingHorizontal: 6,
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
