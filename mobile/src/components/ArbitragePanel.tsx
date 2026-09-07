import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  formatSurebetPlan,
  scanSurebets,
  type ArbLeg,
  type ArbOpportunity,
} from '../api/edge';
import { fetchPublicAppConfig } from '../api/appConfig';
import { createTip, fetchTipsPage, type TipOut } from '../api/tips';
import { BookLeanFilters } from './BookLeanFilters';
import { DatePickerField } from './DatePickerField';
import { HorizontalChipScroll } from './HorizontalChipScroll';
import { PaginationBar } from './PaginationBar';
import { useAppModal } from './modal';
import { bookLabel, marketLabel } from '../lib/tipKey';
import { isKickoffUpcoming } from '../lib/matchBettable';
import { openBookmakerMatch } from '../lib/openBookmaker';
import { recalculateSurebetStakes } from '../lib/surebetStakes';
import { shareOrCopyText } from '../lib/shareText';
import { loadSettings } from '../store/settings';
import { colors } from '../theme/colors';
import { webScrollBottom } from '../theme/webScroll';

type MarketChip = 'all' | '1X2' | 'ou_0_5' | 'ou_1_5' | 'ou_2_5' | 'btts';
type TabId = 'scan' | 'history';

const MARKET_CHIPS: { id: MarketChip; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: '1X2', label: 'Winner' },
  { id: 'ou_0_5', label: 'O/U 0.5' },
  { id: 'ou_1_5', label: 'O/U 1.5' },
  { id: 'ou_2_5', label: 'O/U 2.5' },
  { id: 'btts', label: 'BTTS' },
];

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

function selLabel(sel: string, market?: string) {
  const s = (sel || '').toLowerCase();
  const m = (market || '').toLowerCase();
  if (s === 'home') return 'Home';
  if (s === 'draw') return 'Draw';
  if (s === 'away') return 'Away';
  if (s === 'over') {
    if (m === 'ou_0_5') return 'Over 0.5';
    if (m === 'ou_1_5') return 'Over 1.5';
    if (m === 'ou_2_5') return 'Over 2.5';
    return 'Over';
  }
  if (s === 'under') {
    if (m === 'ou_0_5') return 'Under 0.5';
    if (m === 'ou_1_5') return 'Under 1.5';
    if (m === 'ou_2_5') return 'Under 2.5';
    return 'Under';
  }
  if (s === 'yes') return m === 'btts' ? 'BTTS Yes' : 'Yes';
  if (s === 'no') return m === 'btts' ? 'BTTS No' : 'No';
  return sel;
}

function applyStake(opp: ArbOpportunity, total: number): ArbOpportunity {
  const baseLegs = (opp.legs?.length ? opp.legs : opp.sample_legs || []).map((l) => ({
    bookmaker: l.bookmaker,
    market: l.market || opp.market,
    selection: l.selection,
    odds: l.odds,
  }));
  if (baseLegs.length < 2 || !(total > 0)) return opp;
  const plan = recalculateSurebetStakes(baseLegs, total);
  return {
    ...opp,
    implied_sum: plan.implied_sum,
    sample_total_stake_ngn: plan.sample_total_stake_ngn,
    sample_profit_ngn: plan.sample_profit_ngn,
    sample_legs: plan.sample_legs,
  };
}

type Props = {
  onFlash?: (msg: string, bad?: boolean) => void;
};

export function ArbitragePanel({ onFlash }: Props) {
  const modal = useAppModal();
  const [configuredBooks, setConfiguredBooks] = useState<string[]>(['sportybet', 'melbet']);
  const [opps, setOpps] = useState<ArbOpportunity[]>([]);
  const [history, setHistory] = useState<TipOut[]>([]);
  const [tab, setTab] = useState<TabId>('scan');
  const [busy, setBusy] = useState(false);
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const [clockTick, setClockTick] = useState(0);
  const [sampleStake, setSampleStake] = useState('50000');
  const [searchQ, setSearchQ] = useState('');
  /** Default today so future-dated arbs don't dominate the list. Clear = all days. */
  const [dateFilter, setDateFilter] = useState(() => toLocalIsoDate());
  const [marketFilter, setMarketFilter] = useState<MarketChip>('all');
  const [bookFilter, setBookFilter] = useState('all');
  const [minProfitPct, setMinProfitPct] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [histPageIndex, setHistPageIndex] = useState(0);
  const [histPageSize, setHistPageSize] = useState(PAGE_SIZE_DEFAULT);
  /** When true, scan every book in DB (EU + NG). Default false = configured NG only. */
  const [scanAllBooks, setScanAllBooks] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setClockTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    void (async () => {
      const s = await loadSettings();
      setSampleStake(String(s.bankroll || 50000));
      const cfg = await fetchPublicAppConfig();
      if (cfg.odds_bookmakers?.length) setConfiguredBooks(cfg.odds_bookmakers);
    })();
  }, []);

  function flash(msg: string, bad = false) {
    onFlash?.(msg, bad);
  }

  const stakeN = useMemo(() => {
    const n = Number(String(sampleStake).replace(/,/g, ''));
    return Number.isFinite(n) && n > 0 ? n : 10000;
  }, [sampleStake]);

  const booksForFilter = useMemo(() => {
    const set = new Set<string>(configuredBooks.map((b) => b.toLowerCase()));
    for (const o of opps) {
      for (const b of o.books_used || []) set.add(String(b).toLowerCase());
      for (const l of o.legs || []) set.add(String(l.bookmaker).toLowerCase());
    }
    return [...set].sort();
  }, [configuredBooks, opps]);

  const findSurebets = useCallback(
    async (opts?: { allBooks?: boolean }) => {
      setBusy(true);
      try {
        const useAll = opts?.allBooks ?? scanAllBooks;
        const data = await scanSurebets({
          sample_stake_ngn: stakeN,
          bookmakers: useAll ? 'all' : configuredBooks.join(','),
          min_profit_pct: 0.01,
        });
        const upcoming = (data.opportunities || []).filter((o) =>
          isKickoffUpcoming(o.kickoff_at)
        );
        setOpps(upcoming.map((o) => applyStake(o, stakeN)));
        setPageIndex(0);
        flash(
          upcoming.length
            ? data.message || `Found ${upcoming.length} surebet(s).`
            : data.message ||
                (useAll
                  ? 'No surebets right now — try closer to kickoff.'
                  : 'No surebets on your configured books. Try All books below, or sync Today first.')
        );
      } catch (e) {
        flash(e instanceof Error ? e.message : String(e), true);
      } finally {
        setBusy(false);
      }
    },
    [stakeN, scanAllBooks, configuredBooks]
  );
  const loadHistory = useCallback(async () => {
    setBusy(true);
    try {
      const page = await fetchTipsPage({
        source: 'arbitrage',
        limit: 100,
        offset: 0,
      });
      const items = Array.isArray(page) ? page : page.items || [];
      setHistory(items);
      setHistPageIndex(0);
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void findSurebets();
  }, []);

  useEffect(() => {
    if (tab === 'history') void loadHistory();
  }, [tab, loadHistory]);

  // Re-split stakes when the sample stake field changes (no extra scan).
  useEffect(() => {
    setOpps((prev) => prev.map((o) => applyStake(o, stakeN)));
  }, [stakeN]);

  const filteredOpps = useMemo(() => {
    void clockTick;
    const q = searchQ.trim().toLowerCase();
    return opps.filter((o) => {
      if (!isKickoffUpcoming(o.kickoff_at)) return false;
      if (!kickoffOnDate(o.kickoff_at, dateFilter)) return false;
      if (marketFilter !== 'all' && String(o.market) !== marketFilter) return false;
      if (minProfitPct > 0 && Number(o.profit_pct) < minProfitPct) return false;
      if (bookFilter !== 'all') {
        const books = (o.books_used || []).map((b) => String(b).toLowerCase());
        if (!books.includes(bookFilter)) return false;
      }
      if (q) {
        const hay = `${o.home_team} ${o.away_team} ${o.competition_code || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [opps, marketFilter, bookFilter, minProfitPct, searchQ, dateFilter, clockTick]);

  const chipCounts = useMemo(() => {
    const base = opps.filter(
      (o) => isKickoffUpcoming(o.kickoff_at) && kickoffOnDate(o.kickoff_at, dateFilter)
    );
    const counts: Partial<Record<MarketChip, number>> = { all: base.length };
    for (const o of base) {
      const m = String(o.market || '') as MarketChip;
      counts[m] = (counts[m] || 0) + 1;
    }
    return counts;
  }, [opps, dateFilter, clockTick]);

  useEffect(() => {
    setPageIndex(0);
  }, [searchQ, marketFilter, bookFilter, minProfitPct, dateFilter, pageSize]);

  useEffect(() => {
    setHistPageIndex(0);
  }, [dateFilter, histPageSize]);

  const totalPages = filteredOpps.length
    ? Math.max(1, Math.ceil(filteredOpps.length / pageSize))
    : 0;
  const pagedOpps = useMemo(() => {
    const start = pageIndex * pageSize;
    return filteredOpps.slice(start, start + pageSize);
  }, [filteredOpps, pageIndex, pageSize]);

  const pagedHistory = useMemo(() => {
    const list = history.filter((t) => kickoffOnDate(t.kickoff_at, dateFilter));
    const start = histPageIndex * histPageSize;
    return list.slice(start, start + histPageSize);
  }, [history, histPageIndex, histPageSize, dateFilter]);

  const histFilteredCount = useMemo(
    () => history.filter((t) => kickoffOnDate(t.kickoff_at, dateFilter)).length,
    [history, dateFilter]
  );

  const histTotalPages = histFilteredCount
    ? Math.max(1, Math.ceil(histFilteredCount / histPageSize))
    : 0;
  const bestProfit = filteredOpps.length
    ? Math.max(...filteredOpps.map((o) => Number(o.profit_pct) || 0))
    : 0;

  async function onCopyPlan(opp: ArbOpportunity) {
    try {
      const how = await shareOrCopyText(formatSurebetPlan(opp));
      flash(how === 'copied' ? 'Stake plan copied.' : 'Stake plan shared.');
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    }
  }

  async function onLogSurebet(opp: ArbOpportunity) {
    const key = `${opp.match_id}-${opp.market}`;
    if (loggingId) return;
    setLoggingId(key);
    try {
      await createTip({
        match_id: opp.match_id,
        risk_profile: 'arbitrage',
        market: String(opp.market || '1X2'),
        selection: 'surebet',
        bookmaker: 'multi',
        stake_ngn: Number(opp.sample_total_stake_ngn) || stakeN,
        source: 'arbitrage',
        rationale: formatSurebetPlan(opp),
        confidence_pct: Number(opp.profit_pct) || null,
      });
      flash('Surebet logged — open History to see it.');
      if (tab === 'history') await loadHistory();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      flash(msg.includes('409') || msg.toLowerCase().includes('already')
        ? 'Already logged for this match/market.'
        : msg, true);
    } finally {
      setLoggingId(null);
    }
  }

  async function onOpenLeg(opp: ArbOpportunity, leg: ArbLeg) {
    const result = await openBookmakerMatch({
      bookmaker: leg.bookmaker,
      home: opp.home_team,
      away: opp.away_team,
    });
    if (!result.ok) {
      await modal.alert({
        title: `Could not open ${result.label}`,
        message: result.copied
          ? `“${result.searchFor}” is on your clipboard — paste into Search.`
          : `Search for “${result.searchFor}” in ${result.label}.`,
      });
    } else if (!result.hasSearch) {
      await modal.alert({
        title: result.label,
        message: `“${result.searchFor}” is on your clipboard — paste into Search.`,
      });
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        Platform.OS === 'web' ? { paddingBottom: webScrollBottom(20) } : null,
      ]}
    >
      <Text style={styles.heroTitle}>Surebet scanner</Text>

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, tab === 'scan' && styles.tabOn]}
          onPress={() => setTab('scan')}
        >
          <Text style={[styles.tabText, tab === 'scan' && styles.tabTextOn]}>Scan</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'history' && styles.tabOn]}
          onPress={() => setTab('history')}
        >
          <Text style={[styles.tabText, tab === 'history' && styles.tabTextOn]}>History</Text>
        </Pressable>
      </View>

      {tab === 'scan' ? (
        <>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{filteredOpps.length}</Text>
              <Text style={styles.statLabel}>Found</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statVal, filteredOpps.length ? styles.statGood : null]}>
                {filteredOpps.length ? `${bestProfit.toFixed(2)}%` : '—'}
              </Text>
              <Text style={styles.statLabel}>Best profit</Text>
            </View>
            <View style={styles.stat}>
              <TextInput
                style={styles.stakeInput}
                value={sampleStake}
                onChangeText={setSampleStake}
                keyboardType="numeric"
                accessibilityLabel="Sample stake in Naira"
              />
              <Text style={styles.statLabel}>Sample stake ₦</Text>
            </View>
          </View>

          <Pressable
            style={[styles.btnPrimary, busy && styles.disabled]}
            disabled={busy}
            onPress={() => void findSurebets()}
          >
            {busy ? (
              <ActivityIndicator color="#06241c" />
            ) : (
              <Text style={styles.btnPrimaryText}>Find surebets</Text>
            )}
          </Pressable>
          <Text style={styles.hint}>
            Scans 1X2 · O/U · BTTS on{' '}
            {scanAllBooks ? 'all synced books' : configuredBooks.map(bookLabel).join(' · ') || 'configured books'}
            . Tap a book name on a leg to open it. Change sample stake anytime — stakes update instantly.
          </Text>

          <HorizontalChipScroll>
            {MARKET_CHIPS.map((c) => {
              const n = chipCounts[c.id] ?? 0;
              return (
                <Pressable
                  key={c.id}
                  style={[styles.chip, marketFilter === c.id && styles.chipOn]}
                  onPress={() => setMarketFilter(c.id)}
                >
                  <Text style={[styles.chipText, marketFilter === c.id && styles.chipTextOn]}>
                    {c.label} · {n}
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
              books={booksForFilter}
              bookValue={bookFilter}
              onBookChange={setBookFilter}
              leanValue={minProfitPct}
              onLeanChange={setMinProfitPct}
              forceCombined
            />
          </View>

          <Pressable
            style={[styles.allBooksToggle, scanAllBooks && styles.allBooksToggleOn]}
            onPress={() => {
              const next = !scanAllBooks;
              setScanAllBooks(next);
              void findSurebets({ allBooks: next });
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: scanAllBooks }}
          >
            <Text style={[styles.allBooksText, scanAllBooks && styles.allBooksTextOn]}>
              {scanAllBooks
                ? 'Scanning all books (incl. EU). Tap to use configured NG books only.'
                : 'Using configured books only. Tap to include all synced books (Pinnacle, Unibet, …).'}
            </Text>
          </Pressable>

          {!filteredOpps.length && !busy ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No surebets for this view</Text>
              <Text style={styles.emptyText}>
                {dateFilter
                  ? `Nothing for ${dateFilter}. Clear the date (×) to see other days, or Find surebets again.`
                  : 'True arbs are rare on SportyBet/MelBet. Sync Today first, then Find surebets. “All books” includes European books from the-odds-api (not SportyBet).'}
              </Text>
            </View>
          ) : null}

          {pagedOpps.map((o) => (
            <ArbCard
              key={`${o.match_id}-${o.market}-${o.profit_pct}-${(o.books_used || []).join(',')}`}
              opp={o}
              logging={loggingId === `${o.match_id}-${o.market}`}
              onCopy={() => void onCopyPlan(o)}
              onLog={() => void onLogSurebet(o)}
              onOpenLeg={(leg) => void onOpenLeg(o, leg)}
            />
          ))}

          {filteredOpps.length > 0 ? (
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
        </>
      ) : (
        <>
          <Text style={styles.hint}>Logged surebets (source: arbitrage). Tap Find surebets on Scan, then Log.</Text>
          <View style={styles.filterTools}>
            <DatePickerField
              value={dateFilter}
              onChange={setDateFilter}
              placeholder="Kickoff date"
              style={styles.dateField}
            />
            <Pressable
              style={[styles.btnSecondaryInline, busy && styles.disabled]}
              disabled={busy}
              onPress={() => void loadHistory()}
            >
              <Text style={styles.btnSecondaryText}>Refresh</Text>
            </Pressable>
          </View>

          {!pagedHistory.length && !busy ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No logged surebets</Text>
              <Text style={styles.emptyText}>
                {dateFilter
                  ? `Nothing for ${dateFilter}. Clear the date (×) or Log a surebet from Scan.`
                  : 'On Scan, tap Log surebet on a card to save it here.'}
              </Text>
            </View>
          ) : null}

          {pagedHistory.map((t) => (
            <View key={t.id} style={styles.card}>
              <Text style={styles.cardTitle}>
                {t.home_team} vs {t.away_team}
              </Text>
              <Text style={styles.cardMeta}>
                {marketLabel(t.market)} · {t.result}
                {t.created_at ? ` · logged ${new Date(t.created_at).toLocaleString()}` : ''}
              </Text>
              {t.stake_ngn != null ? (
                <Text style={styles.histStake}>Stake ₦{Number(t.stake_ngn).toLocaleString()}</Text>
              ) : null}
              {t.rationale ? (
                <Text style={styles.rationale} numberOfLines={6}>
                  {t.rationale}
                </Text>
              ) : null}
            </View>
          ))}

          {histFilteredCount > 0 ? (
            <PaginationBar
              page={histPageIndex + 1}
              totalPages={histTotalPages}
              pageSize={histPageSize}
              disabled={busy}
              onPageChange={(p) => setHistPageIndex(p - 1)}
              onPageSizeChange={(size) => {
                setHistPageSize(size);
                setHistPageIndex(0);
              }}
            />
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function ArbCard({
  opp,
  onCopy,
  onLog,
  onOpenLeg,
  logging,
}: {
  opp: ArbOpportunity;
  onCopy: () => void;
  onLog: () => void;
  onOpenLeg: (leg: ArbLeg) => void;
  logging?: boolean;
}) {
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
            {marketLabel(opp.market || '1X2')} · {opp.competition_code}
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
        <Pressable
          key={`${leg.bookmaker}-${leg.selection}-${i}`}
          style={styles.legRow}
          onPress={() => onOpenLeg(leg)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${bookLabel(leg.bookmaker)} for ${selLabel(leg.selection, leg.market || opp.market)}`}
        >
          <View style={styles.legMain}>
            <Text style={styles.legSel}>{selLabel(leg.selection, leg.market || opp.market)}</Text>
            <Text style={styles.legBookPill}>{bookLabel(leg.bookmaker)} ↗</Text>
          </View>
          <Text style={styles.legOdds}>@{leg.odds}</Text>
          {leg.stake_ngn != null ? (
            <Text style={styles.legStake}>₦{Number(leg.stake_ngn).toLocaleString()}</Text>
          ) : null}
        </Pressable>
      ))}
      <View style={styles.cardActions}>
        <Pressable style={styles.copyBtn} onPress={onCopy}>
          <Text style={styles.copyBtnText}>Copy stake plan</Text>
        </Pressable>
        <Pressable
          style={[styles.logBtn, logging && styles.disabled]}
          onPress={onLog}
          disabled={logging}
        >
          {logging ? (
            <ActivityIndicator color="#06241c" size="small" />
          ) : (
            <Text style={styles.logBtnText}>Log surebet</Text>
          )}
        </Pressable>
      </View>
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
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  tabOn: {
    backgroundColor: colors.accentDim,
    borderColor: 'rgba(45, 212, 168, 0.45)',
  },
  tabText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  tabTextOn: { color: colors.accent },
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
  stakeInput: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: 14,
    textAlign: 'center',
    minWidth: 64,
    paddingVertical: 0,
    width: '100%',
  },
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
  btnSecondary: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  btnSecondaryText: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginBottom: 12 },
  filterTools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    minWidth: 100,
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
  btnSecondaryInline: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  allBooksToggle: {
    marginBottom: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  allBooksToggleOn: {
    borderColor: 'rgba(45, 212, 168, 0.45)',
    backgroundColor: colors.accentDim,
  },
  allBooksText: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  allBooksTextOn: { color: colors.accent },
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
  legStake: { color: colors.ink, fontSize: 12, marginLeft: 'auto' },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  copyBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  copyBtnText: { color: colors.ink, fontWeight: '600', fontSize: 13 },
  logBtn: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  logBtnText: { color: '#06241c', fontWeight: '800', fontSize: 13 },
  histStake: { color: colors.ink, fontWeight: '600', fontSize: 13, marginTop: 6 },
  rationale: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 8 },
});
