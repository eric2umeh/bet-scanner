import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { API_URL, pingHealth } from '../../src/api/client';
import {
  convertSlip,
  type ConvertedLeg,
  type SlipConvertResponse,
} from '../../src/api/convert';
import { runDailyOps, type DailyOpsResponse } from '../../src/api/ops';
import { shareOrCopyText } from '../../src/lib/shareText';
import { bookLabel } from '../../src/lib/tipKey';
import {
  loadSettings,
  saveSettings,
  unitStakeNgn,
  type AppSettings,
} from '../../src/store/settings';
import { colors } from '../../src/theme/colors';

function fmtPrice(v: number | string | null | undefined) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(3) : String(v);
}

function legTitle(leg: ConvertedLeg) {
  if (leg.home_team && leg.away_team) {
    return `${leg.home_team} vs ${leg.away_team}`;
  }
  return leg.raw || '—';
}

function legPick(leg: ConvertedLeg) {
  if (!leg.market) return '—';
  const sel = leg.selection ? String(leg.selection).toUpperCase() : '';
  return sel ? `${leg.market}/${sel}` : leg.market;
}

/** API step keys → plain labels for the Me screen. */
function stepLabel(step: string): string {
  const key = (step || '').toLowerCase();
  if (key === 'sync_fixtures') return 'Refresh match list';
  if (key === 'sync_odds') return 'Refresh bookmaker odds';
  if (key === 'auto_settle') return 'Settle finished tips';
  if (key === 'build_brief' || key === 'brief') return 'Write decision brief';
  if (key === 'telegram') return 'Send Telegram message';
  return step.replace(/_/g, ' ');
}

export default function MeScreen() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [bankroll, setBankroll] = useState('50000');
  const [unitPct, setUnitPct] = useState('1');
  const [pickMarket, setPickMarket] = useState<'double_chance' | '1x2'>('double_chance');

  const [slipText, setSlipText] = useState('');
  const [codeText, setCodeText] = useState('');
  const [sourceBook, setSourceBook] = useState<'sportybet' | 'bet9ja'>('sportybet');
  const [converting, setConverting] = useState(false);
  const [convertResult, setConvertResult] = useState<SlipConvertResponse | null>(null);

  const [opsBusy, setOpsBusy] = useState(false);
  const [opsResult, setOpsResult] = useState<DailyOpsResponse | null>(null);
  const [healthLine, setHealthLine] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  /** On-screen status — Alert.alert is a no-op on Expo web. */
  const [status, setStatus] = useState<string | null>(null);
  const [statusBad, setStatusBad] = useState(false);

  function flash(msg: string, bad = false) {
    setStatus(msg);
    setStatusBad(bad);
  }

  const loadMe = useCallback(async (announce: boolean) => {
    const s = await loadSettings();
    setSettings(s);
    setBankroll(String(s.bankroll));
    setUnitPct(String(s.unitPct));
    setPickMarket(s.pickMarket);
    try {
      const h = await pingHealth();
      setHealthLine(`Server OK${h.version ? ` · v${h.version}` : ''}`);
      if (announce) {
        setStatus('Reloaded · server reachable.');
        setStatusBad(false);
      }
    } catch {
      setHealthLine('Cannot reach server');
      if (announce) {
        setStatus('Cannot reach the Bet Scanner server right now.');
        setStatusBad(true);
      }
    }
  }, []);

  useEffect(() => {
    void loadMe(false);
  }, [loadMe]);

  async function onPullRefresh() {
    setPulling(true);
    try {
      await loadMe(true);
    } finally {
      setPulling(false);
    }
  }

  function parsedSettings(): AppSettings {
    return {
      bankroll: Math.max(1000, Number(bankroll) || 50000),
      unitPct: Math.min(10, Math.max(0.1, Number(unitPct) || 1)),
      pickMarket,
    };
  }

  async function onSave() {
    const next = parsedSettings();
    await saveSettings(next);
    setSettings(next);
    flash(`Saved · unit stake ≈ ₦${unitStakeNgn(next)}`);
  }

  async function onPriceCheck() {
    if (slipText.trim().length < 3) {
      flash('Paste a readable slip first (teams + markets).', true);
      return;
    }
    setConverting(true);
    flash('Comparing SportyBet and Bet9ja prices…');
    try {
      const data = await convertSlip({
        slip_text: slipText,
        code_text: codeText.trim() || null,
        source_book: sourceBook,
      });
      setConvertResult(data);
      flash(data.message || `Found prices for ${data.matched_count} selection(s).`);
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setConverting(false);
    }
  }

  async function onShareSummary() {
    const summary = convertResult?.place_summary?.trim();
    if (!summary) {
      flash('Compare prices first, then copy or share the summary.', true);
      return;
    }
    try {
      const mode = await shareOrCopyText(summary);
      flash(mode === 'copied' ? 'Summary copied to clipboard.' : 'Share sheet opened.');
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    }
  }

  async function onMorning(withOdds: boolean) {
    const s = parsedSettings();
    await saveSettings(s);
    setSettings(s);
    setOpsBusy(true);
    flash(
      withOdds
        ? 'Morning routine running: match list, bookmaker odds, settle tips, brief… (1–3 min if the server is waking up).'
        : 'Morning routine running: match list, settle tips, brief… (1–3 min if the server is waking up).'
    );
    try {
      const data = await runDailyOps({
        bankroll_ngn: s.bankroll,
        unit_pct: s.unitPct,
        pick_market: s.pickMarket,
        sync_odds: withOdds,
        sync_fixtures: true,
        auto_settle: true,
        build_brief: true,
        prefer_llm: true,
      });
      setOpsResult(data);
      flash(data.message || data.summary || 'Morning routine finished.');
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setOpsBusy(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={pulling}
          onRefresh={onPullRefresh}
          tintColor={colors.accent}
        />
      }
    >
      <Text style={styles.title}>Me</Text>
      <Text style={styles.muted}>
        API · {API_URL}
        {healthLine ? ` · ${healthLine}` : ''}
      </Text>
      {status ? (
        <View style={[styles.statusBox, statusBad && styles.statusBad]}>
          {(converting || opsBusy) && (
            <ActivityIndicator color={statusBad ? colors.bad : colors.accent} style={{ marginRight: 8 }} />
          )}
          <Text style={[styles.statusText, statusBad && styles.statusTextBad]}>{status}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.section}>Settings</Text>
        <Text style={styles.label}>Bankroll ₦</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={bankroll}
          onChangeText={setBankroll}
          placeholderTextColor={colors.muted}
        />
        <Text style={styles.label}>Unit %</Text>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          value={unitPct}
          onChangeText={setUnitPct}
          placeholderTextColor={colors.muted}
        />
        <Text style={styles.label}>Safe pick style</Text>
        <View style={styles.row}>
          {(['double_chance', '1x2'] as const).map((m) => (
            <Pressable
              key={m}
              style={[styles.chip, pickMarket === m && styles.chipOn]}
              onPress={() => setPickMarket(m)}
            >
              <Text style={[styles.chipText, pickMarket === m && styles.chipTextOn]}>
                {m === 'double_chance' ? 'Double chance' : '1X2 fav'}
              </Text>
            </Pressable>
          ))}
        </View>
        {settings ? (
          <Text style={styles.muted}>Suggested unit ≈ ₦{unitStakeNgn(settings)}</Text>
        ) : null}
        <Pressable style={styles.btn} onPress={onSave}>
          <Text style={styles.btnText}>Save settings</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Morning routine</Text>
        <Text style={styles.hint}>
          Updates the match list and scores from football calendar sites (not odds-api.io),
          marks finished tips won or lost when scores are known, then writes a short decision
          brief below. Tap “Also refresh odds” only when you need fresh SportyBet / Bet9ja
          prices — that step uses the free odds-api.io allowance.
        </Text>
        <View style={styles.row}>
          <Pressable
            style={[styles.btn, styles.btnFlex, opsBusy && styles.btnDisabled]}
            disabled={opsBusy}
            onPress={() => onMorning(false)}
          >
            {opsBusy ? (
              <ActivityIndicator color="#06241c" />
            ) : (
              <Text style={styles.btnText}>Run morning routine</Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.btnSecondary, styles.btnFlex, opsBusy && styles.btnDisabled]}
            disabled={opsBusy}
            onPress={() => onMorning(true)}
          >
            <Text style={styles.btnSecondaryText}>Also refresh odds</Text>
          </Pressable>
        </View>
        {opsResult ? (
          <View style={styles.opsBox}>
            <Text style={styles.opsSummary}>{opsResult.summary}</Text>
            {(opsResult.steps || []).map((s) => (
              <Text key={s.step} style={styles.opsStep}>
                {s.ok ? '✓' : '✗'} {stepLabel(s.step)}
                {s.message ? ` — ${s.message}` : ''}
              </Text>
            ))}
            {opsResult.learning?.hit_rate_pct != null ? (
              <Text style={styles.muted}>
                Tip hit rate {opsResult.learning.hit_rate_pct}% · tipsters ranked{' '}
                {opsResult.tipsters_ranked ?? 0}
              </Text>
            ) : null}
            {opsResult.brief?.summary ? (
              <Text style={styles.brief}>{opsResult.brief.summary}</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Compare a betting slip</Text>
        <Text style={styles.hint}>
          Paste the match names and picks in plain text. We cannot open a SportyBet or Bet9ja
          booking code by itself — we look up prices already saved for SportyBet and Bet9ja.
        </Text>
        <Text style={styles.label}>Your slip (plain text)</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          multiline
          textAlignVertical="top"
          value={slipText}
          onChangeText={setSlipText}
          placeholder={'Flamengo vs Vitoria\nDouble chance 1X\nOver 2.5\nBTTS No'}
          placeholderTextColor={colors.muted}
        />
        <Text style={styles.label}>Booking code (optional note only)</Text>
        <TextInput
          style={styles.input}
          value={codeText}
          onChangeText={setCodeText}
          autoCapitalize="characters"
          placeholder="ABC123"
          placeholderTextColor={colors.muted}
        />
        <Text style={styles.label}>Source book</Text>
        <View style={styles.row}>
          {(['sportybet', 'bet9ja'] as const).map((b) => (
            <Pressable
              key={b}
              style={[styles.chip, sourceBook === b && styles.chipOn]}
              onPress={() => setSourceBook(b)}
            >
              <Text style={[styles.chipText, sourceBook === b && styles.chipTextOn]}>
                {bookLabel(b)}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          <Pressable
            style={[styles.btn, styles.btnFlex, converting && styles.btnDisabled]}
            disabled={converting}
            onPress={onPriceCheck}
          >
            {converting ? (
              <ActivityIndicator color="#06241c" />
            ) : (
              <Text style={styles.btnText}>Compare prices</Text>
            )}
          </Pressable>
          <Pressable style={[styles.btnSecondary, styles.btnFlex]} onPress={onShareSummary}>
            <Text style={styles.btnSecondaryText}>Copy / share summary</Text>
          </Pressable>
        </View>

        {convertResult ? (
          <View style={styles.convertBox}>
            <Text style={styles.opsSummary}>{convertResult.message}</Text>
            <Text style={styles.combo}>
              {[
                convertResult.combined_sportybet != null
                  ? `SportyBet ~${fmtPrice(convertResult.combined_sportybet)}`
                  : null,
                convertResult.combined_bet9ja != null
                  ? `Bet9ja ~${fmtPrice(convertResult.combined_bet9ja)}`
                  : null,
                convertResult.combined_best_mixed != null
                  ? `Best mix ~${fmtPrice(convertResult.combined_best_mixed)}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'No combined prices'}
            </Text>
            {convertResult.legs.map((leg, i) => (
              <View key={`${leg.raw}-${i}`} style={styles.legCard}>
                <Text style={styles.legTitle}>
                  {i + 1}. {legTitle(leg)}
                </Text>
                <Text style={styles.muted}>
                  {legPick(leg)} · {leg.status}
                </Text>
                <Text style={styles.legPrices}>
                  SportyBet {fmtPrice(leg.prices?.sportybet)} · Bet9ja{' '}
                  {fmtPrice(leg.prices?.bet9ja)}
                  {leg.best_book
                    ? ` · Best ${bookLabel(leg.best_book)} @ ${fmtPrice(leg.best_price)}`
                    : ''}
                </Text>
              </View>
            ))}
            {convertResult.place_summary ? (
              <Text style={styles.brief}>{convertResult.place_summary}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '700' },
  muted: { color: colors.muted, marginTop: 6, fontSize: 13, lineHeight: 18 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18, marginBottom: 4 },
  statusBox: {
    marginTop: 12,
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
  card: {
    marginTop: 16,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  section: { color: colors.ink, fontSize: 17, fontWeight: '700', marginBottom: 2 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '600', marginTop: 6 },
  input: {
    backgroundColor: colors.bg,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
  },
  textarea: { minHeight: 120, paddingTop: 10 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  chipText: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  chipTextOn: { color: colors.accent },
  btn: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  btnFlex: { flex: 1, minWidth: 120 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#06241c', fontWeight: '700' },
  btnSecondary: {
    marginTop: 8,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  btnSecondaryText: { color: colors.ink, fontWeight: '600' },
  opsBox: { marginTop: 8, gap: 4 },
  opsSummary: { color: colors.ink, fontWeight: '600', fontSize: 14, lineHeight: 20 },
  opsStep: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  brief: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    backgroundColor: colors.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
  },
  convertBox: { marginTop: 8, gap: 8 },
  combo: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  legCard: {
    backgroundColor: colors.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    gap: 2,
  },
  legTitle: { color: colors.ink, fontWeight: '600', fontSize: 14 },
  legPrices: { color: colors.ink, fontSize: 12, marginTop: 2 },
});
