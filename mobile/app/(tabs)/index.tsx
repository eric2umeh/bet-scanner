import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { API_URL, pingHealth } from '../../src/api/client';
import { fetchTodayMatches } from '../../src/api/matches';
import { syncOdds } from '../../src/api/odds';
import { scanGoalMarkets } from '../../src/api/predictions';
import { scanSafeBuilder } from '../../src/api/safe';
import { logTipBatch } from '../../src/api/tips';
import { invalidateTipsCache } from '../../src/query/invalidate';
import { BrandLogo } from '../../src/components/BrandLogo';
import { bookLabel, marketLabel, tipKey } from '../../src/lib/tipKey';
import { setMatchCache } from '../../src/store/matchCache';
import {
  clearSelection,
  getSelectedCount,
  getSelectedTips,
  isTipSelected,
  subscribeSelection,
  toggleTip,
} from '../../src/store/selection';
import { loadSettings, unitStakeNgn, type AppSettings } from '../../src/store/settings';
import { colors } from '../../src/theme/colors';
import type { Match, TipPick } from '../../src/types/api';

type MarketFilter = 'all' | 'double_chance' | '1x2' | 'ou_2_5' | 'btts';

function kickoffLabel(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function dedupePicks(picks: TipPick[]): TipPick[] {
  const seen = new Set<string>();
  const out: TipPick[] = [];
  for (const p of picks) {
    if (p.match_id == null) continue;
    const k = tipKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

export default function TodayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [picks, setPicks] = useState<TipPick[]>([]);
  const [filter, setFilter] = useState<MarketFilter>('all');
  const [status, setStatus] = useState('Pull to refresh · Load real bets syncs odds');
  const [busy, setBusy] = useState(false);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [apiVersion, setApiVersion] = useState<string | null>(null);
  const [selectedN, setSelectedN] = useState(0);
  const [asMulti, setAsMulti] = useState(true);

  useEffect(() => subscribeSelection(() => setSelectedN(getSelectedCount())), []);

  const picksByMatch = useMemo(() => {
    const map: Record<number, TipPick[]> = {};
    for (const p of picks) {
      if (filter !== 'all' && String(p.market).toLowerCase() !== filter) continue;
      if (!map[p.match_id]) map[p.match_id] = [];
      map[p.match_id].push(p);
    }
    return map;
  }, [picks, filter]);

  const visibleMatches = useMemo(() => {
    if (filter === 'all') return matches;
    return matches.filter((m) => (picksByMatch[m.id] || []).length > 0);
  }, [matches, picksByMatch, filter]);

  const loadScans = useCallback(async (s: AppSettings) => {
    const q = {
      pick_market: s.pickMarket,
      bankroll_ngn: s.bankroll,
      unit_pct: s.unitPct,
    };
    const [sporty, bet9ja, predS, predB] = await Promise.all([
      scanSafeBuilder({ bookmaker: 'sportybet', ...q }),
      scanSafeBuilder({ bookmaker: 'bet9ja', ...q }).catch(() => ({ picks: [] as TipPick[] })),
      scanGoalMarkets({ bookmaker: 'sportybet', bankroll_ngn: s.bankroll, unit_pct: s.unitPct }).catch(
        () => ({ picks: [] as TipPick[] })
      ),
      scanGoalMarkets({ bookmaker: 'bet9ja', bankroll_ngn: s.bankroll, unit_pct: s.unitPct }).catch(
        () => ({ picks: [] as TipPick[] })
      ),
    ]);
    const all = dedupePicks([
      ...(sporty.picks || []),
      ...(bet9ja.picks || []),
      ...(predS.picks || []),
      ...(predB.picks || []),
    ]);
    setPicks(all);
    return { n: all.length, picks: all };
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const s = settings || (await loadSettings());
      if (!settings) setSettings(s);
      const [health, today] = await Promise.all([
        pingHealth().catch(() => null),
        fetchTodayMatches(),
      ]);
      setApiOk(!!health);
      setApiVersion(health?.version ?? null);
      setMatches(today);
      const { n, picks: all } = await loadScans(s);
      setMatchCache(today, all);
      setStatus(
        today.length
          ? `${today.length} match(es) · ${n} tip(s) · tap card for Odds`
          : 'No matches today — try Load real bets after fixtures sync'
      );
    } catch (e) {
      setApiOk(false);
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [loadScans, settings]);

  useEffect(() => {
    refresh();
  }, []);

  async function onLoadRealBets() {
    setBusy(true);
    setStatus('Syncing NG odds (uses free quota)…');
    try {
      const s = settings || (await loadSettings());
      if (!settings) setSettings(s);
      const sync = await syncOdds();
      const today = await fetchTodayMatches();
      setMatches(today);
      const { n, picks: all } = await loadScans(s);
      setMatchCache(today, all);
      setStatus(`${sync.message || 'Odds synced'} · ${n} tip(s)`);
      Alert.alert('Real bets', `${sync.message || 'Synced'}\n${n} tip(s) found.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(msg);
      Alert.alert('Load real bets failed', msg);
    } finally {
      setBusy(false);
    }
  }

  async function onLogSelected() {
    const tips = getSelectedTips();
    if (!tips.length) {
      Alert.alert('Nothing selected', 'Tick tips you placed, then Log selected.');
      return;
    }
    setBusy(true);
    try {
      const s = settings || (await loadSettings());
      const data = await logTipBatch({
        tips,
        as_multi: asMulti,
        stakeFallback: unitStakeNgn(s),
      });
      clearSelection();
      invalidateTipsCache();
      setStatus(data.message);
      Alert.alert('Logged', `${data.message}\nOpen the Tips tab to see them.`);
    } catch (e) {
      Alert.alert('Log failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const chips: { id: MarketFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'double_chance', label: 'DC' },
    { id: '1x2', label: '1X2' },
    { id: 'ou_2_5', label: 'O/U' },
    { id: 'btts', label: 'BTTS' },
  ];

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={busy} onRefresh={refresh} tintColor={colors.accent} />
        }
      >
        <BrandLogo size="md" showWordmark style={{ marginBottom: 4 }} />
        <Text style={styles.muted}>
          {apiOk
            ? `Server OK · v${apiVersion || '?'}`
            : 'Cannot reach server'}{' '}
          · {API_URL.replace(/^https?:\/\//, '')}
        </Text>
        <Text style={styles.status}>{status}</Text>

        <View style={styles.row}>
          <Pressable
            style={[styles.btn, busy && styles.btnDisabled]}
            onPress={onLoadRealBets}
            disabled={busy}
          >
            <Text style={styles.btnText}>Load real bets</Text>
          </Pressable>
          <Pressable style={[styles.btnSecondary, busy && styles.btnDisabled]} onPress={refresh} disabled={busy}>
            <Text style={styles.btnSecondaryText}>Refresh</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
          {chips.map((c) => (
            <Pressable
              key={c.id}
              style={[styles.chip, filter === c.id && styles.chipOn]}
              onPress={() => setFilter(c.id)}
            >
              <Text style={[styles.chipText, filter === c.id && styles.chipTextOn]}>{c.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {busy && !matches.length ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
        ) : null}

        {!busy && !visibleMatches.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No matches</Text>
            <Text style={styles.muted}>Tap Load real bets (needs live API with odds).</Text>
          </View>
        ) : null}

        {visibleMatches.map((m) => {
          const tips = picksByMatch[m.id] || [];
          return (
            <Pressable
              key={m.id}
              style={styles.card}
              onPress={() => router.push(`/match/${m.id}`)}
            >
              <Text style={styles.league}>
                {m.competition_code} · {m.status}
              </Text>
              <Text style={styles.match}>
                {m.home_team} vs {m.away_team}
              </Text>
              <Text style={styles.muted}>{kickoffLabel(m.kickoff_at)} · tap for Odds</Text>
              {!tips.length ? (
                <Text style={[styles.muted, { marginTop: 8 }]}>No tip for this filter</Text>
              ) : (
                tips.map((p) => {
                  const on = isTipSelected(p);
                  return (
                    <Pressable
                      key={tipKey(p)}
                      style={[styles.tipRow, on && styles.tipRowOn]}
                      onPress={() => toggleTip(p)}
                    >
                      <View style={[styles.check, on && styles.checkOn]}>
                        {on ? <Text style={styles.checkMark}>✓</Text> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.tipTitle}>
                          {marketLabel(p.market)} · {String(p.selection).toUpperCase()}
                          {p.odds != null ? ` @ ${p.odds}` : ''}
                        </Text>
                        <Text style={styles.tipMeta}>
                          {bookLabel(p.bookmaker)}
                          {p.confidence_pct != null ? ` · ${p.confidence_pct}%` : ''}
                          {p.suggested_stake_ngn != null ? ` · ₦${p.suggested_stake_ngn}` : ''}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {selectedN > 0 ? (
        <View style={[styles.selectBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={styles.selectTop}>
            <Text style={styles.selectCount}>{selectedN} selected</Text>
            <View style={styles.multiRow}>
              <Text style={styles.multiLabel}>Log as multi</Text>
              <Switch
                value={asMulti}
                onValueChange={setAsMulti}
                trackColor={{ true: colors.accent, false: colors.line }}
              />
            </View>
          </View>
          <View style={styles.selectActions}>
            <Pressable
              style={[styles.btn, styles.selectBtnFlex, busy && styles.btnDisabled]}
              onPress={onLogSelected}
              disabled={busy}
            >
              <Text style={styles.btnText}>Log selected</Text>
            </Pressable>
            <Pressable style={[styles.btnSecondary, styles.selectBtnFlex]} onPress={clearSelection}>
              <Text style={styles.btnSecondaryText}>Clear</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 28 },
  kicker: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '700', marginTop: 4 },
  muted: { color: colors.muted, marginTop: 4, fontSize: 13, lineHeight: 18 },
  status: { color: colors.ink, marginTop: 10, fontSize: 13 },
  row: { flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap' },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.55 },
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
  chips: { marginTop: 14, marginBottom: 6, maxHeight: 44 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    marginRight: 8,
  },
  chipOn: { backgroundColor: colors.accentDim, borderColor: colors.accent },
  chipText: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  chipTextOn: { color: colors.accent },
  card: {
    marginTop: 12,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  league: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  match: { color: colors.ink, fontSize: 16, fontWeight: '700', marginTop: 4 },
  tipRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tipRowOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: '#06241c', fontWeight: '800', fontSize: 12 },
  tipTitle: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  tipMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  empty: {
    marginTop: 24,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
  },
  emptyTitle: { color: colors.ink, fontWeight: '700', fontSize: 16 },
  selectBar: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
  },
  selectTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  selectCount: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  multiRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  multiLabel: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  selectActions: { flexDirection: 'row', gap: 8 },
  selectBtnFlex: { flex: 1, marginTop: 0 },
});
