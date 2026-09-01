import { useCallback, useEffect, useState } from 'react';
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

import { scanValue, type ValuePick } from '../api/edge';
import { syncOdds } from '../api/odds';
import { bookLabel } from '../lib/tipKey';
import { shareOrCopyText } from '../lib/shareText';
import { loadSettings, type AppSettings } from '../store/settings';
import { colors } from '../theme/colors';
import { webScrollBottom } from '../theme/webScroll';

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

export function ValuePanel({ onFlash }: Props) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [picks, setPicks] = useState<ValuePick[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusBad, setStatusBad] = useState(false);

  function flash(msg: string, bad = false) {
    setStatus(msg);
    setStatusBad(bad);
    onFlash?.(msg, bad);
  }

  const scanOnly = useCallback(async () => {
    setBusy(true);
    try {
      const s = await loadSettings();
      setSettings(s);
      const data = await scanValue({
        bankroll_ngn: s.bankroll,
        unit_pct: s.unitPct,
      });
      setPicks(data.picks || []);
      flash(
        data.picks?.length
          ? data.message || `Found ${data.picks.length} value pick(s).`
          : data.message || 'No +EV edges on saved odds — pull down or tap Scan value.'
      );
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }, []);

  const scanWithOdds = useCallback(async (withOddsSync: boolean) => {
    setBusy(true);
    try {
      const s = await loadSettings();
      setSettings(s);
      if (withOddsSync) {
        flash('Syncing odds, then scanning…');
        await syncOdds();
      }
      const data = await scanValue({
        bankroll_ngn: s.bankroll,
        unit_pct: s.unitPct,
      });
      setPicks(data.picks || []);
      flash(
        data.picks?.length
          ? data.message || `Found ${data.picks.length} value pick(s).`
          : data.message || 'No +EV edges right now.'
      );
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void scanOnly();
  }, [scanOnly]);

  async function onCopyValue(p: ValuePick) {
    const text = [
      `${p.home_team} vs ${p.away_team}`,
      `${selLabel(p.selection)} @${p.odds} on ${bookLabel(p.bookmaker)}`,
      `EV ${p.ev_pct}% · fair ~${p.fair_odds} · stake ₦${p.suggested_stake_ngn}`,
      p.rationale || '',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      const how = await shareOrCopyText(text);
      flash(how === 'copied' ? 'Pick copied.' : 'Pick shared.');
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    }
  }

  const bank = settings?.bankroll ?? 50000;
  const unit = settings?.unitPct ?? 1;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        Platform.OS === 'web' ? { paddingBottom: webScrollBottom(20) } : null,
      ]}
      refreshControl={
        <RefreshControl
          refreshing={busy}
          onRefresh={() => scanWithOdds(true)}
          tintColor={colors.accent}
        />
      }
    >
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Value (+EV) scanner</Text>
        <Text style={styles.heroText}>
          Compares SportyBet and Bet9ja to find prices above fair odds. Uses bankroll ₦
          {bank.toLocaleString()} and {unit}% unit from Me → Settings.
        </Text>
      </View>

      {status ? (
        <View style={[styles.statusBox, statusBad && styles.statusBad]}>
          {busy ? <ActivityIndicator color={colors.accent} style={{ marginRight: 8 }} /> : null}
          <Text style={[styles.statusText, statusBad && styles.statusTextBad]}>{status}</Text>
        </View>
      ) : null}

      <Pressable
        style={[styles.btnPrimary, busy && styles.disabled]}
        disabled={busy}
        onPress={() => void scanWithOdds(true)}
      >
        <Text style={styles.btnPrimaryText}>{busy ? 'Working…' : 'Scan value'}</Text>
      </Pressable>
      <Text style={styles.hint}>
        Syncs odds + scans in one step. Pull down to repeat. Log individual picks from Today after
        you place them.
      </Text>

      {!picks.length && !busy ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No value picks</Text>
          <Text style={styles.emptyText}>
            Tap Scan value or pull down when you need fresh prices, then review EV % before
            staking.
          </Text>
        </View>
      ) : null}

      {picks.map((p) => (
        <View key={`${p.match_id}-${p.selection}-${p.bookmaker}`} style={styles.card}>
          <Text style={styles.cardTitle}>
            {p.home_team} vs {p.away_team}
          </Text>
          <Text style={styles.meta}>
            {p.competition_code}
            {p.kickoff_at ? ` · ${new Date(p.kickoff_at).toLocaleString()}` : ''}
          </Text>
          <View style={styles.evRow}>
            <Text style={styles.evBadge}>EV {String(p.ev_pct)}%</Text>
            <Text style={styles.pickLine}>
              {selLabel(p.selection)} @{String(p.odds)} · {bookLabel(p.bookmaker)}
            </Text>
          </View>
          <Text style={styles.stake}>
            Fair ~{String(p.fair_odds)} · suggested stake ₦{String(p.suggested_stake_ngn)}
          </Text>
          {p.rationale ? <Text style={styles.meta}>{p.rationale}</Text> : null}
          {p.warning ? <Text style={styles.warn}>{p.warning}</Text> : null}
          <Pressable style={styles.copyBtn} onPress={() => void onCopyValue(p)}>
            <Text style={styles.copyBtnText}>Copy / share pick</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  hero: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  heroTitle: { color: colors.ink, fontWeight: '800', fontSize: 17 },
  heroText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
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
  statusBad: { backgroundColor: 'rgba(180,60,60,0.12)', borderColor: '#b43c3c' },
  statusText: { color: colors.ink, fontSize: 13, flex: 1 },
  statusTextBad: { color: '#ffb4b4' },
  btnPrimary: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  btnPrimaryText: { color: '#06241c', fontWeight: '800', fontSize: 15 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginBottom: 12 },
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
  cardTitle: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  evRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  evBadge: {
    backgroundColor: colors.accentDim,
    color: colors.accent,
    fontWeight: '800',
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  pickLine: { color: colors.ink, fontSize: 13, flex: 1 },
  stake: { color: colors.muted, fontSize: 12, marginTop: 6 },
  warn: { color: '#ffb86c', fontSize: 12, marginTop: 6, lineHeight: 17 },
  copyBtn: {
    marginTop: 10,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  copyBtnText: { color: colors.ink, fontWeight: '600', fontSize: 13 },
});
