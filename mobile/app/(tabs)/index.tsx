import { useRouter, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pingHealth } from '../../src/api/client';
import { fetchTodayMatches } from '../../src/api/matches';
import { syncOdds } from '../../src/api/odds';
import { scanGoalMarkets } from '../../src/api/predictions';
import { scanSafeBuilder } from '../../src/api/safe';
import { logTipBatch } from '../../src/api/tips';
import { invalidateTipsCache } from '../../src/query/invalidate';
import { BrandLogo } from '../../src/components/BrandLogo';
import { HelpHeaderButton } from '../../src/components/HelpHeaderButton';
import { SyncHeaderButton } from '../../src/components/SyncHeaderButton';
import { useAppModal } from '../../src/components/modal';
import { bookLabel, marketLabel, tipKey } from '../../src/lib/tipKey';
import { formatConfidencePct } from '../../src/lib/marketLean';
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
import { webScrollBottom } from '../../src/theme/webScroll';
import type { Match, TipPick } from '../../src/types/api';

type MarketFilter = 'all' | 'double_chance' | '1x2' | 'ou_2_5' | 'btts';

const isWeb = Platform.OS === 'web';

function kickoffLabel(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
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
  const navigation = useNavigation();
  const modal = useAppModal();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [picks, setPicks] = useState<TipPick[]>([]);
  const [filter, setFilter] = useState<MarketFilter>('all');
  const [status, setStatus] = useState('Pull down to refresh odds & Safe picks');
  const [busy, setBusy] = useState(false);
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

  const refresh = useCallback(
    async (opts?: { withOdds?: boolean }) => {
      const withOdds = opts?.withOdds ?? false;
      setBusy(true);
      try {
        const s = settings || (await loadSettings());
        if (!settings) setSettings(s);
        if (withOdds) {
          setStatus('Syncing SportyBet / Bet9ja odds…');
          await syncOdds();
        }
        const [health, today] = await Promise.all([
          pingHealth().catch(() => null),
          fetchTodayMatches(),
        ]);
        setMatches(today);
        const { n, picks: all } = await loadScans(s);
        setMatchCache(today, all);
        setStatus(
          today.length
            ? `${today.length} match(es) · ${n} Safe tip(s)${withOdds ? ' · odds updated' : ''}${health?.version ? ` · v${health.version}` : ''}`
            : withOdds
              ? 'Odds synced — no matches today yet'
              : 'No matches today — pull down to sync odds'
        );
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [loadScans, settings]
  );

  const onSyncOdds = useCallback(() => {
    void refresh({ withOdds: true });
  }, [refresh]);

  useLayoutEffect(() => {
    if (isWeb) return;
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <SyncHeaderButton onPress={onSyncOdds} disabled={busy} busy={busy} />
          <HelpHeaderButton />
        </View>
      ),
    });
  }, [navigation, onSyncOdds, busy]);

  useEffect(() => {
    void refresh({ withOdds: false });
  }, []);


  async function onLogSelected() {
    const tips = getSelectedTips();
    if (!tips.length) {
      await modal.alert({
        title: 'Nothing selected',
        message: 'Tick tips you placed, then Log selected.',
      });
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
      await invalidateTipsCache();
      setStatus(data.message);
      await modal.alert({
        title: 'Logged',
        message: `${data.message}\nOpen the Tips tab to see them.`,
      });
    } catch (e) {
      await modal.alert({
        title: 'Log failed',
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  const chips: { id: MarketFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'double_chance', label: 'Double chance' },
    { id: '1x2', label: 'Winner' },
    { id: 'ou_2_5', label: 'O/U 2.5' },
    { id: 'btts', label: 'BTTS' },
  ];

  const showNoTipsBanner = !busy && matches.length > 0 && picks.length === 0;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, isWeb && { paddingBottom: webScrollBottom(20) }]}
        refreshControl={
          <RefreshControl
            refreshing={busy}
            onRefresh={onSyncOdds}
            tintColor={colors.accent}
          />
        }
      >
        <View style={[styles.topbar, isWeb && styles.topbarWeb]}>
          <View style={styles.hero}>
            <BrandLogo size="md" showWordmark />
            {isWeb ? (
              <View style={styles.headerActions}>
                <SyncHeaderButton onPress={onSyncOdds} disabled={busy} busy={busy} />
                <HelpHeaderButton />
              </View>
            ) : null}
          </View>
          <Text style={styles.statusLine}>{status}</Text>
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

        <Text style={styles.hint}>
          Pull down or tap ↻ to sync odds & rescan · tick same-book legs → Log selected.
        </Text>

        {busy && !matches.length ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
        ) : null}

        {showNoTipsBanner ? (
          <View style={styles.staleBanner}>
            <Text style={styles.emptyTitle}>No Safe tips yet</Text>
            <Text style={styles.staleText}>
              Pull down to sync SportyBet/Bet9ja odds and rescan Safe picks.
            </Text>
          </View>
        ) : null}

        {!busy && !visibleMatches.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No matches yet</Text>
            <Text style={styles.staleText}>
              Pull down to sync odds and load today&apos;s matches.
            </Text>
          </View>
        ) : null}

        <View style={[styles.matchGrid, isWeb && styles.matchGridWeb]}>
          {visibleMatches.map((m) => {
            const tips = picksByMatch[m.id] || [];
            const hasTip = tips.length > 0;
            return (
              <Pressable
                key={m.id}
                style={[styles.card, isWeb && styles.cardWeb, hasTip && styles.cardHasTip]}
                onPress={() => router.push(`/match/${m.id}`)}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.league} numberOfLines={1}>
                    {m.competition_code || '—'}
                  </Text>
                  <Text style={styles.kickoff} numberOfLines={2}>
                    {kickoffLabel(m.kickoff_at)}
                  </Text>
                </View>
                <Text style={styles.match} numberOfLines={3}>
                  {m.home_team} vs {m.away_team}
                </Text>
                {!tips.length ? (
                  <Text style={styles.noTip}>No tip — open for odds</Text>
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
                          <Text style={styles.tipTitle} numberOfLines={2}>
                            {marketLabel(p.market)} · {String(p.selection).toUpperCase()}
                            {p.odds != null ? ` @ ${p.odds}` : ''}
                          </Text>
                          <Text style={styles.tipMeta} numberOfLines={2}>
                            {bookLabel(p.bookmaker)}
                            {(() => {
                              const lean = formatConfidencePct(p.market, p.confidence_pct);
                              return lean ? ` · ${lean}` : '';
                            })()}
                          </Text>
                          {p.singles_only_hint ? (
                            <Text style={styles.tipWarn} numberOfLines={2}>
                              {p.singles_only_hint}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </Pressable>
            );
          })}
        </View>
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
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28 },
  topbar: { marginBottom: 4 },
  topbarWeb: {
    paddingBottom: 10,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(42, 53, 64, 0.7)',
    backgroundColor: 'rgba(11, 16, 20, 0.88)',
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  statusLine: {
    color: colors.muted,
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
  },
  hint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
    marginBottom: 4,
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: '#06241c', fontWeight: '700', fontSize: 13, textAlign: 'center' },
  btnSecondary: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  btnSecondaryText: { color: colors.ink, fontWeight: '600', fontSize: 13, textAlign: 'center' },
  chips: { marginTop: 4, marginBottom: 2, maxHeight: 44 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    marginRight: 8,
  },
  chipOn: { backgroundColor: colors.accentDim, borderColor: 'rgba(45, 212, 168, 0.45)' },
  chipText: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  chipTextOn: { color: colors.accent },
  matchGrid: { marginTop: 8 },
  matchGridWeb: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  card: {
    marginTop: 10,
    backgroundColor: '#1c2630',
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardWeb: {
    width: '48%',
    flexGrow: 1,
    flexBasis: '48%',
    marginTop: 0,
    minWidth: 0,
  },
  cardHasTip: {
    borderColor: 'rgba(45, 212, 168, 0.4)',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 8,
  },
  league: { color: colors.muted, fontSize: 11, fontWeight: '600', flex: 1 },
  kickoff: { color: colors.muted, fontSize: 10, textAlign: 'right', maxWidth: '52%' },
  match: { color: colors.ink, fontSize: 14, fontWeight: '700', lineHeight: 19 },
  noTip: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(42, 53, 64, 0.85)',
  },
  staleBanner: {
    marginTop: 10,
    marginBottom: 4,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(20, 27, 34, 0.6)',
  },
  staleText: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  tipRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(42, 53, 64, 0.85)',
  },
  tipRowOn: { backgroundColor: colors.accentDim, borderRadius: 10, paddingHorizontal: 8, paddingBottom: 8 },
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
  tipWarn: { color: colors.warn, fontSize: 11, marginTop: 4, lineHeight: 15 },
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
