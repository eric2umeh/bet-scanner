import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  formatSurebetPlan,
  logSurebetScan,
  scanSurebets,
  type ArbLeg,
  type ArbOpportunity,
} from '../api/edge';
import { bookLabel } from '../lib/tipKey';
import { shareOrCopyText } from '../lib/shareText';
import { loadSettings, type AppSettings } from '../store/settings';
import { colors } from '../theme/colors';

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
  const [status, setStatus] = useState<string | null>(null);
  const [statusBad, setStatusBad] = useState(false);
  const [showGuide, setShowGuide] = useState(true);

  function flash(msg: string, bad = false) {
    setStatus(msg);
    setStatusBad(bad);
    onFlash?.(msg, bad);
  }

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const s = await loadSettings();
      setSettings(s);
      const data = await scanSurebets({ sample_stake_ngn: s.bankroll });
      setOpps(data.opportunities || []);
      flash(
        data.opportunities?.length
          ? data.message || `Found ${data.opportunities.length} surebet(s).`
          : data.message || 'No surebets right now — try after refreshing odds.'
      );
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onLog() {
    if (!settings) return;
    setBusy(true);
    try {
      const data = await logSurebetScan({ bankroll_ngn: settings.bankroll });
      flash(data.message || 'Surebets logged to Tips tab.');
      await refresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }

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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Surebet scanner</Text>
        <Text style={styles.heroText}>
          Finds 1X2 arbitrage across SportyBet and Bet9ja. Stake each outcome so you lock profit
          no matter the result — if the edge still exists when you place all legs.
        </Text>
      </View>

      <Pressable style={styles.guideToggle} onPress={() => setShowGuide((v) => !v)}>
        <Text style={styles.guideToggleText}>
          {showGuide ? '▼' : '▶'} How to use (3 steps)
        </Text>
      </Pressable>
      {showGuide ? (
        <View style={styles.guideBox}>
          <Text style={styles.guideStep}>1 · Set bankroll in Me → Settings (sample stake ₦{bank})</Text>
          <Text style={styles.guideStep}>2 · Refresh odds — Me → Morning routine → Also refresh odds</Text>
          <Text style={styles.guideStep}>3 · Scan here → copy stake plan → place all legs quickly</Text>
        </View>
      ) : null}

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

      <View style={styles.actions}>
        <Pressable
          style={[styles.btnPrimary, busy && styles.disabled]}
          disabled={busy}
          onPress={() => void refresh()}
        >
          <Text style={styles.btnPrimaryText}>{busy ? 'Scanning…' : 'Scan for surebets'}</Text>
        </Pressable>
        <Pressable
          style={[styles.btnSecondary, busy && styles.disabled]}
          disabled={busy || !opps.length}
          onPress={() => void onLog()}
        >
          <Text style={styles.btnSecondaryText}>Log to Tips</Text>
        </Pressable>
      </View>

      {!opps.length && !busy ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No surebets right now</Text>
          <Text style={styles.emptyText}>
            This is normal — arbs are rare on two Nigerian books. Refresh odds and scan again
            closer to kickoff. Tiny % edges may not be placeable in practice.
          </Text>
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
        </View>
        <View style={styles.profitBadge}>
          <Text style={styles.profitPct}>+{String(opp.profit_pct)}%</Text>
          <Text style={styles.profitSub}>~₦{String(opp.sample_profit_ngn)}</Text>
        </View>
      </View>

      <Text style={styles.stakeTotal}>
        Total stake ₦{String(opp.sample_total_stake_ngn)} across {legs.length} legs
      </Text>

      <View style={styles.legsGrid}>
        {legs.map((leg, i) => (
          <LegPill key={`${leg.bookmaker}-${leg.selection}-${i}`} leg={leg} />
        ))}
      </View>

      {opp.warning ? <Text style={styles.warn}>{opp.warning}</Text> : null}

      <Pressable style={styles.copyBtn} onPress={onCopy}>
        <Text style={styles.copyBtnText}>Copy full stake plan</Text>
      </Pressable>
    </View>
  );
}

function LegPill({ leg }: { leg: ArbLeg }) {
  return (
    <View style={styles.legPill}>
      <Text style={styles.legSel}>{selLabel(leg.selection)}</Text>
      <Text style={styles.legBook}>{bookLabel(leg.bookmaker)}</Text>
      <Text style={styles.legOdds}>@{String(leg.odds)}</Text>
      <Text style={styles.legStake}>₦{String(leg.stake_ngn ?? '—')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  hero: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  heroTitle: { color: colors.accent, fontWeight: '800', fontSize: 18 },
  heroText: { color: colors.ink, fontSize: 13, lineHeight: 19, marginTop: 6 },
  guideToggle: { marginBottom: 6 },
  guideToggleText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  guideBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 6,
    marginBottom: 12,
  },
  guideStep: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    alignItems: 'center',
  },
  statVal: { color: colors.ink, fontWeight: '800', fontSize: 16 },
  statGood: { color: colors.good },
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
  statusBad: {
    backgroundColor: 'rgba(239, 107, 107, 0.12)',
    borderColor: colors.bad,
  },
  statusText: { flex: 1, color: colors.accent, fontSize: 13, fontWeight: '600' },
  statusTextBad: { color: colors.bad },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  btnPrimary: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#06241c', fontWeight: '800', fontSize: 15 },
  btnSecondary: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnSecondaryText: { color: colors.ink, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  empty: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
    marginBottom: 12,
  },
  emptyTitle: { color: colors.ink, fontWeight: '700', fontSize: 16 },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  cardHead: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  cardTitle: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  cardMeta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  profitBadge: {
    backgroundColor: colors.good + '22',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.good,
  },
  profitPct: { color: colors.good, fontWeight: '800', fontSize: 15 },
  profitSub: { color: colors.good, fontSize: 11, fontWeight: '600' },
  stakeTotal: { color: colors.muted, fontSize: 12, marginTop: 10, fontWeight: '600' },
  legsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  legPill: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: colors.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    alignItems: 'center',
  },
  legSel: { color: colors.ink, fontWeight: '800', fontSize: 13 },
  legBook: { color: colors.muted, fontSize: 11, marginTop: 2 },
  legOdds: { color: colors.accent, fontWeight: '700', fontSize: 13, marginTop: 4 },
  legStake: { color: colors.ink, fontWeight: '700', fontSize: 12, marginTop: 2 },
  warn: { color: colors.warn, fontSize: 12, marginTop: 8 },
  copyBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  copyBtnText: { color: colors.accent, fontWeight: '700' },
});
