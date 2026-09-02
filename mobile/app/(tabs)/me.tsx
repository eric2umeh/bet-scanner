import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from 'react-native';

import Constants from 'expo-constants';
import { API_URL, pingHealth, setCachedAccessKey } from '../../src/api/client';
import { runDailyOps, type DailyOpsResponse } from '../../src/api/ops';
import { MIN_PASSWORD_LENGTH } from '../../src/lib/password';
import { loadAccessKey, saveAccessKey } from '../../src/store/accessKey';
import {
  getSessionEmail,
  isSupabaseConfigured,
  signIn,
  signOut,
  signUp,
  subscribeSession,
} from '../../src/store/session';
import {
  loadSettings,
  saveSettings,
  unitStakeNgn,
  type AppSettings,
} from '../../src/store/settings';
import { PasswordInput } from '../../src/components/PasswordInput';
import { colors } from '../../src/theme/colors';
import { webScrollBottom } from '../../src/theme/webScroll';

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

function stepDetail(step: string, message?: string | null): string {
  if (!message) return '';
  const m = message.trim();
  if (step === 'sync_fixtures') {
    const n = m.match(/(\d+)\s+match/i);
    return n ? `${n[1]} matches updated` : m.replace(/^Upserted\s+/i, '');
  }
  if (step === 'auto_settle') {
    if (/no tips settled/i.test(m)) return 'No tips ready to settle yet';
    if (/error 400/i.test(m)) return 'Score lookup failed — will retry tomorrow';
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

export default function MeScreen() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [bankroll, setBankroll] = useState('50000');
  const [unitPct, setUnitPct] = useState('1');
  const [pickMarket, setPickMarket] = useState<'double_chance' | '1x2'>('double_chance');
  const [accessKey, setAccessKey] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

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
    const [s, key] = await Promise.all([loadSettings(), loadAccessKey()]);
    setSettings(s);
    setBankroll(String(s.bankroll));
    setUnitPct(String(s.unitPct));
    setPickMarket(s.pickMarket);
    setAccessKey(key);
    setCachedAccessKey(key || null);
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

  useEffect(() => {
    setSessionEmail(getSessionEmail());
    return subscribeSession(() => setSessionEmail(getSessionEmail()));
  }, []);

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
    await saveAccessKey(accessKey);
    setCachedAccessKey(accessKey.trim() || null);
    setSettings(next);
    flash(
      accessKey.trim()
        ? `Saved · unit stake ≈ ₦${unitStakeNgn(next)} · access key on`
        : `Saved · unit stake ≈ ₦${unitStakeNgn(next)}`
    );
  }

  function supabaseSetupHint(): string {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const host = window.location?.host || '';
      if (host.includes('onrender.com')) {
        return (
          'Login is off in this web build. Render → Environment: add SUPABASE_URL and ' +
          'SUPABASE_ANON_KEY (same values as mobile/.env), then Manual Deploy. ' +
          'Or use Expo Go on your phone (mobile/.env + restart Metro).'
        );
      }
      return (
        'Login is off in this web build. From repo root run ./scripts/build_web.sh ' +
        '(uses mobile/.env), then hard-refresh. Or use Expo Go on your phone.'
      );
    }
    return (
      'Stop Expo (Ctrl+C), then from mobile/ run: npx expo start --tunnel. ' +
      'Confirm the terminal shows env: export EXPO_PUBLIC_SUPABASE_URL … ' +
      'Keys go in mobile/.env only — not the root .env.'
    );
  }

  function trySignIn() {
    if (!isSupabaseConfigured()) {
      flash(supabaseSetupHint(), true);
      return;
    }
    void onSignIn();
  }

  function trySignUp() {
    if (!isSupabaseConfigured()) {
      flash(supabaseSetupHint(), true);
      return;
    }
    void onSignUp();
  }

  async function onSignIn() {
    flash('Signing in…');
    setAuthBusy(true);
    try {
      await signIn(email, password);
      flash(`Signed in as ${getSessionEmail() || email}. Your tips stay with this account.`);
      setPassword('');
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setAuthBusy(false);
    }
  }

  async function onSignUp() {
    flash('Creating account…');
    setAuthBusy(true);
    try {
      const session = await signUp(email, password);
      if (!session) {
        flash('Account created. Check your email to confirm, then sign in.');
      } else {
        flash(`Signed up as ${getSessionEmail() || email}.`);
      }
      setPassword('');
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setAuthBusy(false);
    }
  }

  async function onSignOut() {
    flash('Signing out…');
    setAuthBusy(true);
    try {
      await signOut();
      flash('Signed out.');
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setAuthBusy(false);
    }
  }

  async function onMorning() {
    const s = parsedSettings();
    await saveSettings(s);
    setSettings(s);
    setOpsBusy(true);
    flash(
      'Morning update: match list, settle tips, brief… (1–3 min if the server is waking up).'
    );
    try {
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
      flash(data.message || data.summary || 'Morning update finished.');
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
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
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={pulling}
          onRefresh={onPullRefresh}
          tintColor={colors.accent}
        />
      }
    >
      <Text style={styles.muted}>
        API · {API_URL}
        {healthLine ? ` · ${healthLine}` : ''}
      </Text>
      {status ? (
        <View style={[styles.statusBox, statusBad && styles.statusBad]}>
          {(opsBusy || authBusy) && (
            <ActivityIndicator color={statusBad ? colors.bad : colors.accent} style={{ marginRight: 8 }} />
          )}
          <Text style={[styles.statusText, statusBad && styles.statusTextBad]}>{status}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.section}>Account</Text>
        {sessionEmail ? (
          <>
            <Text style={styles.muted}>Signed in as {sessionEmail}</Text>
            <Text style={styles.hint}>
              Tips you log are saved under this account.
            </Text>
            <Pressable
              style={[styles.btnSecondary, authBusy && styles.btnDisabled]}
              disabled={authBusy}
              onPress={onSignOut}
            >
              <Text style={styles.btnSecondaryText}>Sign out</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.hint}>
              Email login for your tips. Different from the app access key in Settings below.
            </Text>
            {!isSupabaseConfigured() ? (
              <Text style={[styles.hint, { color: colors.bad }]}>
                Sign in is unavailable in this build — tap Sign in for setup steps.
              </Text>
            ) : null}
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              placeholder="you@email.com"
              placeholderTextColor={colors.muted}
            />
            <Text style={styles.label}>Password (min {MIN_PASSWORD_LENGTH} characters)</Text>
            <PasswordInput
              value={password}
              onChangeText={setPassword}
              placeholder={`at least ${MIN_PASSWORD_LENGTH} characters`}
              placeholderTextColor={colors.muted}
            />
            <View style={styles.row}>
              <Pressable
                style={[
                  styles.btn,
                  styles.btnFlex,
                  (authBusy || !isSupabaseConfigured()) && styles.btnDisabled,
                ]}
                disabled={authBusy}
                onPress={trySignIn}
              >
                <Text style={styles.btnText}>Sign in</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.btnSecondary,
                  styles.btnFlex,
                  (authBusy || !isSupabaseConfigured()) && styles.btnDisabled,
                ]}
                disabled={authBusy}
                onPress={trySignUp}
              >
                <Text style={styles.btnSecondaryText}>Sign up</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

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
        <Text style={styles.label}>App access key</Text>
        <Text style={styles.hint}>
          Required for odds sync when the API is on Render with APP_API_KEY set.
          Paste the same value as APP_API_KEY in Render → Environment, then tap Save settings below.
          API: {API_URL.replace(/^https?:\/\//, '')}
        </Text>
        <PasswordInput
          value={accessKey}
          onChangeText={setAccessKey}
          placeholder="Paste access key"
          placeholderTextColor={colors.muted}
        />
        <Pressable style={styles.btn} onPress={onSave}>
          <Text style={styles.btnText}>Save settings</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Daily update</Text>
        <Text style={styles.hint}>
          Run once each morning (or before you bet): refreshes upcoming matches, settles yesterday’s
          tips when scores are in, and writes a short AI brief of today’s best picks. For live
          SportyBet / 1xBet prices, use Load real bets on the Today tab.
        </Text>
        <Pressable
          style={[styles.btn, opsBusy && styles.btnDisabled]}
          disabled={opsBusy}
          onPress={() => onMorning()}
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
            {opsResult.learning?.hit_rate_pct != null ? (
              <Text style={styles.muted}>
                Safe hit rate {opsResult.learning.hit_rate_pct}% (
                {opsResult.learning.won ?? 0}/{opsResult.learning.settled ?? 0} settled)
              </Text>
            ) : null}
            {opsResult.brief?.summary ? (
              <Text style={styles.brief}>{opsResult.brief.summary}</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>About</Text>
        <Text style={styles.hint}>
          Version {Constants.expoConfig?.version ?? '1.0.0'} · package com.betscanner.app
        </Text>
        <Pressable
          style={styles.btnSecondary}
          onPress={() => void Linking.openURL(`${API_URL}/privacy`)}
        >
          <Text style={styles.btnSecondaryText}>Privacy policy</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
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
});
