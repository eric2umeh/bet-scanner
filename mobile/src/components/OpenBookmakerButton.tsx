import { useState } from 'react';
import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { useAppModal } from './modal';
import {
  bookmakerMatchUrl,
  openBookmakerMatch,
} from '../lib/openBookmaker';
import { bookLabel } from '../lib/tipKey';
import { LoadingRadar } from './LoadingRadar';
import { colors } from '../theme/colors';

type Props = {
  home: string;
  away: string;
  /** Book key (sportybet, melbet, …). Falls back to SportyBet if empty. */
  bookmaker?: string | null;
  /** Compact link style for Today cards. */
  compact?: boolean;
  style?: ViewStyle;
};

/**
 * Opens the selected bookmaker. SportyBet uses /m/search?keyword=…;
 * other books get a football page + clipboard paste backup.
 */
export function OpenBookmakerButton({
  home,
  away,
  bookmaker,
  compact,
  style,
}: Props) {
  const modal = useAppModal();
  const [busy, setBusy] = useState(false);
  const bookKey = (bookmaker || 'sportybet').trim() || 'sportybet';
  const label = bookLabel(bookKey);

  async function onPress() {
    if (busy) return;
    setBusy(true);
    try {
      const preview = bookmakerMatchUrl(bookKey, home, away);
      // Paste hint before leaving — only when the book has no real search URL.
      if (!preview.hasSearch) {
        await modal.alert({
          title: `Open ${preview.label}`,
          message: `We’ll copy “${preview.searchFor}” and open ${preview.label} football. Paste into Search there.`,
        });
      }

      const result = await openBookmakerMatch({ bookmaker: bookKey, home, away });
      if (!result.ok) {
        await modal.alert({
          title: `Could not open ${result.label}`,
          message: result.copied
            ? `“${result.searchFor}” is on your clipboard — open ${result.label} and paste it in Search.`
            : `Open the ${result.label} app and search for “${result.searchFor}”.`,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${home} vs ${away} in ${label}`}
      accessibilityHint={`Opens ${label} search for this match`}
      style={[compact ? styles.compact : styles.btn, busy && styles.busy, style]}
      onPress={(e) => {
        // @ts-expect-error RN web / nested Pressable
        e?.stopPropagation?.();
        void onPress();
      }}
      disabled={busy}
    >
      {busy ? (
        <LoadingRadar size="small" color={colors.accent} />
      ) : (
        <Text style={compact ? styles.compactText : styles.btnText} numberOfLines={1}>
          {compact ? `${label} ↗` : `Open in ${label} ↗`}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    marginTop: 12,
    backgroundColor: colors.accentDim,
    borderColor: 'rgba(15, 138, 95, 0.45)',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  btnText: { color: colors.accent, fontWeight: '800', fontSize: 14 },
  compact: {
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 2,
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  compactText: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 11,
  },
  busy: { opacity: 0.7 },
});
