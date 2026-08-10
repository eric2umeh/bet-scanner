import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import {
  autoSettleTips,
  fetchTipStats,
  fetchTips,
  settleTip,
  type TipOut,
} from '../../src/api/tips';
import { bookLabel, marketLabel } from '../../src/lib/tipKey';
import { colors } from '../../src/theme/colors';

type Stats = {
  hit_rate_pct: number | null;
  won: number;
  lost: number;
  pending: number;
  total: number;
  message: string;
};

const SETTLE_OPTS: { value: string; label: string }[] = [
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'void', label: 'Void' },
  { value: 'pending', label: 'Pend' },
];

function resultColor(result: string) {
  const r = (result || '').toLowerCase();
  if (r === 'won') return colors.good;
  if (r === 'lost') return colors.bad;
  if (r === 'pending') return colors.warn;
  return colors.muted;
}

function slipOverall(legs: TipOut[]): string {
  const results = legs.map((l) => (l.result || 'pending').toLowerCase());
  if (results.some((r) => r === 'pending')) return 'pending';
  if (results.some((r) => r === 'lost')) return 'lost';
  if (results.every((r) => r === 'void')) return 'void';
  if (results.every((r) => r === 'won' || r === 'void')) return 'won';
  return 'pending';
}

function combinedOdds(legs: TipOut[]): number | null {
  let product = 1;
  let n = 0;
  for (const leg of legs) {
    const o = Number(leg.odds_price);
    if (Number.isFinite(o) && o > 1) {
      product *= o;
      n += 1;
    }
  }
  return n ? product : null;
}

function stakeOf(legs: TipOut[]) {
  return legs.map((l) => l.stake_ngn).find((s) => s != null && Number(s) > 0);
}

/** Date + kickoff, or FT score when finished. */
function matchWhen(t: TipOut, compact = false): string {
  const status = (t.match_status || '').toUpperCase();
  const finished = status === 'FINISHED';
  const hasScore = t.home_score != null && t.away_score != null;

  let when = '—';
  if (t.kickoff_at) {
    const d = new Date(t.kickoff_at);
    when = finished
      ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
      : d.toLocaleString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
  }

  if (finished && hasScore) {
    const ft = `FT ${t.home_score}-${t.away_score}`;
    return compact ? `${when} · ${ft}` : `${when} · ${ft}`;
  }
  if (!finished && t.kickoff_at) {
    return compact ? when : `Kickoff ${when}`;
  }
  return when;
}

export default function TipsScreen() {
  const [tips, setTips] = useState<TipOut[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [status, setStatus] = useState('Loading tips…');
  const [busy, setBusy] = useState(false);
  const [settlingId, setSettlingId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [list, s] = await Promise.all([fetchTips(50), fetchTipStats()]);
      setTips(list);
      setStats(s);
      setStatus(list.length ? `Loaded ${list.length} tip(s)` : 'No tips logged yet');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const { singles, multis } = useMemo(() => {
    const singles: TipOut[] = [];
    const multis: Record<string, TipOut[]> = {};
    for (const t of tips) {
      if (t.slip_id) {
        (multis[t.slip_id] || (multis[t.slip_id] = [])).push(t);
      } else {
        singles.push(t);
      }
    }
    for (const legs of Object.values(multis)) {
      legs.sort((a, b) => a.id - b.id);
    }
    return { singles, multis };
  }, [tips]);

  async function onSettle(tipId: number, result: string, applyToSlip = false) {
    setSettlingId(tipId);
    try {
      await settleTip(tipId, result, { apply_to_slip: applyToSlip });
      setStatus(
        applyToSlip
          ? `Whole multi → ${result}`
          : `Tip #${tipId} → ${result}`
      );
      await refresh();
    } catch (e) {
      Alert.alert('Settle failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSettlingId(null);
    }
  }

  async function onAutoSettle() {
    setBusy(true);
    setStatus('Settling finished tips from final scores…');
    try {
      const data = await autoSettleTips();
      setStatus(
        `${data.message} Open games stay pending. Each multi selection settles when that match ends.`
      );
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(msg);
      Alert.alert('Could not settle tips', msg);
    } finally {
      setBusy(false);
    }
  }

  function SettleButtons({
    tipId,
    current,
    compact,
  }: {
    tipId: number;
    current: string;
    compact?: boolean;
  }) {
    return (
      <View style={styles.settleRow}>
        {SETTLE_OPTS.map((opt) => {
          const active = current === opt.value;
          return (
            <Pressable
              key={opt.value}
              style={[
                styles.settleBtn,
                compact && styles.settleBtnSm,
                active && styles.settleBtnOn,
                settlingId === tipId && styles.disabled,
              ]}
              disabled={settlingId === tipId || busy}
              onPress={() => onSettle(tipId, opt.value, false)}
            >
              <Text
                style={[
                  styles.settleBtnText,
                  compact && styles.settleBtnTextSm,
                  active && styles.settleBtnTextOn,
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={busy} onRefresh={refresh} tintColor={colors.accent} />
        }
      >
        <Text style={styles.title}>Tips</Text>
        <Text style={styles.muted}>
          Settle finished tips marks Won or Lost from final match scores. Games that have not
          ended stay pending. For a multi, each selection settles when that match finishes —
          open the multi to mark a single selection by hand.
        </Text>
        <Text style={styles.status}>{status}</Text>

        {stats ? (
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{stats.hit_rate_pct ?? '—'}%</Text>
              <Text style={styles.statLabel}>Hit rate</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{stats.won}</Text>
              <Text style={styles.statLabel}>Won</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{stats.lost}</Text>
              <Text style={styles.statLabel}>Lost</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{stats.pending}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.row}>
          <Pressable style={[styles.btn, busy && styles.disabled]} onPress={onAutoSettle} disabled={busy}>
            <Text style={styles.btnText}>Settle finished tips</Text>
          </Pressable>
          <Pressable style={[styles.btnSecondary, busy && styles.disabled]} onPress={refresh} disabled={busy}>
            <Text style={styles.btnSecondaryText}>Refresh</Text>
          </Pressable>
        </View>

        {busy && !tips.length ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
        ) : null}

        {!busy && !tips.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No tips yet</Text>
            <Text style={styles.muted}>
              On Today, tick tips → Log selected. They appear here.
            </Text>
          </View>
        ) : null}

        {Object.entries(multis).map(([slipId, legs]) => {
          const book = bookLabel(legs[0].bookmaker || '');
          const combined = combinedOdds(legs);
          const stake = stakeOf(legs);
          const overall = slipOverall(legs);
          const headId = legs[0].id;
          const open = !!expanded[slipId];
          const dense = legs.length >= 3;

          return (
            <View key={slipId} style={styles.card}>
              <Pressable onPress={() => setExpanded((e) => ({ ...e, [slipId]: !open }))}>
                <Text style={[styles.cardTitle, dense && styles.cardTitleSm]}>
                  Multi · {book} · {legs.length} legs
                  {combined != null ? ` @ ${combined.toFixed(2)}` : ''}
                  {open ? ' ▲' : ' ▼'}
                </Text>
                <Text style={[styles.meta, dense && styles.metaSm]}>
                  <Text style={{ color: resultColor(overall), fontWeight: '700' }}>
                    {overall.toUpperCase()}
                  </Text>
                  {' · '}stake ₦{stake ?? '—'} · tap to edit legs
                </Text>
                {legs.map((leg) => (
                  <Text key={leg.id} style={[styles.leg, dense && styles.legSm]} numberOfLines={dense ? 2 : 3}>
                    <Text style={{ color: resultColor(leg.result), fontWeight: '700' }}>
                      {leg.result.slice(0, 1).toUpperCase()}
                    </Text>
                    {' '}
                    {leg.home_team} vs {leg.away_team}
                    {' · '}
                    {marketLabel(leg.market)}/{String(leg.selection).toUpperCase()}
                    {leg.odds_price != null ? ` @${leg.odds_price}` : ''}
                    {'\n'}
                    <Text style={styles.when}>{matchWhen(leg, true)}</Text>
                  </Text>
                ))}
              </Pressable>

              {open ? (
                <View style={styles.expandBox}>
                  <Text style={styles.expandLabel}>Settle each leg</Text>
                  {legs.map((leg) => (
                    <View key={leg.id} style={styles.legBlock}>
                      <Text style={styles.legBlockTitle} numberOfLines={2}>
                        {leg.home_team} vs {leg.away_team}
                      </Text>
                      <Text style={styles.when}>{matchWhen(leg)}</Text>
                      <Text style={styles.metaSm}>
                        {marketLabel(leg.market)}/{String(leg.selection).toUpperCase()}
                        {leg.odds_price != null ? ` @ ${leg.odds_price}` : ''}
                        {' · '}
                        <Text style={{ color: resultColor(leg.result) }}>{leg.result}</Text>
                      </Text>
                      <SettleButtons tipId={leg.id} current={leg.result} compact />
                    </View>
                  ))}
                  <Text style={[styles.expandLabel, { marginTop: 10 }]}>Whole multi</Text>
                  <View style={styles.settleRow}>
                    {SETTLE_OPTS.map((opt) => (
                      <Pressable
                        key={opt.value}
                        style={[styles.settleBtn, styles.settleBtnSm, settlingId === headId && styles.disabled]}
                        disabled={settlingId === headId || busy}
                        onPress={() =>
                          Alert.alert(
                            'Settle whole multi',
                            `Mark all ${legs.length} legs as ${opt.label}?`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Yes',
                                onPress: () => onSettle(headId, opt.value, true),
                              },
                            ]
                          )
                        }
                      >
                        <Text style={styles.settleBtnTextSm}>All {opt.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}

        {singles.map((t) => (
          <View key={t.id} style={styles.card}>
            <Text style={styles.cardTitle}>
              {t.home_team} vs {t.away_team}
            </Text>
            <Text style={styles.when}>{matchWhen(t)}</Text>
            <Text style={styles.meta}>
              <Text style={{ color: resultColor(t.result), fontWeight: '700' }}>
                {t.result.toUpperCase()}
              </Text>
              {' · '}
              {marketLabel(t.market)}/{String(t.selection).toUpperCase()}
              {t.odds_price != null ? ` @ ${t.odds_price}` : ''}
              {' · '}
              {bookLabel(t.bookmaker || '')}
              {' · '}stake ₦{t.stake_ngn ?? '—'}
            </Text>
            <SettleButtons tipId={t.id} current={t.result} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '700' },
  muted: { color: colors.muted, marginTop: 6, fontSize: 13, lineHeight: 18 },
  status: { color: colors.ink, marginTop: 10, fontSize: 13 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 14 },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
  },
  statVal: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  statLabel: { color: colors.muted, fontSize: 11, marginTop: 2 },
  row: { flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap' },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  btnText: { color: '#06241c', fontWeight: '700' },
  btnSecondary: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  btnSecondaryText: { color: colors.ink, fontWeight: '600' },
  disabled: { opacity: 0.55 },
  empty: {
    marginTop: 24,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
  },
  emptyTitle: { color: colors.ink, fontWeight: '700', fontSize: 16 },
  card: {
    marginTop: 12,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  cardTitle: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  cardTitleSm: { fontSize: 13 },
  meta: { color: colors.muted, marginTop: 4, fontSize: 12, lineHeight: 17 },
  metaSm: { color: colors.muted, marginTop: 2, fontSize: 11, lineHeight: 15 },
  when: { color: colors.muted, fontSize: 11, marginTop: 2 },
  leg: { color: colors.ink, marginTop: 6, fontSize: 12, lineHeight: 16 },
  legSm: { fontSize: 11, lineHeight: 14, marginTop: 4 },
  expandBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  expandLabel: { color: colors.accent, fontWeight: '700', fontSize: 12, marginBottom: 6 },
  legBlock: {
    marginTop: 8,
    padding: 8,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  legBlockTitle: { color: colors.ink, fontWeight: '700', fontSize: 12 },
  settleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  settleBtn: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  settleBtnSm: { paddingVertical: 5, paddingHorizontal: 8 },
  settleBtnOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  settleBtnText: { color: colors.muted, fontWeight: '600', fontSize: 12 },
  settleBtnTextSm: { color: colors.muted, fontWeight: '600', fontSize: 11 },
  settleBtnTextOn: { color: colors.accent },
});
