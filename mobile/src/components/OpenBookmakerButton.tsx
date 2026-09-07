import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { useAppModal } from './modal';
import {
  bookmakerMatchUrl,
  openBookmakerMatch,
} from '../lib/openBookmaker';
import { bookLabel } from '../lib/tipKey';
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
 * Opens the selected bookmaker (app or site) on football, with team name copied
 * for paste into the book’s search (deep-link search is unreliable).
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
      // Explain paste first — opening the book often leaves Bet Scout immediately.
      const preview = bookmakerMatchUrl(bookKey, home, away);
      await modal.alert({
        title: `Open ${preview.label}`,
        message: `We’ll copy “${preview.searchFor}” and open ${preview.label} football. Paste into Search there to find the match.`,
      });

      const result = await openBookmakerMatch({ bookmaker: bookKey, home, away });
      if (!result.ok) {
        await modal.alert({
          title: `Could not open ${result.label}`,
          message: result.copied
            ? `“${result.searchFor}” is still on your clipboard — open ${result.label} yourself and paste it in Search.`
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
      accessibilityHint={`Copies a team name and opens ${label} football`}
      style={[compact ? styles.compact : styles.btn, busy && styles.busy, style]}
      onPress={(e) => {
        // @ts-expect-error RN web / nested Pressable
        e?.stopPropagation?.();
        void onPress();
      }}
      disabled={busy}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.accent} />
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
    borderColor: 'rgba(45, 212, 168, 0.45)',
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
