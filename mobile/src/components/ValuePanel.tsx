import { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { scanValue, type ValuePick } from '../api/edge';
import { fetchPublicAppConfig } from '../api/appConfig';
import { syncOdds } from '../api/odds';
import { useIsAdmin } from '../hooks/useIsAdmin';
import { invalidateHomeFeedCache } from '../query/invalidate';
import { bookLabel } from '../lib/tipKey';
import { shareOrCopyText } from '../lib/shareText';
import { loadSettings } from '../store/settings';
import { setValuePickCount } from '../store/valuePickCount';
import { LoadingRadar } from './LoadingRadar';
import { colors } from '../theme/colors';
import { webScrollBottom } from '../theme/webScroll';

function selLabel(sel: string) {
  const s = (sel || '').toLowerCase();
  if (s === 'home') return 'Home';
  if (s === 'draw') return 'Draw';
  if (s === 'away') return 'Away';
  return sel;
}

type Props = {
  onFlash?: (msg: string, bad?: boolean) => void;
};

export function ValuePanel({ onFlash }: Props) {
  const isAdmin = useIsAdmin();
  const [picks, setPicks] = useState<ValuePick[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runScan = useCallback(async (withOddsSync: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const s = await loadSettings();
      if (withOddsSync && isAdmin) {
        await syncOdds();
        void invalidateHomeFeedCache();
      }
      const cfg = await fetchPublicAppConfig().catch(() => null);
      const books = cfg?.odds_bookmakers?.length
        ? cfg.odds_bookmakers.join(',')
        : undefined;
      const data = await scanValue({
        bankroll_ngn: s.bankroll,
        unit_pct: s.unitPct,
        bookmakers: books,
      });
      const list = data.picks || [];
      setPicks(list);
      setValuePickCount(list.length);
      if (!list.length) {
        onFlash?.('No better prices right now.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      onFlash?.(msg, true);
    } finally {
      setBusy(false);
    }
  }, [onFlash, isAdmin]);

  useEffect(() => {
    void runScan(false);
  }, [runScan]);

  async function onCopyValue(p: ValuePick) {
    const text = [
      `${p.home_team} vs ${p.away_team}`,
      `${selLabel(p.selection)} @${p.odds} on ${bookLabel(p.bookmaker)}`,
      `Better by ${p.ev_pct}% · usual price ~${p.fair_odds} · try stake ₦${p.suggested_stake_ngn}`,
      p.warning || '',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await shareOrCopyText(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        Platform.OS === 'web' ? { paddingBottom: webScrollBottom(20) } : null,
      ]}
      refreshControl={
        <RefreshControl
          refreshing={busy}
          onRefresh={() => runScan(true)}
          tintColor={colors.accent}
        />
      }
    >
      <Text style={styles.lead}>
        Finds when SportyBet or Bet9ja is paying more than usual for the same bet. Check the
        price in the book app before you stake — you can still lose.
      </Text>

      <Pressable
        style={[styles.btnPrimary, busy && styles.disabled]}
        disabled={busy}
        onPress={() => void runScan(true)}
      >
        {busy ? (
          <LoadingRadar size="small" color={colors.onAccent} />
        ) : (
          <Text style={styles.btnPrimaryText}>Find better prices</Text>
        )}
      </Pressable>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {!picks.length && !busy ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No better prices right now</Text>
          <Text style={styles.emptyText}>
            Load matches on Home first, then tap Find better prices here.
          </Text>
        </View>
      ) : null}

      {busy && !picks.length ? (
        <View style={styles.loadingRow}>
          <LoadingRadar size="large" />
        </View>
      ) : null}

      {picks.map((p) => (
        <View key={`${p.match_id}-${p.selection}-${p.bookmaker}`} style={styles.card}>
          <Text style={styles.cardTitle}>
            {p.home_team} vs {p.away_team}
          </Text>
          <Text style={styles.meta}>
            {p.competition_code}
            {p.kickoff_at ? ` · ${new Date(p.kickoff_at).toLocaleString()}` : ''}
          </Text>
          <View style={styles.evRow}>
            <Text style={styles.evBadge}>Better by {String(p.ev_pct)}%</Text>
            <Text style={styles.pickLine}>
              {selLabel(p.selection)} @{String(p.odds)} · {bookLabel(p.bookmaker)}
            </Text>
          </View>
          <Text style={styles.stake}>
            Usual price ~{String(p.fair_odds)} · try stake ₦{String(p.suggested_stake_ngn)}
          </Text>
          {p.warning ? <Text style={styles.warn}>{p.warning}</Text> : null}
          <Pressable style={styles.copyBtn} onPress={() => void onCopyValue(p)}>
            <Text style={styles.copyBtnText}>Copy / share pick</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  lead: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  btnPrimary: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    minHeight: 48,
  },
  btnPrimaryText: { color: colors.onAccent, fontWeight: '800', fontSize: 15 },
  disabled: { opacity: 0.55 },
  errorText: { color: colors.bad, fontSize: 13, marginBottom: 10 },
  loadingRow: { alignItems: 'center', paddingVertical: 24 },
  empty: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  emptyTitle: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  evRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  evBadge: {
    backgroundColor: colors.accentDim,
    color: colors.accent,
    fontWeight: '800',
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  pickLine: { color: colors.ink, fontSize: 13, flex: 1 },
  stake: { color: colors.muted, fontSize: 12, marginTop: 6 },
  warn: { color: colors.warn, fontSize: 12, marginTop: 6, lineHeight: 17 },
  copyBtn: {
    marginTop: 10,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  copyBtnText: { color: colors.ink, fontWeight: '600', fontSize: 13 },
});
