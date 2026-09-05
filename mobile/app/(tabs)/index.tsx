import { useRouter, useNavigation } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

import { pingHealth, userFacingError } from '../../src/api/client';
import { fetchBettableMatches, syncFixtures } from '../../src/api/matches';
import { fetchPublicAppConfig } from '../../src/api/appConfig';
import { syncOdds } from '../../src/api/odds';
import { scanGoalMarkets } from '../../src/api/predictions';
import { scanSafeBuilder } from '../../src/api/safe';
import { logTipBatch } from '../../src/api/tips';
import { invalidateTipsCache } from '../../src/query/invalidate';
import { BrandLogo } from '../../src/components/BrandLogo';
import { BookLeanFilters } from '../../src/components/BookLeanFilters';
import { HelpHeaderButton } from '../../src/components/HelpHeaderButton';
import { LeanBar } from '../../src/components/LeanBar';
import { PaginationBar } from '../../src/components/PaginationBar';
import { SyncHeaderButton } from '../../src/components/SyncHeaderButton';
import { BetSlipFab } from '../../src/components/BetSlipFab';
import { useWebPullRefresh, WebPullHint } from '../../src/components/useWebPullRefresh';
import { useAppModal } from '../../src/components/modal';
import { usePendingLoggedTips } from '../../src/hooks/usePendingLoggedTips';
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

function emptyStateForFilter(
  filter: MarketFilter,
  opts: { minLeanPct: number; searchQ: string; totalTips: number }
): { title: string; body: string } {
  const leanHint =
    opts.minLeanPct > 0
      ? ` Lower Lean % (now ≥${opts.minLeanPct}) or tap Clear in Filters.`
      : ' Try Load matches.';
  const searchHint = opts.searchQ.trim()
    ? ' Clear search if you narrowed the list.'
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
      body: `Tips exist, but search/book/lean hid them.${searchHint}${leanHint}`,
    },
    double_chance: {
      title: 'No Double chance tips',
      body: `No 1X/X2 Safe tips for this view.${leanHint}${searchHint}`,
    },
    '1x2': {
      title: 'No Winner tips',
      body: `No 1X2 favourite tips right now — needs a clear favourite.${leanHint}${searchHint}`,
    },
    ou_0_5: {
      title: 'No O/U 0.5 leans',
      body: `No Over 0.5 tips in this view — try Load matches / lower Lean %.${searchHint}`,
    },
    ou_1_5: {
      title: 'No O/U 1.5 leans',
      body: `No Over 1.5 tips in this view — try Load matches / lower Lean %.${searchHint}`,
    },
    ou_2_5: {
      title: 'No O/U 2.5 leans',
      body: `No O/U 2.5 tips in this view — try Load matches / lower Lean %.${searchHint}`,
    },
    btts: {
      title: 'No BTTS leans',
      body: `No BTTS Yes/No tips in this view — try Load matches / lower Lean %.${searchHint}`,
    },
    tt_2_5: {
      title: 'No Team 3+ tips',
      body:
        'Team scores 3+ is rare (needs Team Totals from the feed + strong Over lean). Tap Load matches; if sync says Team3+ 0, this book/league may not offer that market.',
    },
  };
  return map[filter];
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
  const [searchQ, setSearchQ] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [minLeanPct, setMinLeanPct] = useState(0);
  const [status, setStatus] = useState('Pull down to refresh odds & Safe picks');
  const [busy, setBusy] = useState(false);
  const [selectedN, setSelectedN] = useState(0);
  const [asMulti, setAsMulti] = useState(true);
  const [loggedRev, setLoggedRev] = useState(0);
  /** Re-evaluate kickoff filters every minute without a full refresh. */
  const [clockTick, setClockTick] = useState(0);
  const { isPickLogged: isPickLoggedFromServer, refetchIfStale: refetchLoggedTipsIfStale } =
    usePendingLoggedTips(true);
  const { width: windowWidth } = useWindowDimensions();
  const narrowWeb = isWeb && windowWidth < 560;
  /** Two-column match grid only when cards stay wide enough to read tip text. */
  const twoColWeb = isWeb && windowWidth >= 640;

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
    if (bookFilter === 'all') return picks;
    return picks.filter((p) => String(p.bookmaker).toLowerCase() === bookFilter);
  }, [picks, bookFilter]);

  const picksByMatch = useMemo(() => {
    void clockTick;
    const matchById = new Map(matches.map((m) => [m.id, m]));
    const map: Record<number, TipPick[]> = {};
    for (const p of filteredPicks) {
      const m = matchById.get(p.match_id);
      if (m) {
        if (!isMatchBettable(m)) continue;
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
      if (!map[p.match_id]) map[p.match_id] = [];
      map[p.match_id].push(p);
    }
    return map;
  }, [filteredPicks, filter, minLeanPct, matches, clockTick]);

  const visibleMatches = useMemo(() => {
    void clockTick;
    const q = searchQ.trim().toLowerCase();
    let withTips = matches.filter(
      (m) => isMatchBettable(m) && (picksByMatch[m.id] || []).length > 0
    );
    if (q) {
      withTips = withTips.filter((m) => {
        const hay = `${m.home_team} ${m.away_team} ${m.competition_code || ''}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return withTips;
  }, [matches, picksByMatch, searchQ, clockTick]);

  const totalPages = visibleMatches.length
    ? Math.max(1, Math.ceil(visibleMatches.length / pageSize))
    : 0;
  const pagedMatches = useMemo(() => {
    const start = pageIndex * pageSize;
    return visibleMatches.slice(start, start + pageSize);
  }, [visibleMatches, pageIndex, pageSize]);

  useEffect(() => {
    setPageIndex(0);
  }, [searchQ, bookFilter, filter, pageSize, minLeanPct]);

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
    // Always load DC + Winner so Today chips work regardless of Me → Safe tip style.
    const safeCalls = books.flatMap((bookmaker) => [
      scanSafeBuilder({ bookmaker, pick_market: 'double_chance', ...bankroll }).catch(
        () => ({ picks: [] as TipPick[] })
      ),
      scanSafeBuilder({ bookmaker, pick_market: '1x2', ...bankroll }).catch(
        () => ({ picks: [] as TipPick[] })
      ),
    ]);
    const goalCalls = books.map((bookmaker) =>
      scanGoalMarkets({
        bookmaker,
        markets: 'ou_0_5,ou_1_5,ou_2_5,btts,tt_2_5',
        ...bankroll,
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

  const refresh = useCallback(
    async (opts?: { withOdds?: boolean }) => {
      const withOdds = opts?.withOdds ?? false;
      setBusy(true);
      try {
        const s = settings || (await loadSettings());
        if (!settings) setSettings(s);
        if (withOdds) {
          setStatus('Updating matches & prices…');
          await syncFixtures().catch(() => null);
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
        refetchLoggedTipsIfStale();
        setStatus(
          merged.length
            ? `${merged.length} match${merged.length === 1 ? '' : 'es'} · ${n} tip${n === 1 ? '' : 's'}${withOdds ? ' · updated' : ''}${health?.version ? ` · v${health.version}` : ''}`
            : withOdds
              ? 'Updated — no matches with tips yet. Try again closer to kickoff.'
              : 'No matches yet — tap Load matches to sync.'
        );
      } catch (e) {
        setStatus(userFacingError(e));
      } finally {
        setBusy(false);
      }
    },
    [loadScans, loadMatchList, settings, refetchLoggedTipsIfStale]
  );

  const onSyncOdds = useCallback(() => {
    void refresh({ withOdds: true });
  }, [refresh]);

  const webPull = useWebPullRefresh({
    enabled: isWeb,
    refreshing: busy,
    onRefresh: onSyncOdds,
  });

  useLayoutEffect(() => {
    if (isWeb) return;
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <SyncHeaderButton onPress={onSyncOdds} disabled={busy} busy={busy} label="Load matches" />
          <HelpHeaderButton />
        </View>
      ),
    });
  }, [navigation, onSyncOdds, busy]);

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
    if (minLeanPct <= 0) return filteredPicks;
    return filteredPicks.filter((p) => {
      const lean = Number(p.confidence_pct);
      return Number.isFinite(lean) && lean >= minLeanPct;
    });
  }, [filteredPicks, minLeanPct]);

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

  const filterEmpty = emptyStateForFilter(filter, {
    minLeanPct,
    searchQ,
    totalTips: picks.length,
  });

  const showNoTipsBanner = !busy && matches.length > 0 && picks.length === 0;
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
        {...webPull.scrollProps}
        refreshControl={
          isWeb ? undefined : (
            <RefreshControl
              refreshing={busy}
              onRefresh={onSyncOdds}
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
              tagline={status}
              hideTagline={isWeb}
              style={styles.heroBrand}
            />
            {isWeb ? (
              <View style={styles.headerActions}>
                <SyncHeaderButton
                  onPress={onSyncOdds}
                  disabled={busy}
                  busy={busy}
                  showLabel
                  label="Load matches"
                />
                <HelpHeaderButton />
              </View>
            ) : null}
          </View>
          {isWeb ? (
            <Text style={styles.statusLine} numberOfLines={2}>
              {status}
            </Text>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
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
        </ScrollView>

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
          <BookLeanFilters
            books={availableBooks}
            bookValue={bookFilter}
            onBookChange={setBookFilter}
            leanValue={minLeanPct}
            onLeanChange={setMinLeanPct}
          />
        </View>

        {isWeb && !narrowWeb ? (
          <Text style={styles.hint}>
            Tap Load matches (or pull down) for fresh odds · tap a pick for your slip.
          </Text>
        ) : !isWeb ? (
          <Text style={styles.hint}>
            Pull down or tap Load matches for fresh odds · tap a pick for your slip.
          </Text>
        ) : null}

        {busy && !matches.length ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
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
                  hasTip && styles.cardHasTip,
                ]}
              >
                <Pressable onPress={() => router.push(`/match/${m.id}`)}>
                  <View style={[styles.cardTop, !twoColWeb && styles.cardTopCompact]}>
                    <Text style={styles.league} numberOfLines={1}>
                      {m.competition_code || '—'}
                    </Text>
                    <Text style={styles.kickoff} numberOfLines={1}>
                      {kickoffLabel(m.kickoff_at)}
                    </Text>
                  </View>
                  <Text
                    style={[styles.match, !twoColWeb && styles.matchCompact]}
                    numberOfLines={1}
                  >
                    {formatMatchTitle(m.home_team, m.away_team, twoColWeb ? 14 : 18)}
                  </Text>
                </Pressable>
                {!tips.length ? (
                  <Pressable onPress={() => router.push(`/match/${m.id}`)}>
                    <Text style={styles.noTip}>No tip — open for odds</Text>
                  </Pressable>
                ) : (
                  tips.map((p) => {
                    const on = isTipSelected(p);
                    const logged = pickIsLogged(p);
                    void loggedRev;
                    return (
                      <Pressable
                        key={tipKey(p)}
                        style={[
                          styles.tipRow,
                          !twoColWeb && styles.tipRowCompact,
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
                            !twoColWeb && styles.checkCompact,
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
                              !twoColWeb && styles.tipTitleCompact,
                              loggedPickStyle(logged),
                            ]}
                            numberOfLines={1}
                          >
                            {marketLabel(p.market)} · {String(p.selection).toUpperCase()}
                            {p.odds != null ? ` @ ${p.odds}` : ''}
                            {!twoColWeb ? ` · ${bookLabel(p.bookmaker)}` : ''}
                          </Text>
                          {twoColWeb ? (
                            <Text style={styles.tipMeta} numberOfLines={1}>
                              {bookLabel(p.bookmaker)}
                            </Text>
                          ) : null}
                          {p.singles_only_hint ? (
                            <Text style={styles.tipWarn} numberOfLines={1}>
                              {p.singles_only_hint}
                            </Text>
                          ) : null}
                        </View>
                        <LeanBar pct={p.confidence_pct} compact={!twoColWeb} />
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
    borderBottomColor: 'rgba(42, 53, 64, 0.7)',
    backgroundColor: 'rgba(11, 16, 20, 0.88)',
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
  statusLine: {
    color: colors.muted,
    marginTop: 8,
    fontSize: 12,
    lineHeight: 17,
  },
  hint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
    marginBottom: 4,
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
    minWidth: 120,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.ink,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
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
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(42, 53, 64, 0.85)',
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
  checkMark: { color: '#06241c', fontWeight: '800', fontSize: 12 },
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
