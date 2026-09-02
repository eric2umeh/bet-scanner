import { useRouter, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
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

import { ApiError, pingHealth } from '../../src/api/client';
import { fetchBettableMatches, syncFixtures } from '../../src/api/matches';
import { fetchPublicAppConfig } from '../../src/api/appConfig';
import { syncOdds } from '../../src/api/odds';
import { scanGoalMarkets } from '../../src/api/predictions';
import { scanSafeBuilder } from '../../src/api/safe';
import { logTipBatch } from '../../src/api/tips';
import { invalidateTipsCache } from '../../src/query/invalidate';
import { BrandLogo } from '../../src/components/BrandLogo';
import { HelpHeaderButton } from '../../src/components/HelpHeaderButton';
import { SyncHeaderButton } from '../../src/components/SyncHeaderButton';
import { BetSlipFab } from '../../src/components/BetSlipFab';
import { useAppModal } from '../../src/components/modal';
import { formatMatchTitle } from '../../src/lib/matchDisplay';
import { bookLabel, marketLabel, tipKey } from '../../src/lib/tipKey';
import { formatConfidencePct } from '../../src/lib/marketLean';
import { setMatchCache } from '../../src/store/matchCache';
import { isTipLogged, markTipsLogged, subscribeLoggedTips } from '../../src/store/loggedTips';
import {
  clearSelection,
  getSelectedCount,
  getSelectedTips,
  initSelection,
  isTipSelected,
  pruneSelection,
  subscribeSelection,
  toggleTip,
} from '../../src/store/selection';
import { loadSettings, unitStakeNgn, type AppSettings } from '../../src/store/settings';
import { colors } from '../../src/theme/colors';
import { webScrollBottom } from '../../src/theme/webScroll';
import type { Match, TipPick } from '../../src/types/api';

type MarketFilter = 'all' | 'double_chance' | '1x2' | 'ou_2_5' | 'btts';

const isWeb = Platform.OS === 'web';
const UPCOMING_DAYS = 21;

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
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [picks, setPicks] = useState<TipPick[]>([]);
  const [filter, setFilter] = useState<MarketFilter>('all');
  const [bookFilter, setBookFilter] = useState<string>('all');
  const [status, setStatus] = useState('Pull down to refresh odds & Safe picks');
  const [busy, setBusy] = useState(false);
  const [selectedN, setSelectedN] = useState(0);
  const [asMulti, setAsMulti] = useState(true);
  const [, setLoggedRev] = useState(0);

  useEffect(() => {
    void initSelection();
  }, []);

  useEffect(() => subscribeSelection(() => setSelectedN(getSelectedCount())), []);
  useEffect(() => subscribeLoggedTips(() => setLoggedRev((n) => n + 1)), []);

  const availableBooks = useMemo(() => {
    const set = new Set<string>();
    for (const p of picks) {
      if (p.bookmaker) set.add(String(p.bookmaker).toLowerCase());
    }
    return [...set].sort();
  }, [picks]);

  const filteredPicks = useMemo(() => {
    if (bookFilter === 'all') return picks;
    return picks.filter((p) => String(p.bookmaker).toLowerCase() === bookFilter);
  }, [picks, bookFilter]);

  const picksByMatch = useMemo(() => {
    const map: Record<number, TipPick[]> = {};
    for (const p of filteredPicks) {
      if (filter !== 'all' && String(p.market).toLowerCase() !== filter) continue;
      if (!map[p.match_id]) map[p.match_id] = [];
      map[p.match_id].push(p);
    }
    return map;
  }, [filteredPicks, filter]);

  const visibleMatches = useMemo(() => {
    if (filter === 'all') return matches;
    return matches.filter((m) => (picksByMatch[m.id] || []).length > 0);
  }, [matches, picksByMatch, filter]);

  const loadScans = useCallback(async (s: AppSettings, books: string[]) => {
    const q = {
      pick_market: s.pickMarket,
      bankroll_ngn: s.bankroll,
      unit_pct: s.unitPct,
    };
    const safeCalls = books.map((bookmaker) =>
      scanSafeBuilder({ bookmaker, ...q }).catch(() => ({ picks: [] as TipPick[] }))
    );
    const goalCalls = books.map((bookmaker) =>
      scanGoalMarkets({ bookmaker, bankroll_ngn: s.bankroll, unit_pct: s.unitPct }).catch(
        () => ({ picks: [] as TipPick[] })
      )
    );
    const results = await Promise.all([...safeCalls, ...goalCalls]);
    const all = dedupePicks(results.flatMap((r) => r.picks || []));
    setPicks(all);
    return { n: all.length, picks: all };
  }, []);

  const loadMatchList = useCallback(async (books: string[]) => {
    const bettable = await fetchBettableMatches(UPCOMING_DAYS, books.join(','));
    return bettable;
  }, []);

  function enrichMatchesFromPicks(list: Match[], tipList: TipPick[]): Match[] {
    const byId = new Map(list.map((m) => [m.id, m]));
    for (const p of tipList) {
      if (!p.match_id || byId.has(p.match_id)) continue;
      byId.set(p.match_id, {
        id: p.match_id,
        competition_code: p.competition_code || 'UNK',
        competition_name: p.competition_code || 'Unknown',
        home_team: p.home_team || 'Home',
        away_team: p.away_team || 'Away',
        kickoff_at: p.kickoff_at || new Date().toISOString(),
        status: 'SCHEDULED',
        home_score: null,
        away_score: null,
      });
    }
    return Array.from(byId.values()).sort(
      (a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime()
    );
  }

  const refresh = useCallback(
    async (opts?: { withOdds?: boolean }) => {
      const withOdds = opts?.withOdds ?? false;
      setBusy(true);
      try {
        const s = settings || (await loadSettings());
        if (!settings) setSettings(s);
        if (withOdds) {
          setStatus('Syncing odds from your books…');
          await syncOdds();
        }
        const cfg = await fetchPublicAppConfig();
        const books = cfg.odds_bookmakers?.length
          ? cfg.odds_bookmakers
          : ['sportybet', 'onexbet'];
        const [health, bettable] = await Promise.all([
          pingHealth().catch(() => null),
          loadMatchList(books),
        ]);
        const { n, picks: all } = await loadScans(s, books);
        const merged = enrichMatchesFromPicks(bettable, all);
        setMatches(merged);
        setMatchCache(merged, all);
        pruneSelection(new Set(merged.map((m) => m.id)));
        setStatus(
          merged.length
            ? `${merged.length} match(es) with odds · ${n} Safe tip(s)${withOdds ? ' · odds updated' : ''}${health?.version ? ` · v${health.version}` : ''}`
            : withOdds
              ? 'Odds synced — no bettable matches (try Sync fixtures first)'
              : 'No matches with odds — Sync fixtures, then Load real bets'
        );
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [loadScans, loadMatchList, settings]
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


  async function onLoadRealBets() {
    setBusy(true);
    setStatus('Load real bets: syncing odds from your books…');
    try {
      const s = settings || (await loadSettings());
      if (!settings) setSettings(s);
      const cfg = await fetchPublicAppConfig();
      const books = cfg.odds_bookmakers?.length
        ? cfg.odds_bookmakers
        : ['sportybet', 'onexbet'];
      const sync = await syncOdds();
      const { n, picks: all } = await loadScans(s, books);
      const bettable = await loadMatchList(books);
      const merged = enrichMatchesFromPicks(bettable, all);
      setMatches(merged);
      setMatchCache(merged, all);
      pruneSelection(new Set(merged.map((m) => m.id)));
      const line = `${sync.message || 'Odds synced'} · ${merged.length} match(es) · ${n} tip(s).`;
      setStatus(line);
      await modal.alert({
        title: 'Load real bets',
        message: merged.length
          ? `${line}\n\nIf tips are still 0, odds may not fit Safe rules yet.`
          : `${sync.message || 'Odds synced'}\n\n0 matches with tips yet — tap Sync fixtures, then try again.`,
      });
    } catch (e) {
      const msg =
        e instanceof ApiError && e.status === 401
          ? `${e.message}\n\nAdd your app access key in Me → Settings (same as APP_API_KEY on the server).`
          : e instanceof Error
            ? e.message
            : String(e);
      setStatus(msg);
      await modal.alert({ title: 'Load real bets failed', message: msg });
    } finally {
      setBusy(false);
    }
  }

  async function onSyncFixtures() {
    setBusy(true);
    setStatus("Syncing match list from odds-api.io…");
    try {
      const result = await syncFixtures();
      const s = settings || (await loadSettings());
      if (!settings) setSettings(s);
      const cfg = await fetchPublicAppConfig();
      const books = cfg.odds_bookmakers?.length
        ? cfg.odds_bookmakers
        : ['sportybet', 'onexbet'];
      const bettable = await loadMatchList(books);
      const { n, picks: all } = await loadScans(s, books);
      const merged = enrichMatchesFromPicks(bettable, all);
      setMatches(merged);
      setMatchCache(merged, all);
      pruneSelection(new Set(merged.map((m) => m.id)));
      setStatus(`${result.message} · ${merged.length} match(es) · ${n} tip(s)`);
      await modal.alert({
        title: 'Fixtures synced',
        message: `${result.message}\n${merged.length} match(es) with odds on Today. Tap Load real bets if odds are stale.`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(msg);
      await modal.alert({ title: 'Sync fixtures failed', message: msg });
    } finally {
      setBusy(false);
    }
  }

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
      await markTipsLogged(tips);
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
        contentContainerStyle={[
          styles.content,
          isWeb && { paddingBottom: webScrollBottom(20) },
          selectedN > 0 && { paddingBottom: webScrollBottom(88) },
        ]}
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

        {availableBooks.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
            <Pressable
              style={[styles.chip, bookFilter === 'all' && styles.chipOn]}
              onPress={() => setBookFilter('all')}
            >
              <Text style={[styles.chipText, bookFilter === 'all' && styles.chipTextOn]}>
                All books
              </Text>
            </Pressable>
            {availableBooks.map((b) => (
              <Pressable
                key={b}
                style={[styles.chip, bookFilter === b && styles.chipOn]}
                onPress={() => setBookFilter(b)}
              >
                <Text style={[styles.chipText, bookFilter === b && styles.chipTextOn]}>
                  {bookLabel(b)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <Text style={styles.hint}>
          Pull down or tap ↻ to sync odds & rescan · tick same-book legs → Log selected.
        </Text>

        <View style={styles.actionRow}>
          <Pressable
            style={[styles.btn, styles.actionBtn, busy && styles.btnDisabled]}
            onPress={() => void onLoadRealBets()}
            disabled={busy}
          >
            <Text style={styles.btnText}>Load real bets</Text>
          </Pressable>
          <Pressable
            style={[styles.btnSecondary, styles.actionBtn, busy && styles.btnDisabled]}
            onPress={() => void onSyncFixtures()}
            disabled={busy}
          >
            <Text style={styles.btnSecondaryText}>Sync fixtures</Text>
          </Pressable>
        </View>
        <Text style={styles.actionHint}>
          Sync fixtures = odds-api.io events · Load real bets = fresh SportyBet / 1xBet odds.
        </Text>

        {busy && !matches.length ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
        ) : null}

        {showNoTipsBanner ? (
          <View style={styles.staleBanner}>
            <Text style={styles.emptyTitle}>No Safe tips yet</Text>
            <Text style={styles.staleText}>
              Pull down to sync SportyBet/1xBet odds and rescan Safe picks.
            </Text>
          </View>
        ) : null}

        {!busy && !visibleMatches.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No matches yet</Text>
            <Text style={styles.staleText}>
              No matches with fresh odds. Sync fixtures → Load real bets. Set SportyBet + 1xBet
              in root .env (ODDS_API_IO_BOOKMAKERS) and on your odds-api.io dashboard.
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
                <Text style={styles.match} numberOfLines={1}>
                  {formatMatchTitle(m.home_team, m.away_team)}
                </Text>
                {!tips.length ? (
                  <Text style={styles.noTip}>No tip — open for odds</Text>
                ) : (
                  tips.map((p) => {
                    const on = isTipSelected(p);
                    const logged = isTipLogged(p);
                    return (
                      <Pressable
                        key={tipKey(p)}
                        style={[styles.tipRow, on && styles.tipRowOn, logged && styles.tipRowLogged]}
                        onPress={() => !logged && toggleTip(p)}
                        disabled={logged}
                      >
                        <View style={[styles.check, on && styles.checkOn, logged && styles.checkLogged]}>
                          {logged ? <Text style={styles.checkMark}>✓</Text> : on ? <Text style={styles.checkMark}>✓</Text> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[styles.tipTitle, logged && styles.tipTitleLogged]}
                            numberOfLines={2}
                          >
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

      <BetSlipFab
        asMulti={asMulti}
        onAsMultiChange={setAsMulti}
        onLog={() => void onLogSelected()}
        busy={busy}
      />
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
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  actionBtn: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  actionHint: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 8,
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
  tipRowLogged: { opacity: 0.72 },
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
  checkLogged: { backgroundColor: colors.muted, borderColor: colors.muted },
  checkMark: { color: '#06241c', fontWeight: '800', fontSize: 12 },
  tipTitle: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  tipTitleLogged: { textDecorationLine: 'line-through', color: colors.muted },
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
