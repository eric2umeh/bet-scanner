import { useRouter, useNavigation } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { isRequestCancelled, pingHealth, userFacingError } from '../../src/api/client';
import { fetchBettableMatches, syncFixtures } from '../../src/api/matches';
import { fetchPublicAppConfig } from '../../src/api/appConfig';
import { syncOdds } from '../../src/api/odds';
import { scanGoalMarkets } from '../../src/api/predictions';
import { scanSafeBuilder } from '../../src/api/safe';
import { logTipBatch } from '../../src/api/tips';
import { invalidateTipsCache } from '../../src/query/invalidate';
import { BrandLogo } from '../../src/components/BrandLogo';
import { BookLeanFilters } from '../../src/components/BookLeanFilters';
import { DatePickerField } from '../../src/components/DatePickerField';
import { FreeHomeExtras } from '../../src/components/FreeHomeExtras';
import { HorizontalChipScroll } from '../../src/components/HorizontalChipScroll';
import { HelpHeaderButton } from '../../src/components/HelpHeaderButton';
import { LeanBar } from '../../src/components/LeanBar';
import { OpenBookmakerButton } from '../../src/components/OpenBookmakerButton';
import { PaginationBar } from '../../src/components/PaginationBar';
import { ScreenInfoButton } from '../../src/components/ScreenInfoButton';
import { SyncHeaderButton } from '../../src/components/SyncHeaderButton';
import { BetSlipFab } from '../../src/components/BetSlipFab';
import { useWebPullRefresh, WebPullHint } from '../../src/components/useWebPullRefresh';
import { useAppModal } from '../../src/components/modal';
import { TOOL_INFO } from '../../src/content/toolInfo';
import { usePendingLoggedTips } from '../../src/hooks/usePendingLoggedTips';
import { useIsAdmin } from '../../src/hooks/useIsAdmin';
import { formatMatchTitle } from '../../src/lib/matchDisplay';
import { isMatchBettable } from '../../src/lib/matchBettable';
import { bookLabel, marketLabel, tipKey } from '../../src/lib/tipKey';
import { setMatchCache } from '../../src/store/matchCache';
import {
  isTipLogged,
  initLoggedTips,
  markTipsLogged,
  subscribeLoggedTips,
} from '../../src/store/loggedTips';
import {
  clearSelection,
  getSelectedCount,
  getSelectedTips,
  initSelection,
  isTipSelected,
  pruneSelection,
  selectionHasSameMatchLegs,
  subscribeSelection,
  toggleTip,
} from '../../src/store/selection';
import { loadSettings, unitStakeNgn, type AppSettings } from '../../src/store/settings';
import { LoadingRadar } from '../../src/components/LoadingRadar';
import { colors } from '../../src/theme/colors';
import { webScrollBottom } from '../../src/theme/webScroll';
import type { Match, TipPick } from '../../src/types/api';

type MarketFilter =
  | 'all'
  | 'double_chance'
  | '1x2'
  | 'ou_0_5'
  | 'ou_1_5'
  | 'ou_2_5'
  | 'btts'
  | 'tt_2_5';

const isWeb = Platform.OS === 'web';
const UPCOMING_DAYS = 21;
const PAGE_SIZE_DEFAULT = 10;

function toLocalIsoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Match kickoff to a local calendar day (YYYY-MM-DD). Empty filter = any day. */
function kickoffOnDate(kickoffAt: string | null | undefined, isoDate: string): boolean {
  if (!isoDate) return true;
  if (!kickoffAt) return false;
  const d = new Date(kickoffAt);
  if (Number.isNaN(d.getTime())) return false;
  return toLocalIsoDate(d) === isoDate;
}

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

function loggedPickStyle(logged: boolean) {
  if (!logged) return null;
  // Same style on web + native — RN web needs an explicit textDecorationStyle.
  return {
    color: colors.muted,
    textDecorationLine: 'line-through' as const,
    textDecorationStyle: 'solid' as const,
  };
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

const CHIP_LABELS: { id: MarketFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'double_chance', label: 'Double chance' },
  { id: '1x2', label: 'Winner' },
  { id: 'ou_0_5', label: 'O/U 0.5' },
  { id: 'ou_1_5', label: 'O/U 1.5' },
  { id: 'ou_2_5', label: 'O/U 2.5' },
  { id: 'btts', label: 'BTTS' },
  { id: 'tt_2_5', label: 'Team 3+' },
];

type LoggedFilter = 'all' | 'logged' | 'unlogged';

function emptyStateForFilter(
  filter: MarketFilter,
  opts: {
    minLeanPct: number;
    searchQ: string;
    totalTips: number;
    loggedFilter: LoggedFilter;
    dateFilter: string;
    fixturesOnSelectedDate: number;
  }
): { title: string; body: string } {
  if (opts.dateFilter && opts.fixturesOnSelectedDate === 0) {
    return {
      title: 'No bets for this date',
      body: `Nothing with tips on ${opts.dateFilter}. Pick another day, clear the date (×) to see all upcoming, or Load matches closer to kickoff.`,
    };
  }
  const leanHint =
    opts.minLeanPct > 0
      ? ` Lower Lean % (now ≥${opts.minLeanPct}) or tap Clear in Filters.`
      : ' Try Load matches.';
  const searchHint = opts.searchQ.trim()
    ? ' Clear search if you narrowed the list.'
    : '';
  const dateHint = opts.dateFilter
    ? ` Or clear the date filter (×) if tips sit on another day.`
    : '';
  const loggedHint =
    opts.loggedFilter === 'logged'
      ? ' Turn off Logged (or cycle to Unlogged / all) if you want tips you have not logged yet.'
      : opts.loggedFilter === 'unlogged'
        ? ' Cycle the Logged filter off if you want to see tips you already logged.'
        : '';

  if (opts.totalTips === 0) {
    return {
      title: 'No tips yet',
      body: 'Tap Load matches to sync prices. Tips appear when the book shows a clear lean.',
    };
  }

  const map: Record<MarketFilter, { title: string; body: string }> = {
    all: {
      title: 'No matches match your filters',
      body: `Tips exist, but search/book/lean/logged hid them.${searchHint}${leanHint}${loggedHint}${dateHint}`,
    },
    double_chance: {
      title: 'No Double chance tips',
      body: `No 1X/X2 Safe tips for this view.${leanHint}${searchHint}${loggedHint}${dateHint}`,
    },
    '1x2': {
      title: 'No Winner tips',
      body: `No 1X2 favourite tips for this view.${leanHint}${searchHint}${loggedHint}${dateHint}`,
    },
    ou_0_5: {
      title: 'No O/U 0.5 leans',
      body: `No Over 0.5 tips in this view — try Load matches / lower Lean %.${searchHint}${loggedHint}${dateHint}`,
    },
    ou_1_5: {
      title: 'No O/U 1.5 leans',
      body: `No Over 1.5 tips in this view — try Load matches / lower Lean %.${searchHint}${loggedHint}${dateHint}`,
    },
    ou_2_5: {
      title: 'No O/U 2.5 leans',
      body: `No O/U 2.5 tips in this view — try Load matches / lower Lean %.${searchHint}${loggedHint}${dateHint}`,
    },
    btts: {
      title: 'No BTTS leans',
      body: `No BTTS Yes/No tips in this view — try Load matches / lower Lean %.${searchHint}${loggedHint}${dateHint}`,
    },
    tt_2_5: {
      title: 'No Team 3+ tips',
      body:
        'Team scores 3+ needs Team Totals prices and Over fair ≥ ~30% in a 1.55–4.00 band. Tap Load matches; try MelBet / All books; lower Lean %.',
    },
  };
  return map[filter];
}

export default function TodayScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const modal = useAppModal();
  const isAdmin = useIsAdmin();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [picks, setPicks] = useState<TipPick[]>([]);
  const [filter, setFilter] = useState<MarketFilter>('all');
  const [bookFilter, setBookFilter] = useState<string>('all');
  const [searchQ, setSearchQ] = useState('');
  /** Default today; clear (×) = all upcoming days in the sync window. */
  const [dateFilter, setDateFilter] = useState(() => toLocalIsoDate());
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [minLeanPct, setMinLeanPct] = useState(0);
  const [loggedFilter, setLoggedFilter] = useState<LoggedFilter>('all');
  const [status, setStatus] = useState('Pull down to refresh tips');
  const [busy, setBusy] = useState(false);
  const syncAbortRef = useRef<AbortController | null>(null);
  const [selectedN, setSelectedN] = useState(0);
  const [asMulti, setAsMulti] = useState(true);
  const [loggedRev, setLoggedRev] = useState(0);
  /** Re-evaluate kickoff filters every minute without a full refresh. */
  const [clockTick, setClockTick] = useState(0);
  const { isPickLogged: isPickLoggedFromServer, refetchIfStale: refetchLoggedTipsIfStale } =
    usePendingLoggedTips(true);
  const { width: windowWidth } = useWindowDimensions();
  const narrowWeb = isWeb && windowWidth < 560;
  /** Laptop web (phone frame ≥640): denser cards so more fixtures fit in one view. */
  const denseLaptop = isWeb && windowWidth >= 640;
  const twoColWeb = denseLaptop;

  const pickIsLogged = useCallback(
    (p: TipPick) => isTipLogged(p) || isPickLoggedFromServer(p),
    [isPickLoggedFromServer, loggedRev]
  );

  useEffect(() => {
    void Promise.all([initSelection(), initLoggedTips()]);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setClockTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => subscribeSelection(() => setSelectedN(getSelectedCount())), []);
  useEffect(() => subscribeLoggedTips(() => setLoggedRev((n) => n + 1)), []);

  // Today focus: reuse cache unless stale (~90s) — no extra egress spam.
  useFocusEffect(
    useCallback(() => {
      refetchLoggedTipsIfStale();
    }, [refetchLoggedTipsIfStale])
  );
  const availableBooks = useMemo(() => {
    const set = new Set<string>();
    for (const p of picks) {
      if (p.bookmaker) set.add(String(p.bookmaker).toLowerCase());
    }
    return [...set].sort();
  }, [picks]);

  useEffect(() => {
    if (bookFilter !== 'all' && !availableBooks.includes(bookFilter)) {
      setBookFilter('all');
    }
  }, [availableBooks, bookFilter]);

  const filteredPicks = useMemo(() => {
    let list = picks;
    if (bookFilter !== 'all') {
      list = list.filter((p) => String(p.bookmaker).toLowerCase() === bookFilter);
    }
    if (dateFilter) {
      list = list.filter((p) => kickoffOnDate(p.kickoff_at, dateFilter));
    }
    return list;
  }, [picks, bookFilter, dateFilter]);

  const picksByMatch = useMemo(() => {
    void clockTick;
    const matchById = new Map(matches.map((m) => [m.id, m]));
    const map: Record<number, TipPick[]> = {};
    for (const p of filteredPicks) {
      const m = matchById.get(p.match_id);
      if (m) {
        if (!isMatchBettable(m)) continue;
        if (dateFilter && !kickoffOnDate(m.kickoff_at, dateFilter)) continue;
      } else if (
        !isMatchBettable({
          kickoff_at: p.kickoff_at,
          status: undefined,
        })
      ) {
        continue;
      }
      if (filter !== 'all' && String(p.market).toLowerCase() !== filter) continue;
      if (minLeanPct > 0) {
        const lean = Number(p.confidence_pct);
        if (!Number.isFinite(lean) || lean < minLeanPct) continue;
      }
      if (loggedFilter === 'logged' && !pickIsLogged(p)) continue;
      if (loggedFilter === 'unlogged' && pickIsLogged(p)) continue;
      if (!map[p.match_id]) map[p.match_id] = [];
      map[p.match_id].push(p);
    }
    return map;
  }, [filteredPicks, filter, minLeanPct, matches, clockTick, loggedFilter, pickIsLogged, dateFilter]);

  const visibleMatches = useMemo(() => {
    void clockTick;
    const q = searchQ.trim().toLowerCase();
    // Only tip-bearing fixtures — never show “No tip” empty cards.
    let list = matches.filter(
      (m) =>
        isMatchBettable(m) &&
        kickoffOnDate(m.kickoff_at, dateFilter) &&
        (picksByMatch[m.id] || []).length > 0
    );
    if (q) {
      list = list.filter((m) => {
        const hay = `${m.home_team} ${m.away_team} ${m.competition_code || ''}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return list.sort(
      (a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime()
    );
  }, [matches, picksByMatch, searchQ, clockTick, dateFilter]);

  const totalPages = visibleMatches.length
    ? Math.max(1, Math.ceil(visibleMatches.length / pageSize))
    : 0;
  const pagedMatches = useMemo(() => {
    const start = pageIndex * pageSize;
    return visibleMatches.slice(start, start + pageSize);
  }, [visibleMatches, pageIndex, pageSize]);

  useEffect(() => {
    setPageIndex(0);
  }, [searchQ, bookFilter, filter, pageSize, minLeanPct, loggedFilter, dateFilter]);

  useEffect(() => {
    if (totalPages > 0 && pageIndex > totalPages - 1) {
      setPageIndex(Math.max(0, totalPages - 1));
    }
  }, [totalPages, pageIndex]);

  const loadScans = useCallback(async (s: AppSettings, books: string[]) => {
    const bankroll = {
      bankroll_ngn: s.bankroll,
      unit_pct: s.unitPct,
    };
    // Always load DC + Winner so Today chips work regardless of Account → Safe tip style.
    // Same 24h window as bettable — evening kickoffs stay tippable after a morning sync.
    const oddsAge = { max_odds_age_minutes: 24 * 60 };
    const safeCalls = books.flatMap((bookmaker) => [
      scanSafeBuilder({
        bookmaker,
        pick_market: 'double_chance',
        ...bankroll,
        ...oddsAge,
      }).catch(() => ({ picks: [] as TipPick[] })),
      scanSafeBuilder({
        bookmaker,
        pick_market: '1x2',
        ...bankroll,
        ...oddsAge,
      }).catch(() => ({ picks: [] as TipPick[] })),
    ]);
    const goalCalls = books.map((bookmaker) =>
      scanGoalMarkets({
        bookmaker,
        markets: 'ou_0_5,ou_1_5,ou_2_5,btts,tt_2_5',
        ...bankroll,
        ...oddsAge,
      }).catch(() => ({ picks: [] as TipPick[] }))
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

  const cancelSync = useCallback(() => {
    syncAbortRef.current?.abort();
    syncAbortRef.current = null;
    setBusy(false);
    setStatus('Cancelled.');
  }, []);

  const refresh = useCallback(
    async (opts?: { withOdds?: boolean }) => {
      const withOdds = opts?.withOdds ?? false;
      syncAbortRef.current?.abort();
      const ctrl = new AbortController();
      syncAbortRef.current = ctrl;
      setBusy(true);
      let syncSlow = false;
      try {
        const s = settings || (await loadSettings());
        if (!settings) setSettings(s);
        if (withOdds) {
          setStatus('Updating matches & prices…');
          await syncFixtures({ signal: ctrl.signal }).catch((e) => {
            if (isRequestCancelled(e)) throw e;
            return null;
          });
          if (ctrl.signal.aborted) return;
          try {
            await syncOdds({ signal: ctrl.signal });
          } catch (e) {
            if (isRequestCancelled(e)) throw e;
            // Odds often land in the DB even when the HTTP response times out on
            // Render — still load Today so the phone/web UI updates without a full reload.
            syncSlow = true;
            setStatus('Sync is slow — loading what is saved…');
          }
        }
        if (ctrl.signal.aborted) return;
        const cfg = await fetchPublicAppConfig();
        const books = cfg.odds_bookmakers?.length
          ? cfg.odds_bookmakers
          : ['sportybet', 'onexbet'];
        const [health, bettable] = await Promise.all([
          pingHealth().catch(() => null),
          loadMatchList(books),
        ]);
        if (ctrl.signal.aborted) return;
        const { n, picks: all } = await loadScans(s, books);
        if (ctrl.signal.aborted) return;
        const merged = enrichMatchesFromPicks(bettable, all);
        setPageIndex(0);
        setMatches(merged);
        setMatchCache(merged, all);
        pruneSelection(new Set(merged.map((m) => m.id)));
        refetchLoggedTipsIfStale();
        const base = merged.length
          ? `${merged.length} match${merged.length === 1 ? '' : 'es'} · ${n} tip${n === 1 ? '' : 's'}${withOdds ? ' · updated' : ''}${health?.version ? ` · v${health.version}` : ''}`
          : withOdds
            ? 'Updated — no matches with tips yet. Try again closer to kickoff.'
            : 'No matches yet — tap Load matches to sync.';
        setStatus(syncSlow ? `${base} · sync still catching up` : base);
      } catch (e) {
        if (isRequestCancelled(e) || ctrl.signal.aborted) return;
        // Always try to paint whatever is already in the DB so Load matches
        // never requires a browser reload to show results.
        try {
          const s = settings || (await loadSettings());
          const cfg = await fetchPublicAppConfig().catch(() => null);
          const books = cfg?.odds_bookmakers?.length
            ? cfg.odds_bookmakers
            : ['sportybet', 'onexbet'];
          const bettable = await loadMatchList(books);
          const { n, picks: all } = await loadScans(s, books);
          const merged = enrichMatchesFromPicks(bettable, all);
          if (merged.length) {
            setPageIndex(0);
            setMatches(merged);
            setMatchCache(merged, all);
            pruneSelection(new Set(merged.map((m) => m.id)));
            setStatus(
              `${merged.length} match${merged.length === 1 ? '' : 'es'} · ${n} tip${n === 1 ? '' : 's'} · ${userFacingError(e)}`
            );
            return;
          }
        } catch {
          /* fall through to plain error */
        }
        setStatus(userFacingError(e));
      } finally {
        if (syncAbortRef.current === ctrl) syncAbortRef.current = null;
        setBusy(false);
      }
    },
    [loadScans, loadMatchList, settings, refetchLoggedTipsIfStale]
  );

  const onSyncOdds = useCallback(() => {
    if (!isAdmin) {
      void refresh({ withOdds: false });
      return;
    }
    void refresh({ withOdds: true });
  }, [refresh, isAdmin]);

  const onSoftRefresh = useCallback(() => {
    void refresh({ withOdds: false });
  }, [refresh]);

  const webPull = useWebPullRefresh({
    enabled: isWeb,
    refreshing: busy,
    onRefresh: isAdmin ? onSyncOdds : onSoftRefresh,
  });

  useLayoutEffect(() => {
    if (isWeb) return;
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          {isAdmin ? (
            <SyncHeaderButton
              onPress={onSyncOdds}
              onCancel={cancelSync}
              disabled={busy}
              busy={busy}
              label="Load matches"
            />
          ) : null}
          <ScreenInfoButton title={TOOL_INFO.home.title} message={TOOL_INFO.home.message} />
          <HelpHeaderButton />
        </View>
      ),
    });
  }, [navigation, onSyncOdds, cancelSync, busy, isAdmin]);

  useEffect(() => {
    void refresh({ withOdds: false });
  }, []);

  async function onLogSelected() {
    const raw = getSelectedTips();
    // Skip already-logged legs so the confirm modal never lists duplicates.
    const tips = dedupePicks(raw.filter((t) => !pickIsLogged(t)));
    if (!tips.length) {
      await modal.alert({
        title: 'Nothing new to log',
        message: raw.length
          ? 'Those picks were already logged (struck through). Pick something new.'
          : 'Tick tips you placed, then Log selected.',
      });
      return;
    }
    setBusy(true);
    try {
      const s = settings || (await loadSettings());
      // Same-match correlated markets can't be a normal multi on most books — force singles.
      const forceSingles = selectionHasSameMatchLegs();
      const data = await logTipBatch({
        tips,
        as_multi: forceSingles ? false : asMulti,
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
        message: userFacingError(e),
      });
    } finally {
      setBusy(false);
    }
  }

  const leanAwarePicks = useMemo(() => {
    let list = filteredPicks;
    if (minLeanPct > 0) {
      list = list.filter((p) => {
        const lean = Number(p.confidence_pct);
        return Number.isFinite(lean) && lean >= minLeanPct;
      });
    }
    if (loggedFilter === 'logged') {
      list = list.filter((p) => pickIsLogged(p));
    } else if (loggedFilter === 'unlogged') {
      list = list.filter((p) => !pickIsLogged(p));
    }
    return list;
  }, [filteredPicks, minLeanPct, loggedFilter, pickIsLogged]);

  const chipCounts = useMemo(() => {
    const counts: Partial<Record<MarketFilter, number>> = {
      all: leanAwarePicks.length,
    };
    for (const p of leanAwarePicks) {
      const m = String(p.market || '').toLowerCase() as MarketFilter;
      if (m === 'all') continue;
      counts[m] = (counts[m] || 0) + 1;
    }
    return counts;
  }, [leanAwarePicks]);

  const fixturesOnSelectedDate = useMemo(() => {
    // Tip-bearing only (same rule as the visible list).
    if (!dateFilter) {
      return matches.filter((m) => (picksByMatch[m.id] || []).length > 0).length;
    }
    return matches.filter(
      (m) =>
        isMatchBettable(m) &&
        kickoffOnDate(m.kickoff_at, dateFilter) &&
        (picksByMatch[m.id] || []).length > 0
    ).length;
  }, [matches, dateFilter, clockTick, picksByMatch]);

  const filterEmpty = emptyStateForFilter(filter, {
    minLeanPct,
    searchQ,
    totalTips: picks.length,
    loggedFilter,
    dateFilter,
    fixturesOnSelectedDate,
  });

  const showNoTipsBanner = !busy && matches.length > 0 && picks.length === 0 && !dateFilter;
  const showFilterEmpty = !busy && !visibleMatches.length && !showNoTipsBanner;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          isWeb && { paddingBottom: webScrollBottom(20) },
          selectedN > 0 && { paddingBottom: webScrollBottom(88) },
        ]}
        showsVerticalScrollIndicator={false}
        {...webPull.scrollProps}
        refreshControl={
          isWeb ? undefined : (
            <RefreshControl
              refreshing={busy}
              onRefresh={isAdmin ? onSyncOdds : onSoftRefresh}
              tintColor={colors.accent}
            />
          )
        }
      >
        <WebPullHint pullPx={webPull.pullPx} refreshing={busy} />
        <View style={[styles.topbar, isWeb && styles.topbarWeb]}>
          <View style={styles.hero}>
            <BrandLogo
              size={narrowWeb ? 'sm' : 'md'}
              showWordmark
              hideTagline
              style={styles.heroBrand}
            />
            {isWeb ? (
              <View style={styles.headerActions}>
                {isAdmin ? (
                  <SyncHeaderButton
                    onPress={onSyncOdds}
                    onCancel={cancelSync}
                    disabled={busy}
                    busy={busy}
                    showLabel
                    label="Load matches"
                  />
                ) : null}
                <ScreenInfoButton title={TOOL_INFO.home.title} message={TOOL_INFO.home.message} />
                <HelpHeaderButton />
              </View>
            ) : null}
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLine} numberOfLines={2}>
              {status}
            </Text>
            <FreeHomeExtras />
          </View>
        </View>

        <HorizontalChipScroll>
          {CHIP_LABELS.map((c) => {
            const n = chipCounts[c.id] ?? 0;
            const label = c.id === 'all' ? `${c.label} · ${n}` : `${c.label} · ${n}`;
            return (
              <Pressable
                key={c.id}
                style={[styles.chip, filter === c.id && styles.chipOn]}
                onPress={() => setFilter(c.id)}
              >
                <Text style={[styles.chipText, filter === c.id && styles.chipTextOn]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </HorizontalChipScroll>

        <View style={styles.filterTools}>
          <TextInput
            style={styles.searchInput}
            value={searchQ}
            onChangeText={setSearchQ}
            placeholder="Search teams"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <DatePickerField
            value={dateFilter}
            onChange={setDateFilter}
            placeholder="Date"
            style={styles.dateField}
          />
          <BookLeanFilters
            books={availableBooks}
            bookValue={bookFilter}
            onBookChange={setBookFilter}
            leanValue={minLeanPct}
            onLeanChange={setMinLeanPct}
            loggedValue={loggedFilter}
            onLoggedChange={setLoggedFilter}
          />
        </View>

        {busy && !matches.length ? (
          <LoadingRadar size="large" color={colors.accent} style={{ marginTop: 24 }} />
        ) : null}

        {showNoTipsBanner ? (
          <View style={styles.staleBanner}>
            <Text style={styles.emptyTitle}>No Safe tips yet</Text>
            <Text style={styles.staleText}>
              Pull down or tap ↻ to refresh prices. Tips appear when a clear favourite shows up.
            </Text>
          </View>
        ) : null}

        {showFilterEmpty ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{filterEmpty.title}</Text>
            <Text style={styles.staleText}>{filterEmpty.body}</Text>
          </View>
        ) : null}

        <View style={[styles.matchGrid, twoColWeb && styles.matchGridWeb]}>
          {pagedMatches.map((m) => {
            const tips = picksByMatch[m.id] || [];
            const hasTip = tips.length > 0;
            return (
              <View
                key={m.id}
                style={[
                  styles.card,
                  !twoColWeb && styles.cardCompact,
                  twoColWeb && styles.cardWeb,
                  denseLaptop && styles.cardDenseLaptop,
                  hasTip && styles.cardHasTip,
                ]}
              >
                <Pressable onPress={() => router.push(`/match/${m.id}`)}>
                  <View
                    style={[
                      styles.cardTop,
                      (!twoColWeb || denseLaptop) && styles.cardTopCompact,
                    ]}
                  >
                    <Text
                      style={[styles.league, denseLaptop && styles.leagueDense]}
                      numberOfLines={1}
                    >
                      {m.competition_code || '—'}
                    </Text>
                    <Text
                      style={[styles.kickoff, denseLaptop && styles.kickoffDense]}
                      numberOfLines={1}
                    >
                      {kickoffLabel(m.kickoff_at)}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.match,
                      !twoColWeb && styles.matchCompact,
                      denseLaptop && styles.matchDense,
                    ]}
                    numberOfLines={1}
                  >
                    {formatMatchTitle(
                      m.home_team,
                      m.away_team,
                      denseLaptop ? 12 : twoColWeb ? 14 : 18
                    )}
                  </Text>
                </Pressable>
                {!denseLaptop ? (
                  <OpenBookmakerButton
                    home={m.home_team}
                    away={m.away_team}
                    bookmaker={
                      bookFilter !== 'all'
                        ? bookFilter
                        : tips.find((t) => t.bookmaker)?.bookmaker || 'sportybet'
                    }
                    compact
                    style={!twoColWeb ? { marginBottom: 4 } : undefined}
                  />
                ) : null}
                {!tips.length ? null : (
                  tips.map((p) => {
                    const on = isTipSelected(p);
                    const logged = pickIsLogged(p);
                    void loggedRev;
                    return (
                      <Pressable
                        key={tipKey(p)}
                        style={[
                          styles.tipRow,
                          (!twoColWeb || denseLaptop) && styles.tipRowCompact,
                          on && styles.tipRowOn,
                          logged && styles.tipRowLogged,
                          busy && styles.tipRowBusy,
                        ]}
                        onPress={(e) => {
                          e?.stopPropagation?.();
                          if (!logged && !busy) toggleTip(p);
                        }}
                        disabled={logged || busy}
                      >
                        <View
                          style={[
                            styles.check,
                            (!twoColWeb || denseLaptop) && styles.checkCompact,
                            on && styles.checkOn,
                            logged && styles.checkLogged,
                          ]}
                        >
                          {logged || on ? <Text style={styles.checkMark}>✓</Text> : null}
                        </View>
                        <View style={styles.tipBody}>
                          <Text
                            style={[
                              styles.tipTitle,
                              (!twoColWeb || denseLaptop) && styles.tipTitleCompact,
                              denseLaptop && styles.tipTitleDense,
                              loggedPickStyle(logged),
                            ]}
                            numberOfLines={1}
                          >
                            {marketLabel(p.market)} · {String(p.selection).toUpperCase()}
                            {p.odds != null ? ` @ ${p.odds}` : ''}
                            {!twoColWeb || denseLaptop
                              ? ` · ${bookLabel(p.bookmaker)}`
                              : ''}
                          </Text>
                          {twoColWeb && !denseLaptop ? (
                            <Text style={styles.tipMeta} numberOfLines={1}>
                              {bookLabel(p.bookmaker)}
                            </Text>
                          ) : null}
                          {p.singles_only_hint && !denseLaptop ? (
                            <Text style={styles.tipWarn} numberOfLines={1}>
                              {p.singles_only_hint}
                            </Text>
                          ) : null}
                        </View>
                        <LeanBar pct={p.confidence_pct} compact />
                      </Pressable>
                    );
                  })
                )}
              </View>
            );
          })}
        </View>

        {visibleMatches.length > 0 ? (
          <PaginationBar
            page={pageIndex + 1}
            totalPages={totalPages}
            pageSize={pageSize}
            disabled={busy}
            onPageChange={(p) => setPageIndex(p - 1)}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPageIndex(0);
            }}
          />
        ) : null}
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
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    position: 'relative',
    overflow: 'hidden',
  },
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28 },
  topbar: { marginBottom: 4 },
  topbarWeb: {
    paddingBottom: 10,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    width: '100%',
  },
  heroBrand: {
    flex: 1,
    minWidth: 0,
    marginRight: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  statusLine: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    flexShrink: 1,
    flexGrow: 1,
    minWidth: 140,
  },
  filterTools: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 6,
    marginTop: 8,
    marginBottom: 4,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    minWidth: 80,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.ink,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  dateField: { flexShrink: 0 },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: colors.onAccent, fontWeight: '700', fontSize: 13, textAlign: 'center' },
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
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    marginRight: 8,
  },
  chipOn: { backgroundColor: colors.accentDim, borderColor: 'rgba(15, 138, 95, 0.35)' },
  chipText: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  chipTextOn: { color: colors.accent },
  matchGrid: { marginTop: 8 },
  matchGridWeb: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'space-between',
  },
  card: {
    marginTop: 10,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    boxShadow: '0 2px 10px rgba(18, 32, 24, 0.06)',
  },
  cardCompact: {
    marginTop: 8,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  cardWeb: {
    width: '48%',
    flexGrow: 1,
    flexBasis: '48%',
    marginTop: 0,
    minWidth: 0,
  },
  /** Laptop web denser packing — smaller padding/type so more cards fit. */
  cardDenseLaptop: {
    marginTop: 0,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    boxShadow: '0 1px 4px rgba(18, 32, 24, 0.05)',
  },
  leagueDense: { fontSize: 9 },
  kickoffDense: { fontSize: 9 },
  matchDense: { fontSize: 12, lineHeight: 15 },
  noTipDense: { fontSize: 10, marginTop: 4, paddingTop: 4 },
  tipTitleDense: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
  cardHasTip: {
    borderColor: 'rgba(15, 138, 95, 0.4)',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 8,
  },
  cardTopCompact: {
    marginBottom: 4,
  },
  league: { color: colors.muted, fontSize: 11, fontWeight: '600', flex: 1, minWidth: 0 },
  kickoff: { color: colors.muted, fontSize: 10, textAlign: 'right', flexShrink: 0 },
  match: { color: colors.ink, fontSize: 14, fontWeight: '700', lineHeight: 19 },
  matchCompact: { fontSize: 13, lineHeight: 17 },
  noTip: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  staleBanner: {
    marginTop: 10,
    marginBottom: 4,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
    backgroundColor: colors.surface,
  },
  staleText: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  tipRowCompact: {
    gap: 8,
    marginTop: 6,
    paddingTop: 6,
  },
  tipRowOn: { backgroundColor: colors.accentDim, borderRadius: 10, paddingHorizontal: 8, paddingBottom: 8 },
  tipRowLogged: { opacity: 0.72 },
  tipRowBusy: { opacity: 0.45 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  checkCompact: {
    width: 20,
    height: 20,
    marginTop: 0,
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkLogged: { backgroundColor: colors.muted, borderColor: colors.muted },
  checkMark: { color: colors.onAccent, fontWeight: '800', fontSize: 12 },
  tipBody: { flex: 1, minWidth: 0 },
  tipTitle: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  tipTitleCompact: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  tipTitleLogged: {
    textDecorationLine: 'line-through',
    textDecorationColor: colors.muted,
    color: colors.muted,
  },
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
