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
  const [booksScanned, setBooksScanned] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusBad, setStatusBad] = useState(false);

  function flash(msg: string, bad = false) {
    setStatus(msg);
    setStatusBad(bad);
    onFlash?.(msg, bad);
  }

  const scanOnly = useCallback(async () => {
    setBusy(true);
    try {
      const s = await loadSettings();
      setSettings(s);
      const data = await scanSurebets({ sample_stake_ngn: s.bankroll });
      setBooksScanned(data.books_scanned || []);
      setOpps(data.opportunities || []);
      flash(
        data.opportunities?.length
          ? data.message || `Found ${data.opportunities.length} surebet(s).`
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
        setBooksScanned(data.books_scanned || []);
        setOpps(data.opportunities || []);
        flash(
          data.opportunities?.length
            ? data.message || `Found ${data.opportunities.length} surebet(s).`
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
  const bestProfit = opps.length
    ? Math.max(...opps.map((o) => Number(o.profit_pct) || 0))
    : 0;
  const scannedLabel = booksScanned.length
    ? booksScanned.map((b) => bookLabel(b)).join(' · ')
    : 'none yet — sync odds on Today';

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
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Surebet scanner</Text>
        <Text style={styles.booksScanned}>Books in scan: {scannedLabel}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statVal}>{opps.length}</Text>
          <Text style={styles.statLabel}>Found</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statVal, opps.length ? styles.statGood : null]}>
            {opps.length ? `${bestProfit.toFixed(2)}%` : '—'}
          </Text>
          <Text style={styles.statLabel}>Best profit</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statVal}>₦{bank.toLocaleString()}</Text>
          <Text style={styles.statLabel}>Sample stake</Text>
        </View>
      </View>

      {status ? (
        <View style={[styles.statusBox, statusBad && styles.statusBad]}>
          {busy ? <ActivityIndicator color={colors.accent} style={{ marginRight: 8 }} /> : null}
          <Text style={[styles.statusText, statusBad && styles.statusTextBad]}>{status}</Text>
        </View>
      ) : null}

      <Pressable
        style={[styles.btnPrimary, busy && styles.disabled]}
        disabled={busy}
        onPress={() => void findSurebets(true)}
      >
        <Text style={styles.btnPrimaryText}>{busy ? 'Working…' : 'Find surebets'}</Text>
      </Pressable>
      <Text style={styles.hint}>Pull down or tap Find surebets. Tap a card to copy stakes.</Text>

      {!opps.length && !busy ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No surebets right now</Text>
          <Text style={styles.emptyText}>Try again closer to kickoff after refreshing Today.</Text>
        </View>
      ) : null}

      {opps.map((o) => (
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
  hero: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  heroTitle: { color: colors.ink, fontWeight: '800', fontSize: 17 },
  heroText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  booksScanned: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
    lineHeight: 17,
  },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
  },
  statVal: { color: colors.ink, fontWeight: '800', fontSize: 16 },
  statGood: { color: colors.accent },
  statLabel: { color: colors.muted, fontSize: 11, marginTop: 2 },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentDim,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  statusBad: { backgroundColor: 'rgba(180,60,60,0.12)', borderColor: '#b43c3c' },
  statusText: { color: colors.ink, fontSize: 13, flex: 1 },
  statusTextBad: { color: '#ffb4b4' },
  btnPrimary: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
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
