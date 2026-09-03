import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { runDailyOps, type DailyOpsResponse } from '../../src/api/ops';
import { loadSettings } from '../../src/store/settings';
import { colors } from '../../src/theme/colors';
import { webScrollBottom } from '../../src/theme/webScroll';

function stepLabel(step: string): string {
  const key = (step || '').toLowerCase();
  if (key === 'sync_fixtures') return 'Refresh match list';
  if (key === 'sync_odds') return 'Refresh bookmaker odds';
  if (key === 'auto_settle') return 'Settle finished tips';
  if (key === 'build_brief' || key === 'brief') return 'Write decision brief';
  if (key === 'telegram') return 'Send Telegram message';
  return step.replace(/_/g, ' ');
}

function stepDetail(step: string, message?: string | null): string {
  if (!message) return '';
  const m = message.trim();
  if (step === 'sync_fixtures') {
    const n = m.match(/(\d+)\s+match/i);
    return n ? `${n[1]} matches updated` : m;
  }
  if (step === 'auto_settle') {
    if (/no tips settled/i.test(m)) return 'No tips ready to settle yet';
    const n = m.match(/(\d+)\s+tip/i);
    return n ? `${n[1]} tip(s) settled` : m.split('.')[0];
  }
  if (step === 'brief' || step === 'build_brief') {
    const safe = m.match(/(\d+)\s+safe/i);
    if (safe) return `${safe[1]} safe pick(s) in today’s brief`;
    return m.split('.')[0];
  }
  return m.length > 80 ? `${m.slice(0, 77)}…` : m;
}

export default function MorningUpdateScreen() {
  const [opsBusy, setOpsBusy] = useState(false);
  const [opsResult, setOpsResult] = useState<DailyOpsResponse | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [statusBad, setStatusBad] = useState(false);

  async function onMorning() {
    setOpsBusy(true);
    setStatus('Running morning update…');
    setStatusBad(false);
    try {
      const s = await loadSettings();
      const data = await runDailyOps({
        bankroll_ngn: s.bankroll,
        unit_pct: s.unitPct,
        pick_market: s.pickMarket,
        sync_odds: false,
        sync_fixtures: true,
        auto_settle: true,
        build_brief: true,
        prefer_llm: true,
      });
      setOpsResult(data);
      setStatus(data.message || data.summary || 'Morning update finished.');
      setStatusBad(!data.ok);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
      setStatusBad(true);
    } finally {
      setOpsBusy(false);
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
      <Text style={styles.hint}>
        Morning update: fixtures, settle tips, brief. Fresh prices: ↻ on Today.
      </Text>
      {status ? (
        <View style={[styles.statusBox, statusBad && styles.statusBad]}>
          {opsBusy ? <ActivityIndicator color={colors.accent} style={{ marginRight: 8 }} /> : null}
          <Text style={[styles.statusText, statusBad && styles.statusTextBad]}>{status}</Text>
        </View>
      ) : null}
      <Pressable
        style={[styles.btn, opsBusy && styles.btnDisabled]}
        disabled={opsBusy}
        onPress={() => void onMorning()}
      >
        {opsBusy ? (
          <ActivityIndicator color="#06241c" />
        ) : (
          <Text style={styles.btnText}>Run morning update</Text>
        )}
      </Pressable>
      {opsResult ? (
        <View style={styles.opsBox}>
          <Text style={styles.opsSummary}>
            {opsResult.ok ? 'Morning update complete' : 'Morning update finished with issues'}
          </Text>
          {(opsResult.steps || []).map((s) => (
            <Text key={s.step} style={styles.opsStep}>
              {s.ok ? '✓' : '✗'} {stepLabel(s.step)}
              {stepDetail(s.step, s.message) ? ` — ${stepDetail(s.step, s.message)}` : ''}
            </Text>
          ))}
          {opsResult.brief?.summary ? (
            <Text style={styles.brief}>{opsResult.brief.summary}</Text>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18, marginBottom: 12 },
  statusBox: {
    marginBottom: 12,
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
  statusText: { color: colors.ink, fontSize: 13, flex: 1 },
  statusTextBad: { color: '#ffb4b4' },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: '#06241c', fontWeight: '800', fontSize: 15 },
  opsBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    gap: 6,
  },
  opsSummary: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  opsStep: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  brief: { color: colors.ink, fontSize: 13, lineHeight: 19, marginTop: 6 },
});
