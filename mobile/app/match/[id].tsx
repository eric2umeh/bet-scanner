import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchLatestOdds, type OddRow } from '../../src/api/odds';
import { bookLabel, marketLabel, tipKey } from '../../src/lib/tipKey';
import {
  compareCell,
  oddsAgeLabel,
  packOddsMarket,
} from '../../src/lib/oddsCompare';
import {
  getCachedMatch,
  getCachedPicks,
} from '../../src/store/matchCache';
import {
  getSelectedCount,
  isTipSelected,
  subscribeSelection,
  toggleTip,
} from '../../src/store/selection';
import { loadSettings, unitStakeNgn } from '../../src/store/settings';
import { colors } from '../../src/theme/colors';
import type { Match, TipPick } from '../../src/types/api';

type Panel = 'tips' | 'odds' | 'summary';
type OddsFilter =
  | 'all'
  | '1x2'
  | 'double_chance'
  | 'ou_0_5'
  | 'ou_1_5'
  | 'ou_2_5'
  | 'btts'
  | 'tt_2_5';

function kickoffLabel(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function makeOddsPick(
  match: Match,
  market: string,
  selection: string,
  bookmaker: string,
  price: number
): TipPick {
  return {
    match_id: match.id,
    home_team: match.home_team,
    away_team: match.away_team,
    competition_code: match.competition_code,
    kickoff_at: match.kickoff_at,
    bookmaker,
    market,
    selection,
    odds: price,
    profile: 'odds_compare',
    pick_market: market === 'double_chance' ? 'double_chance' : market,
    rationale: `Odds tab · ${bookLabel(bookmaker)} ${market}/${String(selection).toUpperCase()} @ ${price}`,
  };
}

export default function MatchDetailScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const matchId = Number(id);
  const [panel, setPanel] = useState<Panel>('tips');
  const [match, setMatch] = useState<Match | null>(null);
  const [tips, setTips] = useState<TipPick[]>([]);
  const [sporty, setSporty] = useState<OddRow[]>([]);
  const [bet9ja, setBet9ja] = useState<OddRow[]>([]);
  const [oddsFilter, setOddsFilter] = useState<OddsFilter>('all');
  const [loadingOdds, setLoadingOdds] = useState(false);
  const [oddsError, setOddsError] = useState<string | null>(null);
  const [selectedN, setSelectedN] = useState(0);
  const [stakeFallback, setStakeFallback] = useState<number | null>(null);

  useEffect(() => subscribeSelection(() => setSelectedN(getSelectedCount())), []);

  useEffect(() => {
    if (!Number.isFinite(matchId)) return;
    setMatch(getCachedMatch(matchId));
    setTips(getCachedPicks(matchId));
    loadSettings().then((s) => setStakeFallback(unitStakeNgn(s)));
  }, [matchId]);

  useLayoutEffect(() => {
    const title = match
      ? `${match.home_team} vs ${match.away_team}`.slice(0, 28)
      : 'Match';
    navigation.setOptions({ title });
  }, [navigation, match]);

  const loadOdds = useCallback(async () => {
    if (!Number.isFinite(matchId)) return;
    setLoadingOdds(true);
    setOddsError(null);
    try {
      const [s, b] = await Promise.all([
        fetchLatestOdds({ bookmaker: 'sportybet', match_id: matchId }),
        fetchLatestOdds({ bookmaker: 'melbet', match_id: matchId }).catch(() =>
          fetchLatestOdds({ bookmaker: 'bet9ja', match_id: matchId }).catch(() => [])
        ),
      ]);
      setSporty(Array.isArray(s) ? s : []);
      setBet9ja(Array.isArray(b) ? b : []);
    } catch (e) {
      setOddsError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingOdds(false);
    }
  }, [matchId]);

  useEffect(() => {
    if (panel === 'odds') loadOdds();
  }, [panel, loadOdds]);

  const primary = tips[0] || null;

  const oddsBlocks = useMemo(() => {
    const markets = [
      {
        id: '1x2' as const,
        title: '1X2',
        market: '1X2',
        keys: ['home', 'draw', 'away'],
        labels: ['Home', 'Draw', 'Away'],
      },
      {
        id: 'double_chance' as const,
        title: 'Double chance',
        market: 'double_chance',
        keys: ['1x', 'x2', '12'],
        labels: ['1X', 'X2', '12'],
      },
      {
        id: 'ou_0_5' as const,
        title: 'O/U 0.5',
        market: 'ou_0_5',
        keys: ['over', 'under'],
        labels: ['Over', 'Under'],
      },
      {
        id: 'ou_1_5' as const,
        title: 'O/U 1.5',
        market: 'ou_1_5',
        keys: ['over', 'under'],
        labels: ['Over', 'Under'],
      },
      {
        id: 'ou_2_5' as const,
        title: 'O/U 2.5',
        market: 'ou_2_5',
        keys: ['over', 'under'],
        labels: ['Over', 'Under'],
      },
      {
        id: 'btts' as const,
        title: 'BTTS',
        market: 'btts',
        keys: ['yes', 'no'],
        labels: ['Yes', 'No'],
      },
      {
        id: 'tt_2_5' as const,
        title: 'Team 3+',
        market: 'tt_2_5',
        keys: ['home_over', 'away_over'],
        labels: ['Home 3+', 'Away 3+'],
      },
    ];

    let newest: string | null = null;
    let winsSb = 0;
    let winsB9 = 0;
    let ties = 0;
    const blocks: {
      id: string;
      title: string;
      lean: string;
      keys: string[];
      labels: string[];
      marketKey: string;
      cells: ReturnType<typeof compareCell>[];
    }[] = [];

    for (const mk of markets) {
      if (oddsFilter !== 'all' && oddsFilter !== mk.id) continue;
      const sp = packOddsMarket(sporty, mk.market, mk.keys);
      const b9 = packOddsMarket(bet9ja, mk.market, mk.keys);
      for (const cap of [sp.captured_at, b9.captured_at]) {
        if (cap && (!newest || cap > newest)) newest = cap;
      }
      const cells = mk.keys.map((k) => compareCell(sp.prices[k], b9.prices[k]));
      if (!cells.some((c) => c.a != null || c.b != null)) continue;

      let marketWinsSb = 0;
      let marketWinsB9 = 0;
      cells.forEach((c) => {
        if (c.a == null && c.b == null) return;
        if (c.tie) {
          ties += 1;
          return;
        }
        if (c.bestA && !c.bestB) {
          winsSb += 1;
          marketWinsSb += 1;
        } else if (c.bestB && !c.bestA) {
          winsB9 += 1;
          marketWinsB9 += 1;
        }
      });
      const lean =
        marketWinsSb > marketWinsB9
          ? 'SportyBet lean'
          : marketWinsB9 > marketWinsSb
            ? 'MelBet lean'
            : 'Even';

      blocks.push({
        id: mk.id,
        title: mk.title,
        lean,
        keys: mk.keys,
        labels: mk.labels,
        marketKey: mk.market === '1X2' ? '1x2' : mk.market,
        cells,
      });
    }

    return { blocks, newest, winsSb, winsB9, ties };
  }, [sporty, bet9ja, oddsFilter]);

  if (!Number.isFinite(matchId) || !match) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Match not in cache</Text>
        <Text style={styles.muted}>Go to Today, pull down to refresh odds, then open again.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom:
              28 + Math.max(insets.bottom, 8) + (selectedN > 0 ? 72 : 24),
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={loadingOdds}
            onRefresh={loadOdds}
            tintColor={colors.accent}
          />
        }
      >
        <Text style={styles.league}>
          {match.competition_name || match.competition_code} · {match.status}
        </Text>
        <Text style={styles.title}>
          {match.home_team} vs {match.away_team}
        </Text>
        <Text style={styles.muted}>{kickoffLabel(match.kickoff_at)}</Text>
        {selectedN > 0 ? (
          <Text style={styles.selectHint}>{selectedN} in selection · Log on Today</Text>
        ) : null}

        <View style={styles.tabs}>
          {([
            ['tips', 'Tips'],
            ['odds', 'Odds'],
            ['summary', 'Summary'],
          ] as const).map(([id, label]) => (
            <Pressable
              key={id}
              style={[styles.tab, panel === id && styles.tabOn]}
              onPress={() => setPanel(id)}
            >
              <Text style={[styles.tabText, panel === id && styles.tabTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {panel === 'tips' ? (
          !tips.length ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>No tip for this match</Text>
              <Text style={styles.muted}>
                Safe rules need underdog &gt; 7. Pull down on Today if odds are stale.
              </Text>
            </View>
          ) : (
            tips.map((p) => {
              const on = isTipSelected(p);
              return (
                <View key={tipKey(p)} style={styles.card}>
                  <Text style={styles.kicker}>
                    {marketLabel(p.market)} · {p.profile}
                  </Text>
                  <Text style={styles.placeOn}>Place on {bookLabel(p.bookmaker)}</Text>
                  <Text style={styles.pickBig}>
                    {String(p.selection).toUpperCase()}
                    {p.odds != null ? ` @ ${p.odds}` : ''}
                  </Text>
                  <Text style={styles.muted}>{p.rationale}</Text>
                  <View style={styles.statGrid}>
                    <View style={styles.stat}>
                      <Text style={styles.statVal}>₦{p.suggested_stake_ngn ?? stakeFallback ?? '—'}</Text>
                      <Text style={styles.statLabel}>Stake</Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={styles.statVal}>
                        {p.confidence_pct != null ? `${p.confidence_pct}%` : '—'}
                      </Text>
                      <Text style={styles.statLabel}>{p.confidence_label || 'Confidence'}</Text>
                    </View>
                  </View>
                  <Pressable
                    style={[styles.btn, on && styles.btnSecondary]}
                    onPress={() => toggleTip(p)}
                  >
                    <Text style={on ? styles.btnSecondaryText : styles.btnText}>
                      {on ? 'In selection ✓' : 'Add to selection'}
                    </Text>
                  </Pressable>
                </View>
              );
            })
          )
        ) : null}

        {panel === 'odds' ? (
          <View>
            {loadingOdds ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} /> : null}
            {oddsError ? <Text style={styles.bad}>{oddsError}</Text> : null}
            {!loadingOdds && !oddsBlocks.blocks.length && !oddsError ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>No stored odds</Text>
                <Text style={styles.muted}>Pull down on Today to sync odds (needs ODDS_SYNC_ENABLED=true).</Text>
              </View>
            ) : null}
            {oddsBlocks.blocks.length ? (
              <>
                <Text
                  style={[
                    styles.muted,
                    oddsAgeLabel(oddsBlocks.newest).stale && { color: colors.warn },
                  ]}
                >
                  {oddsAgeLabel(oddsBlocks.newest).text} · verify live
                </Text>
                <View style={styles.tally}>
                  <View style={styles.stat}>
                    <Text style={styles.statVal}>{oddsBlocks.winsSb}</Text>
                    <Text style={styles.statLabel}>SportyBet best</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statVal}>{oddsBlocks.winsB9}</Text>
                    <Text style={styles.statLabel}>MelBet best</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statVal}>{oddsBlocks.ties}</Text>
                    <Text style={styles.statLabel}>Ties</Text>
                  </View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
                  {(
                    [
                      ['all', 'All'],
                      ['1x2', '1X2'],
                      ['double_chance', 'DC'],
                      ['ou_0_5', '0.5'],
                      ['ou_1_5', '1.5'],
                      ['ou_2_5', '2.5'],
                      ['btts', 'BTTS'],
                      ['tt_2_5', 'Team 3+'],
                    ] as const
                  ).map(([id, label]) => (
                    <Pressable
                      key={id}
                      style={[styles.chip, oddsFilter === id && styles.chipOn]}
                      onPress={() => setOddsFilter(id)}
                    >
                      <Text style={[styles.chipText, oddsFilter === id && styles.chipTextOn]}>
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {oddsBlocks.blocks.map((block) => (
                  <View key={block.id} style={styles.card}>
                    <Text style={styles.cardTitle}>
                      {block.title}{' '}
                      <Text style={styles.mutedInline}>· {block.lean}</Text>
                    </Text>
                    <View style={styles.oddsHead}>
                      <Text style={[styles.oddsCell, styles.head]}>Book</Text>
                      {block.labels.map((l) => (
                        <Text key={l} style={[styles.oddsCell, styles.head]}>
                          {l}
                        </Text>
                      ))}
                    </View>
                    <View style={styles.oddsRow}>
                      <Text style={styles.oddsCell}>SB</Text>
                      {block.cells.map((c, i) => (
                        <View key={`s-${i}`} style={styles.oddsCell}>
                          <Text style={c.tie ? styles.tie : c.bestA ? styles.best : styles.price}>
                            {c.a ?? '—'}
                          </Text>
                          {c.deltaA ? <Text style={styles.delta}>{c.deltaA}</Text> : null}
                        </View>
                      ))}
                    </View>
                    <View style={styles.oddsRow}>
                      <Text style={styles.oddsCell}>Mel</Text>
                      {block.cells.map((c, i) => (
                        <View key={`b-${i}`} style={styles.oddsCell}>
                          <Text style={c.tie ? styles.tie : c.bestB ? styles.best : styles.price}>
                            {c.b ?? '—'}
                          </Text>
                          {c.deltaB ? <Text style={styles.delta}>{c.deltaB}</Text> : null}
                        </View>
                      ))}
                    </View>
                    <View style={styles.pickRow}>
                      {block.keys.map((k, i) => {
                        const c = block.cells[i];
                        if (c.a == null && c.b == null) return null;
                        const book =
                          c.tie || (c.bestA && !c.bestB) || c.b == null ? 'sportybet' : 'melbet';
                        const price = book === 'melbet' ? c.b : c.a;
                        if (price == null) return null;
                        const sel =
                          block.marketKey === 'double_chance' ? k.toUpperCase() : k;
                        return (
                          <Pressable
                            key={k}
                            style={styles.btnSecondary}
                            onPress={() =>
                              toggleTip(
                                makeOddsPick(match, block.marketKey, sel, book, price)
                              )
                            }
                          >
                            <Text style={styles.btnSecondaryText}>
                              + {block.labels[i]} {bookLabel(book)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </>
            ) : null}
            <Pressable style={[styles.btnSecondary, { marginTop: 8 }]} onPress={loadOdds}>
              <Text style={styles.btnSecondaryText}>Reload odds</Text>
            </Pressable>
          </View>
        ) : null}

        {panel === 'summary' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Match summary</Text>
            <Text style={styles.muted}>
              {kickoffLabel(match.kickoff_at)} · {match.competition_code}
            </Text>
            <View style={styles.statGrid}>
              <View style={styles.stat}>
                <Text style={styles.statVal}>
                  {primary?.fav_side != null
                    ? `${primary.fav_side} @ ${primary.fav_odds ?? '—'}`
                    : '—'}
                </Text>
                <Text style={styles.statLabel}>Favourite</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statVal}>
                  {primary?.dog_side != null
                    ? `${primary.dog_side} @ ${primary.dog_odds ?? '—'}`
                    : '—'}
                </Text>
                <Text style={styles.statLabel}>Underdog</Text>
              </View>
            </View>
            <Text style={styles.muted}>
              Decision context from NG prices + Safe rules. xG heatmaps deferred.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },
  league: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  title: { color: colors.ink, fontSize: 22, fontWeight: '700', marginTop: 4 },
  muted: { color: colors.muted, marginTop: 6, fontSize: 13, lineHeight: 18 },
  mutedInline: { color: colors.muted, fontWeight: '500', fontSize: 12 },
  selectHint: { color: colors.accent, marginTop: 8, fontWeight: '600', fontSize: 13 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  tabOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  tabText: { color: colors.muted, fontWeight: '600' },
  tabTextOn: { color: colors.accent },
  card: {
    marginTop: 12,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  cardTitle: { color: colors.ink, fontWeight: '700', fontSize: 16 },
  kicker: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  placeOn: { color: colors.ink, fontWeight: '600', marginTop: 6 },
  pickBig: { color: colors.ink, fontSize: 22, fontWeight: '700', marginTop: 6 },
  statGrid: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tally: { flexDirection: 'row', gap: 8, marginTop: 10 },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
  },
  statVal: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  statLabel: { color: colors.muted, fontSize: 11, marginTop: 2 },
  btn: {
    marginTop: 12,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { color: '#06241c', fontWeight: '700' },
  btnSecondary: {
    marginTop: 8,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  btnSecondaryText: { color: colors.ink, fontWeight: '600', fontSize: 12 },
  bad: { color: colors.bad, marginTop: 8 },
  chips: { marginTop: 10, marginBottom: 4, maxHeight: 40 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    marginRight: 8,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  chipText: { color: colors.muted, fontWeight: '600', fontSize: 12 },
  chipTextOn: { color: colors.accent },
  oddsHead: { flexDirection: 'row', marginTop: 10 },
  oddsRow: { flexDirection: 'row', marginTop: 8 },
  oddsCell: { flex: 1, color: colors.ink, fontSize: 13 },
  head: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  best: { color: colors.accent, fontWeight: '700' },
  tie: { color: colors.warn, fontWeight: '600' },
  price: { color: colors.ink },
  delta: { color: colors.good, fontSize: 10, marginTop: 2 },
  pickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
});
