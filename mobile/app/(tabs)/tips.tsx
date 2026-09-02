import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  autoSettleTips,
  deleteTip,
  fetchTipStats,
  fetchTipsPage,
  settleTip,
  TIPS_PAGE_SIZE,
  type TipOut,
} from '../../src/api/tips';
import { isAuthError } from '../../src/api/client';
import { PaginationBar } from '../../src/components/PaginationBar';
import { SignInRequiredBanner } from '../../src/components/SignInRequiredBanner';
import { SwipeableRow } from '../../src/components/SwipeableRow';
import { useAppModal } from '../../src/components/modal';
import { useDebouncedValue } from '../../src/hooks/useDebouncedValue';
import { useNeedsSignIn } from '../../src/hooks/useTipsFeed';
import { invalidateTipsCache } from '../../src/query/invalidate';
import { markScoreRefreshRan, shouldRunScoreRefresh } from '../../src/store/autoSettle';
import { queryKeys } from '../../src/query/client';
import { bookLabel, marketLabel } from '../../src/lib/tipKey';
import { formatMatchTitle } from '../../src/lib/matchDisplay';
import { formatConfidencePct, youthMatchHint } from '../../src/lib/marketLean';
import { subscribeTipsList } from '../../src/store/tipsEvents';
import { colors } from '../../src/theme/colors';
import { webScrollBottom } from '../../src/theme/webScroll';

type TipsTab = 'active' | 'history';
type MarketFilter = 'all' | 'double_chance' | '1x2' | 'ou_2_5' | 'btts';

const SETTLE_OPTS: { value: string; label: string }[] = [
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'void', label: 'Void' },
  { value: 'pending', label: 'Pend' },
];

const MARKET_CHIPS: { id: MarketFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'double_chance', label: 'DC' },
  { id: '1x2', label: '1X2' },
  { id: 'ou_2_5', label: 'O/U' },
  { id: 'btts', label: 'BTTS' },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

function matchStatusNote(status: string): string | null {
  const s = (status || '').toUpperCase();
  if (s === 'POSTPONED') return 'Postponed';
  if (s === 'CANCELLED' || s === 'ABANDONED') return 'Cancelled';
  if (s === 'SUSPENDED') return 'Suspended';
  if (s === 'IN_PLAY') return 'Live';
  return null;
}

function matchWhen(t: TipOut, compact = false): string {
  const status = (t.match_status || '').toUpperCase();
  const statusNote = matchStatusNote(status);
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
  if (statusNote && !finished) {
    return compact ? `${statusNote} · ${when}` : `${statusNote} — kickoff ${when}`;
  }
  if (finished && hasScore) {
    const ft = `FT ${t.home_score}-${t.away_score}`;
    return compact ? `${when} · ${ft}` : `${when} · ${ft}`;
  }
  if (!finished && t.kickoff_at) return compact ? when : `Kickoff ${when}`;
  return when;
}

function loggedWhen(t: TipOut): string {
  return formatLoggedAt(t.created_at);
}

function formatLoggedAt(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function slipLegSummary(legs: TipOut[]): string {
  let won = 0;
  let lost = 0;
  let pending = 0;
  let voided = 0;
  for (const leg of legs) {
    const r = (leg.result || 'pending').toLowerCase();
    if (r === 'won') won += 1;
    else if (r === 'lost') lost += 1;
    else if (r === 'void') voided += 1;
    else pending += 1;
  }
  const parts: string[] = [];
  if (won) parts.push(`${won}W`);
  if (lost) parts.push(`${lost}L`);
  if (pending) parts.push(`${pending}P`);
  if (voided) parts.push(`${voided}V`);
  return parts.join(' · ');
}

function LegResultBadge({ result, compact }: { result: string; compact?: boolean }) {
  const r = (result || 'pending').toLowerCase();
  const color = resultColor(r);
  return (
    <View style={[styles.legResultPill, compact && styles.legResultPillCompact, { borderColor: color }]}>
      <Text style={[styles.legResult, compact && styles.legResultCompact, { color }]}>
        {r.toUpperCase()}
      </Text>
    </View>
  );
}

/** Same two-line layout as Today match cards. */
function PickLines({ t }: { t: TipOut }) {
  const odds = t.odds_price != null ? String(t.odds_price) : null;
  const conf = formatConfidencePct(t.market, t.confidence_pct);
  const youthHint = youthMatchHint(t.home_team, t.away_team);
  return (
    <>
      <Text style={styles.pickTitle} numberOfLines={2}>
        {marketLabel(t.market)} · {String(t.selection).toUpperCase()}
        {odds ? ` @ ${odds}` : ''}
      </Text>
      <Text style={styles.pickMeta} numberOfLines={1}>
        {bookLabel(t.bookmaker || '')}
        {conf ? ` · ${conf}` : ''}
      </Text>
      {youthHint ? (
        <Text style={styles.youthHint} numberOfLines={2}>
          {youthHint}
        </Text>
      ) : null}
    </>
  );
}

export default function TipsScreen() {
  const insets = useSafeAreaInsets();
  const modal = useAppModal();
  const needsSignIn = useNeedsSignIn();
  const [tab, setTab] = useState<TipsTab>('active');
  const [tips, setTips] = useState<TipOut[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(TIPS_PAGE_SIZE);
  const [listBusy, setListBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [settlingId, setSettlingId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [searchQ, setSearchQ] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('all');
  const [bookFilter, setBookFilter] = useState<string>('all');

  const debouncedQ = useDebouncedValue(searchQ, 450);
  const debouncedDate = useDebouncedValue(
    DATE_RE.test(dateFilter.trim()) ? dateFilter.trim() : '',
    300
  );

  const listKey = `${tab}|${marketFilter}|${debouncedQ}|${debouncedDate}|${pageSize}`;
  const prevListKey = useRef(listKey);

  const fetchParams = useCallback(
    (page: number) => ({
      limit: pageSize,
      offset: page * pageSize,
      result: tab === 'active' ? 'pending' : undefined,
      market: marketFilter === 'all' ? undefined : marketFilter,
      q: debouncedQ || undefined,
      date_from: debouncedDate || undefined,
      date_to: debouncedDate || undefined,
    }),
    [pageSize, tab, marketFilter, debouncedQ, debouncedDate]
  );

  const statsQuery = useQuery({
    queryKey: queryKeys.tipStats,
    queryFn: () => fetchTipStats(),
    staleTime: 120_000,
    enabled: !needsSignIn,
  });
  const stats = statsQuery.data ?? null;

  const loadPage = useCallback(
    async (page: number) => {
      if (needsSignIn) return;
      setListBusy(true);
      try {
        const data = await fetchTipsPage(fetchParams(page));
        setTips(data.items ?? []);
        setTotalCount(data.total ?? 0);
        const pages = Math.max(1, Math.ceil((data.total ?? 0) / pageSize) || 1);
        setStatus(
          `${tab === 'active' ? 'Active' : 'History'} · ${data.total ?? 0} total · page ${page + 1} of ${pages}`
        );
      } catch (e) {
        if (!isAuthError(e)) {
          setStatus(e instanceof Error ? e.message : String(e));
        }
      } finally {
        setListBusy(false);
      }
    },
    [needsSignIn, fetchParams, tab, pageSize]
  );

  useEffect(() => {
    if (needsSignIn) return;
    let page = pageIndex;
    if (prevListKey.current !== listKey) {
      prevListKey.current = listKey;
      page = 0;
      if (pageIndex !== 0) {
        setPageIndex(0);
        return;
      }
    }
    void loadPage(page);
  }, [listKey, pageIndex, needsSignIn, loadPage]);

  const totalPages = totalCount > 0 ? Math.max(1, Math.ceil(totalCount / pageSize)) : 0;
  const currentPage = pageIndex + 1;

  useFocusEffect(
    useCallback(() => {
      if (!needsSignIn) {
        void statsQuery.refetch();
      }
      if (needsSignIn || tab !== 'active') return;

      let cancelled = false;
      (async () => {
        try {
          let data = await autoSettleTips({ refreshScores: false });
          if (cancelled) return;
          if (await shouldRunScoreRefresh()) {
            data = await autoSettleTips({ refreshScores: true });
            await markScoreRefreshRan();
          }
          const changed = (data.settled_count ?? 0) + (data.voided_count ?? 0);
          if (changed > 0) {
            await invalidateTipsCache();
            await statsQuery.refetch();
            await loadPage(pageIndex);
            if (data.message) setStatus(data.message);
          }
        } catch {
          /* background settle — manual button still available */
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [needsSignIn, tab, statsQuery, loadPage, pageIndex])
  );

  useEffect(() => {
    if (needsSignIn) return;
    return subscribeTipsList(() => {
      void loadPage(pageIndex);
    });
  }, [needsSignIn, loadPage, pageIndex]);

  const availableBooks = useMemo(() => {
    const set = new Set<string>();
    for (const t of tips) {
      if (t.bookmaker) set.add(String(t.bookmaker).toLowerCase());
    }
    return [...set].sort();
  }, [tips]);

  const displayTips = useMemo(() => {
    if (bookFilter === 'all') return tips;
    return tips.filter((t) => String(t.bookmaker).toLowerCase() === bookFilter);
  }, [tips, bookFilter]);

  const busy = listBusy;

  const { singles, multis } = useMemo(() => {
    const singles: TipOut[] = [];
    const multis: Record<string, TipOut[]> = {};
    for (const t of displayTips) {
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
  }, [displayTips]);

  async function reloadAll() {
    await invalidateTipsCache();
    await statsQuery.refetch();
    await loadPage(pageIndex);
  }

  async function onSettle(tipId: number, result: string, applyToSlip = false) {
    setSettlingId(tipId);
    try {
      await settleTip(tipId, result, { apply_to_slip: applyToSlip });
      await reloadAll();
    } catch (e) {
      await modal.alert({
        title: 'Settle failed',
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSettlingId(null);
    }
  }

  async function onDelete(tipId: number, label: string) {
    const ok = await modal.confirm({
      title: 'Remove tip',
      message: `Delete ${label}?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteTip(tipId);
      await reloadAll();
    } catch (e) {
      await modal.alert({
        title: 'Delete failed',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function onAutoSettle() {
    setStatus('Settling finished tips…');
    try {
      const data = await autoSettleTips({ refreshScores: true });
      await markScoreRefreshRan();
      setStatus(data.message);
      await reloadAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(msg);
      await modal.alert({ title: 'Could not settle tips', message: msg });
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

  const showEmpty = !busy && !tips.length && !needsSignIn && totalCount === 0;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom:
              Platform.OS === 'web'
                ? webScrollBottom(20)
                : 28 + Math.max(insets.bottom, 8) + 56,
          },
        ]}
        refreshControl={
          <RefreshControl refreshing={busy} onRefresh={() => reloadAll()} tintColor={colors.accent} />
        }
      >
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tabBtn, tab === 'active' && styles.tabBtnOn]}
            onPress={() => setTab('active')}
          >
            <Text style={[styles.tabText, tab === 'active' && styles.tabTextOn]}>Active</Text>
          </Pressable>
          <Pressable
            style={[styles.tabBtn, tab === 'history' && styles.tabBtnOn]}
            onPress={() => setTab('history')}
          >
            <Text style={[styles.tabText, tab === 'history' && styles.tabTextOn]}>History</Text>
          </Pressable>
        </View>

        <Text style={styles.muted}>
          Swipe a card left to delete. Use pagination below — default 10 per page (one API call per page).
        </Text>
        {status ? <Text style={styles.status}>{status}</Text> : null}

        {needsSignIn ? <SignInRequiredBanner /> : null}

        {!needsSignIn && stats ? (
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
        {!needsSignIn && stats && (stats.won ?? 0) + (stats.lost ?? 0) >= 5 ? (
          <Text style={styles.leanNote}>
            BTTS/O/U “lean %” is not win probability — it reflects which side is shorter
            in the odds. Safer track: Safe DC picks on Today; avoid U21/U23 accas.
          </Text>
        ) : null}

        {!needsSignIn ? (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filters}
              contentContainerStyle={styles.filterRow}
              keyboardShouldPersistTaps="handled"
            >
              <TextInput
                style={styles.searchInput}
                value={searchQ}
                onChangeText={setSearchQ}
                placeholder="Search…"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                style={styles.dateInput}
                value={dateFilter}
                onChangeText={setDateFilter}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
              />
              {MARKET_CHIPS.map((c) => (
                <Pressable
                  key={c.id}
                  style={[styles.chip, marketFilter === c.id && styles.chipOn]}
                  onPress={() => setMarketFilter(c.id)}
                >
                  <Text style={[styles.chipText, marketFilter === c.id && styles.chipTextOn]}>
                    {c.label}
                  </Text>
                </Pressable>
              ))}
              {availableBooks.map((b) => (
                <Pressable
                  key={b}
                  style={[styles.chip, bookFilter === b && styles.chipOn]}
                  onPress={() => setBookFilter(bookFilter === b ? 'all' : b)}
                >
                  <Text style={[styles.chipText, bookFilter === b && styles.chipTextOn]}>
                    {bookLabel(b)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Pressable
              style={[styles.btn, busy && styles.disabled]}
              onPress={onAutoSettle}
              disabled={busy}
            >
              <Text style={styles.btnText}>Settle finished tips</Text>
            </Pressable>

            {busy && !tips.length ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
            ) : null}

            {showEmpty ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No tips match</Text>
                <Text style={styles.muted}>Log from Today or change filters.</Text>
              </View>
            ) : null}

            {totalCount > 0 ? (
              <PaginationBar
                page={currentPage}
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

            {Object.entries(multis).map(([slipId, legs]) => {
              const book = bookLabel(legs[0].bookmaker || '');
              const combined = combinedOdds(legs);
              const overall = slipOverall(legs);
              const stake = stakeOf(legs);
              const open = !!expanded[slipId];
              const legSummary = slipLegSummary(legs);
              const loggedAt = legs
                .map((l) => l.created_at)
                .filter(Boolean)
                .sort()[0];

              return (
                <View key={slipId} style={{ marginTop: 12 }}>
                  <View style={styles.cardInner}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setExpanded((e) => ({ ...e, [slipId]: !open }))}
                      style={styles.multiHeader}
                    >
                      <Text style={styles.cardTitle}>
                        Multi · {book} · {legs.length} legs
                        {combined != null ? ` @ ${combined.toFixed(2)}` : ''}
                        {open ? ' ▲' : ' ▼'}
                      </Text>
                      <Text style={styles.meta}>
                        <Text style={{ color: resultColor(overall), fontWeight: '700' }}>
                          {overall.toUpperCase()}
                        </Text>
                        {legSummary ? ` · ${legSummary}` : ''}
                        {' · '}stake ₦{stake ?? '—'}
                      </Text>
                      {!open ? (
                        <Text style={styles.collapsedHint}>
                          Tap to show {legs.length} leg{legs.length === 1 ? '' : 's'}
                          {legSummary ? ` (${legSummary})` : ''}
                          {loggedAt ? ` · logged ${formatLoggedAt(loggedAt)}` : ''}
                        </Text>
                      ) : null}
                    </Pressable>
                    {open ? (
                      <View style={styles.expandBox}>
                        {legs.map((leg) => (
                          <View key={leg.id} style={styles.legBlock}>
                            <View style={styles.legHeader}>
                              <Text
                                style={[styles.legTeams, styles.legTeamsFlex]}
                                numberOfLines={1}
                              >
                                {formatMatchTitle(leg.home_team, leg.away_team)}
                              </Text>
                              <LegResultBadge result={leg.result} compact />
                            </View>
                            <PickLines t={leg} />
                            <Text style={styles.when}>{matchWhen(leg, true)}</Text>
                            {tab === 'active' ? (
                              <SettleButtons tipId={leg.id} current={leg.result} compact />
                            ) : null}
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}

            {singles.map((t) => (
              <SwipeableRow
                key={t.id}
                style={{ marginTop: 12 }}
                onDelete={() => onDelete(t.id, `${t.home_team} vs ${t.away_team}`)}
              >
                <View style={styles.cardInner}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {formatMatchTitle(t.home_team, t.away_team)}
                  </Text>
                  <Text style={styles.when}>
                    {matchWhen(t)}
                    {loggedWhen(t) ? ` · logged ${loggedWhen(t)}` : ''}
                  </Text>
                  <View style={styles.pickBox}>
                    <PickLines t={t} />
                  </View>
                  <Text style={styles.meta}>
                    <Text style={{ color: resultColor(t.result), fontWeight: '700' }}>
                      {t.result.toUpperCase()}
                    </Text>
                    {' · '}stake ₦{t.stake_ngn ?? '—'}
                  </Text>
                  {tab === 'active' ? <SettleButtons tipId={t.id} current={t.result} /> : null}
                </View>
              </SwipeableRow>
            ))}

            {totalCount > 0 ? (
              <PaginationBar
                page={currentPage}
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
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1 },
  content: { padding: 16 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  tabBtnOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  tabText: { color: colors.muted, fontWeight: '600', fontSize: 14 },
  tabTextOn: { color: colors.accent },
  muted: { color: colors.muted, marginTop: 6, fontSize: 13, lineHeight: 18 },
  status: { color: colors.ink, marginTop: 8, fontSize: 13 },
  filters: { marginTop: 12 },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  searchInput: {
    width: 140,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: colors.ink,
    fontSize: 13,
  },
  dateInput: {
    width: 118,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: colors.ink,
    fontSize: 13,
  },
  chip: {
    marginRight: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  chipText: { color: colors.muted, fontWeight: '600', fontSize: 12 },
  chipTextOn: { color: colors.accent },
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
  cardInner: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  cardTitle: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  multiHeader: { cursor: 'pointer' as const },
  collapsedHint: { color: colors.muted, fontSize: 11, marginTop: 6 },
  pickBox: { marginTop: 8 },
  pickTitle: { color: colors.ink, fontWeight: '600', fontSize: 13, lineHeight: 18 },
  pickMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  meta: { color: colors.muted, marginTop: 6, fontSize: 12, lineHeight: 17 },
  when: { color: colors.muted, fontSize: 11, marginTop: 2 },
  legBlock: {
    marginTop: 8,
    padding: 8,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  legTeams: { color: colors.ink, fontWeight: '600', fontSize: 12, marginBottom: 4 },
  legHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  legTeamsFlex: { flex: 1, marginBottom: 0 },
  legResult: { fontWeight: '800', fontSize: 11, letterSpacing: 0.3 },
  legResultCompact: { fontSize: 10 },
  legResultPill: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.surface,
    flexShrink: 0,
  },
  legResultPillCompact: { paddingHorizontal: 5, paddingVertical: 1 },
  youthHint: { color: colors.warn, fontSize: 11, marginTop: 4, lineHeight: 15 },
  leanNote: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
    paddingHorizontal: 2,
  },
  expandBox: { marginTop: 8 },
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
