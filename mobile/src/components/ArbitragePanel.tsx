import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  formatSurebetPlan,
  scanSurebets,
  type ArbLeg,
  type ArbOpportunity,
} from '../api/edge';
import { syncOdds } from '../api/odds';
import { bookLabel } from '../lib/tipKey';
import { isKickoffUpcoming } from '../lib/matchBettable';
import { shareOrCopyText } from '../lib/shareText';
import { loadSettings, type AppSettings } from '../store/settings';
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

export function ArbitragePanel({ onFlash }: Props) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [opps, setOpps] = useState<ArbOpportunity[]>([]);
  const [busy, setBusy] = useState(false);
  const [clockTick, setClockTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setClockTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const visibleOpps = opps.filter((o) => {
    void clockTick;
    return isKickoffUpcoming(o.kickoff_at);
  });

  function flash(msg: string, bad = false) {
    onFlash?.(msg, bad);
  }

  const scanOnly = useCallback(async () => {
    setBusy(true);
    try {
      const s = await loadSettings();
      setSettings(s);
      const data = await scanSurebets({ sample_stake_ngn: s.bankroll });
      const upcoming = (data.opportunities || []).filter((o) =>
        isKickoffUpcoming(o.kickoff_at)
      );
      setOpps(upcoming);
      flash(
        upcoming.length
          ? data.message || `Found ${upcoming.length} surebet(s).`
          : data.message || 'No surebets on saved odds — pull down or tap Find surebets.'
      );
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }, []);

  const findSurebets = useCallback(
    async (withOddsSync: boolean) => {
      setBusy(true);
      try {
        const s = await loadSettings();
        setSettings(s);
        if (withOddsSync) {
          flash('Syncing odds, then scanning…');
          await syncOdds();
        }
        const data = await scanSurebets({ sample_stake_ngn: s.bankroll });
        const upcoming = (data.opportunities || []).filter((o) =>
          isKickoffUpcoming(o.kickoff_at)
        );
        setOpps(upcoming);
        flash(
          upcoming.length
            ? data.message || `Found ${upcoming.length} surebet(s).`
            : data.message || 'No surebets right now — try again closer to kickoff.'
        );
      } catch (e) {
        flash(e instanceof Error ? e.message : String(e), true);
      } finally {
        setBusy(false);
      }
    },
    []
  );

  useEffect(() => {
    void scanOnly();
  }, [scanOnly]);

  async function onCopyPlan(opp: ArbOpportunity) {
    try {
      const how = await shareOrCopyText(formatSurebetPlan(opp));
      flash(how === 'copied' ? 'Stake plan copied.' : 'Stake plan shared.');
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    }
  }

  const bank = settings?.bankroll ?? 50000;
  const bestProfit = visibleOpps.length
    ? Math.max(...visibleOpps.map((o) => Number(o.profit_pct) || 0))
    : 0;

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
          onRefresh={() => findSurebets(true)}
          tintColor={colors.accent}
        />
      }
    >
      <Text style={styles.heroTitle}>Surebet scanner</Text>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statVal}>{visibleOpps.length}</Text>
          <Text style={styles.statLabel}>Found</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statVal, visibleOpps.length ? styles.statGood : null]}>
            {visibleOpps.length ? `${bestProfit.toFixed(2)}%` : '—'}
          </Text>
          <Text style={styles.statLabel}>Best profit</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statVal}>₦{bank.toLocaleString()}</Text>
          <Text style={styles.statLabel}>Sample stake</Text>
        </View>
      </View>

      <Pressable
        style={[styles.btnPrimary, busy && styles.disabled]}
        disabled={busy}
        onPress={() => void findSurebets(true)}
      >
        {busy ? (
          <ActivityIndicator color="#06241c" />
        ) : (
          <Text style={styles.btnPrimaryText}>Find surebets</Text>
        )}
      </Pressable>
      <Text style={styles.hint}>Pull down or tap Find surebets. Tap a card to copy stakes.</Text>

      {!visibleOpps.length && !busy ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No surebets right now</Text>
          <Text style={styles.emptyText}>Try again closer to kickoff after refreshing Today.</Text>
        </View>
      ) : null}

      {visibleOpps.map((o) => (
        <ArbCard key={`${o.match_id}-${o.profit_pct}`} opp={o} onCopy={() => void onCopyPlan(o)} />
      ))}
    </ScrollView>
  );
}

function ArbCard({ opp, onCopy }: { opp: ArbOpportunity; onCopy: () => void }) {
  const legs = opp.sample_legs?.length ? opp.sample_legs : opp.legs || [];
  const booksUsed =
    opp.books_used?.length
      ? opp.books_used
      : [...new Set(legs.map((l) => String(l.bookmaker).toLowerCase()))];

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>
            {opp.home_team} vs {opp.away_team}
          </Text>
          <Text style={styles.cardMeta}>
            {opp.competition_code}
            {opp.kickoff_at ? ` · ${new Date(opp.kickoff_at).toLocaleString()}` : ''}
          </Text>
          {booksUsed.length ? (
            <Text style={styles.booksUsedLine}>
              Place on: {booksUsed.map((b) => bookLabel(b)).join(' · ')}
            </Text>
          ) : null}
        </View>
        <View style={styles.profitBadge}>
          <Text style={styles.profitText}>{Number(opp.profit_pct).toFixed(2)}%</Text>
        </View>
      </View>
      {legs.map((leg: ArbLeg, i: number) => (
        <View key={`${leg.bookmaker}-${leg.selection}-${i}`} style={styles.legRow}>
          <View style={styles.legMain}>
            <Text style={styles.legSel}>{selLabel(leg.selection)}</Text>
            <Text style={styles.legBookPill}>{bookLabel(leg.bookmaker)}</Text>
          </View>
          <Text style={styles.legOdds}>@{leg.odds}</Text>
          {leg.stake_ngn != null ? (
            <Text style={styles.legStake}>₦{Number(leg.stake_ngn).toLocaleString()}</Text>
          ) : null}
        </View>
      ))}
      <Pressable style={styles.copyBtn} onPress={onCopy}>
        <Text style={styles.copyBtnText}>Copy stake plan</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  heroTitle: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: 15,
    marginBottom: 10,
  },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  statVal: { color: colors.ink, fontWeight: '800', fontSize: 15 },
  statGood: { color: colors.accent },
  statLabel: { color: colors.muted, fontSize: 11, marginTop: 2 },
  btnPrimary: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  btnPrimaryText: { color: '#06241c', fontWeight: '800', fontSize: 15 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginBottom: 12 },
  disabled: { opacity: 0.55 },
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
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  cardTitle: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  cardMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  booksUsedLine: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    lineHeight: 16,
  },
  profitBadge: {
    backgroundColor: colors.accentDim,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  profitText: { color: colors.accent, fontWeight: '800', fontSize: 13 },
  legRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  legMain: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 120 },
  legSel: { color: colors.ink, fontWeight: '700', fontSize: 13 },
  legBookPill: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: colors.accentDim,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  legOdds: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  legBook: { color: colors.muted, fontSize: 12 },
  legStake: { color: colors.ink, fontSize: 12, marginLeft: 'auto' },
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
