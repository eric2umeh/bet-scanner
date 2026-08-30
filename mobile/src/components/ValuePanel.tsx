import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { logValueScan, scanValue, type ValuePick } from '../api/edge';
import { bookLabel } from '../lib/tipKey';
import { shareOrCopyText } from '../lib/shareText';
import { loadSettings, type AppSettings } from '../store/settings';
import { colors } from '../theme/colors';

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

  const refresh = useCallback(async () => {
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
          : data.message || 'No +EV edges right now.'
      );
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onLog() {
    if (!settings) return;
    setBusy(true);
    try {
      const data = await logValueScan({
        bankroll_ngn: settings.bankroll,
        unit_pct: settings.unitPct,
      });
      flash(data.message || 'Value tips logged.');
      await refresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }

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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Value (+EV) scanner</Text>
        <Text style={styles.heroText}>
          Compares SportyBet and Bet9ja to find prices above fair odds. Positive EV % means the
          line looks better than the cross-book consensus. Uses bankroll ₦{bank.toLocaleString()}{' '}
          and {unit}% unit from Me → Settings.
        </Text>
      </View>

      {status ? (
        <View style={[styles.statusBox, statusBad && styles.statusBad]}>
          {busy ? <ActivityIndicator color={colors.accent} style={{ marginRight: 8 }} /> : null}
          <Text style={[styles.statusText, statusBad && styles.statusTextBad]}>{status}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          style={[styles.btnPrimary, busy && styles.disabled]}
          disabled={busy}
          onPress={() => void refresh()}
        >
          <Text style={styles.btnPrimaryText}>Scan value picks</Text>
        </Pressable>
        <Pressable
          style={[styles.btnSecondary, busy && styles.disabled]}
          disabled={busy || !picks.length}
          onPress={() => void onLog()}
        >
          <Text style={styles.btnSecondaryText}>Log to Tips</Text>
        </Pressable>
      </View>

      {!picks.length && !busy ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No value picks</Text>
          <Text style={styles.emptyText}>
            Refresh odds first (Me → Morning routine → Also refresh odds), then scan again.
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
  statusBad: {
    backgroundColor: 'rgba(239, 107, 107, 0.12)',
    borderColor: colors.bad,
  },
  statusText: { flex: 1, color: colors.accent, fontSize: 13, fontWeight: '600' },
  statusTextBad: { color: colors.bad },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  btnPrimary: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#06241c', fontWeight: '800' },
  btnSecondary: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnSecondaryText: { color: colors.ink, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  empty: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
  },
  emptyTitle: { color: colors.ink, fontWeight: '700', fontSize: 16 },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  card: {
    marginTop: 12,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  cardTitle: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  evRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  evBadge: {
    color: colors.good,
    fontWeight: '800',
    fontSize: 14,
    backgroundColor: colors.good + '22',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  pickLine: { color: colors.ink, fontWeight: '600', fontSize: 14 },
  stake: { color: colors.muted, fontSize: 12, marginTop: 2 },
  warn: { color: colors.warn, fontSize: 12, marginTop: 4 },
  copyBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  copyBtnText: { color: colors.accent, fontWeight: '600', fontSize: 12 },
});
