import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  formatSurebetPlan,
  logSurebetScan,
  logValueScan,
  scanSurebets,
  scanValue,
  type ArbOpportunity,
  type ValuePick,
} from '../api/edge';
import { bookLabel } from '../lib/tipKey';
import { shareOrCopyText } from '../lib/shareText';
import { loadSettings, type AppSettings } from '../store/settings';
import { colors } from '../theme/colors';

type Mode = 'value' | 'surebets';

type Props = {
  /** Load scans when Advanced tools is expanded. */
  active: boolean;
  onFlash?: (msg: string, bad?: boolean) => void;
};

function selLabel(sel: string) {
  const s = (sel || '').toLowerCase();
  if (s === 'home') return 'Home';
  if (s === 'draw') return 'Draw';
  if (s === 'away') return 'Away';
  return sel;
}

export function EdgePanel({ active, onFlash }: Props) {
  const [mode, setMode] = useState<Mode>('value');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [picks, setPicks] = useState<ValuePick[]>([]);
  const [opps, setOpps] = useState<ArbOpportunity[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusBad, setStatusBad] = useState(false);

  function flash(msg: string, bad = false) {
    setStatus(msg);
    setStatusBad(bad);
    onFlash?.(msg, bad);
  }

  const refresh = useCallback(
    async (m: Mode = mode) => {
      setBusy(true);
      try {
        const s = await loadSettings();
        setSettings(s);
        if (m === 'value') {
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
        } else {
          const data = await scanSurebets({ sample_stake_ngn: s.bankroll });
          setOpps(data.opportunities || []);
          flash(
            data.opportunities?.length
              ? data.message || `Found ${data.opportunities.length} surebet(s).`
              : data.message || 'No surebets right now.'
          );
        }
      } catch (e) {
        flash(e instanceof Error ? e.message : String(e), true);
      } finally {
        setBusy(false);
      }
    },
    [mode]
  );

  useEffect(() => {
    if (!active) return;
    void refresh(mode);
  }, [active, refresh, mode]);

  async function onLog() {
    if (!settings) return;
    setBusy(true);
    try {
      if (mode === 'value') {
        const data = await logValueScan({
          bankroll_ngn: settings.bankroll,
          unit_pct: settings.unitPct,
        });
        flash(data.message || 'Value tips logged.');
        await refresh('value');
      } else {
        const data = await logSurebetScan({ bankroll_ngn: settings.bankroll });
        flash(data.message || 'Surebets logged.');
        await refresh('surebets');
      }
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }

  async function onCopyPlan(opp: ArbOpportunity) {
    try {
      const how = await shareOrCopyText(formatSurebetPlan(opp));
      flash(how === 'copied' ? 'Stake plan copied.' : 'Stake plan shared.');
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
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
    <View style={styles.wrap}>
      <Text style={styles.section}>Value & surebets</Text>
      <Text style={styles.muted}>
        Cross-book +EV and surebets on SportyBet + Bet9ja. Uses bankroll ₦{bank} and {unit}%
        unit from Settings above. Run “Also refresh odds” first.
      </Text>

      <View style={styles.row}>
        {([
          { id: 'value' as const, label: 'Value' },
          { id: 'surebets' as const, label: 'Surebets' },
        ]).map((t) => {
          const on = mode === t.id;
          return (
            <Pressable
              key={t.id}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => setMode(t.id)}
              disabled={busy}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {status ? (
        <View style={[styles.statusBox, statusBad && styles.statusBad]}>
          {busy ? <ActivityIndicator color={colors.accent} style={{ marginRight: 8 }} /> : null}
          <Text style={[styles.statusText, statusBad && styles.statusTextBad]}>{status}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          style={[styles.btnGhost, busy && styles.disabled]}
          disabled={busy}
          onPress={() => void refresh(mode)}
        >
          <Text style={styles.btnGhostText}>Scan again</Text>
        </Pressable>
        <Pressable style={[styles.btn, busy && styles.disabled]} disabled={busy} onPress={() => void onLog()}>
          <Text style={styles.btnText}>
            {mode === 'value' ? 'Log value tips' : 'Log surebets'}
          </Text>
        </Pressable>
      </View>

      {mode === 'value' ? (
        !picks.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No value picks</Text>
            <Text style={styles.muted}>
              Tap “Also refresh odds” in Morning routine, wait, then Scan again.
            </Text>
          </View>
        ) : (
          picks.map((p) => (
            <View key={`${p.match_id}-${p.selection}-${p.bookmaker}`} style={styles.card}>
              <Text style={styles.cardTitle}>
                {p.home_team} vs {p.away_team}
              </Text>
              <Text style={styles.meta}>
                {p.competition_code}
                {p.kickoff_at ? ` · ${new Date(p.kickoff_at).toLocaleString()}` : ''}
              </Text>
              <Text style={styles.pickLine}>
                {selLabel(p.selection)} @{String(p.odds)} · {bookLabel(p.bookmaker)}
              </Text>
              <Text style={styles.ev}>
                EV {String(p.ev_pct)}% · fair ~{String(p.fair_odds)} · stake ₦
                {String(p.suggested_stake_ngn)}
              </Text>
              {p.rationale ? <Text style={styles.meta}>{p.rationale}</Text> : null}
              {p.warning ? <Text style={styles.warn}>{p.warning}</Text> : null}
              <Pressable style={styles.secondaryBtn} onPress={() => void onCopyValue(p)}>
                <Text style={styles.secondaryBtnText}>Copy / share</Text>
              </Pressable>
            </View>
          ))
        )
      ) : !opps.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No surebets</Text>
          <Text style={styles.muted}>
            Rare on two books. Refresh odds first. Tiny profits may not be placeable.
          </Text>
        </View>
      ) : (
        opps.map((o) => (
          <View key={`${o.match_id}-${o.profit_pct}`} style={styles.card}>
            <Text style={styles.cardTitle}>
              {o.home_team} vs {o.away_team}
            </Text>
            <Text style={styles.meta}>
              {o.competition_code}
              {o.kickoff_at ? ` · ${new Date(o.kickoff_at).toLocaleString()}` : ''}
            </Text>
            <Text style={styles.ev}>
              Profit ~{String(o.profit_pct)}% · ~₦{String(o.sample_profit_ngn)} on ₦
              {String(o.sample_total_stake_ngn)}
            </Text>
            {(o.sample_legs || []).map((l, i) => (
              <Text key={`${l.bookmaker}-${l.selection}-${i}`} style={styles.leg}>
                {bookLabel(l.bookmaker)} {selLabel(l.selection)} @{String(l.odds)} → ₦
                {String(l.stake_ngn)}
              </Text>
            ))}
            {o.warning ? <Text style={styles.warn}>{o.warning}</Text> : null}
            <Pressable style={styles.secondaryBtn} onPress={() => void onCopyPlan(o)}>
              <Text style={styles.secondaryBtnText}>Copy stake plan</Text>
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, gap: 6 },
  section: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  chipText: { color: colors.muted, fontWeight: '600', fontSize: 14 },
  chipTextOn: { color: colors.accent },
  statusBox: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentDim,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusBad: {
    backgroundColor: 'rgba(239, 107, 107, 0.12)',
    borderColor: colors.bad,
  },
  statusText: { flex: 1, color: colors.accent, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  statusTextBad: { color: colors.bad },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { color: '#06241c', fontWeight: '700' },
  btnGhost: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnGhostText: { color: colors.ink, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  empty: {
    marginTop: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
  },
  emptyTitle: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  card: {
    marginTop: 10,
    backgroundColor: colors.bg,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  cardTitle: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  pickLine: { color: colors.ink, fontSize: 14, fontWeight: '600', marginTop: 2 },
  ev: { color: colors.good, fontWeight: '700', fontSize: 13, marginTop: 2 },
  leg: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  warn: { color: colors.warn, fontSize: 12, marginTop: 4 },
  secondaryBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  secondaryBtnText: { color: colors.muted, fontWeight: '600', fontSize: 12 },
});
