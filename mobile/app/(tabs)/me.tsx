import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
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
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { setCachedAccessKey } from '../../src/api/client';
import { MIN_PASSWORD_LENGTH } from '../../src/lib/password';
import { loadAccessKey, saveAccessKey } from '../../src/store/accessKey';
import {
  getSessionEmail,
  isSupabaseConfigured,
  signIn,
  signOut,
  signUp,
  subscribeSession,
  updatePassword,
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

const SUPPORT_EMAIL = 'eric2umeh@gmail.com';
const DEVELOPER_EMAILS = new Set(['eric2umeh@gmail.com']);

type Section = 'home' | 'details' | 'password' | 'settings';

export default function AccountScreen() {
  const router = useRouter();
  const [section, setSection] = useState<Section>('home');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [bankroll, setBankroll] = useState('50000');
  const [unitPct, setUnitPct] = useState('1');
  const [pickMarket, setPickMarket] = useState<'double_chance' | '1x2'>('double_chance');
  const [accessKey, setAccessKey] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusBad, setStatusBad] = useState(false);

  const showDeveloperTools = useMemo(() => {
    if (__DEV__) return true;
    const em = (sessionEmail || '').trim().toLowerCase();
    return Boolean(em && DEVELOPER_EMAILS.has(em));
  }, [sessionEmail]);

  function flash(msg: string, bad = false) {
    setStatus(msg);
    setStatusBad(bad);
  }

  const loadMe = useCallback(async () => {
    const [s, key] = await Promise.all([loadSettings(), loadAccessKey()]);
    setSettings(s);
    setBankroll(String(s.bankroll));
    setUnitPct(String(s.unitPct));
    setPickMarket(s.pickMarket);
    setAccessKey(key);
    setCachedAccessKey(key || null);
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    setSessionEmail(getSessionEmail());
    return subscribeSession(() => setSessionEmail(getSessionEmail()));
  }, []);

  async function onPullRefresh() {
    setPulling(true);
    try {
      await loadMe();
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

  async function onSaveSettings() {
    const next = parsedSettings();
    await saveSettings(next);
    if (showDeveloperTools) {
      await saveAccessKey(accessKey);
      setCachedAccessKey(accessKey.trim() || null);
    }
    setSettings(next);
    flash(`Saved · unit stake ≈ ₦${unitStakeNgn(next)}`);
  }

  async function onSignIn() {
    if (!isSupabaseConfigured()) {
      flash('Sign in is not configured in this build.', true);
      return;
    }
    flash('Signing in…');
    setAuthBusy(true);
    try {
      await signIn(email, password);
      flash(`Signed in as ${getSessionEmail() || email}.`);
      setPassword('');
      setSection('home');
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setAuthBusy(false);
    }
  }

  async function onSignUp() {
    if (!isSupabaseConfigured()) {
      flash('Sign up is not configured in this build.', true);
      return;
    }
    flash('Creating account…');
    setAuthBusy(true);
    try {
      const session = await signUp(email, password);
      flash(
        session
          ? `Signed up as ${getSessionEmail() || email}.`
          : 'Account created. Check your email to confirm, then sign in.'
      );
      setPassword('');
      setSection('home');
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setAuthBusy(false);
    }
  }

  async function onSignOut() {
    setAuthBusy(true);
    try {
      await signOut();
      flash('Signed out.');
      setSection('home');
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setAuthBusy(false);
    }
  }

  async function onChangePassword() {
    setAuthBusy(true);
    try {
      await updatePassword(newPassword);
      setNewPassword('');
      flash('Password updated.');
      setSection('home');
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setAuthBusy(false);
    }
  }

  function MenuRow({
    icon,
    title,
    subtitle,
    onPress,
    danger,
  }: {
    icon: ComponentProps<typeof FontAwesome>['name'];
    title: string;
    subtitle?: string;
    onPress: () => void;
    danger?: boolean;
  }) {
    return (
      <Pressable style={styles.menuRow} onPress={onPress}>
        <View style={[styles.menuIcon, danger && styles.menuIconDanger]}>
          <FontAwesome name={icon} size={16} color={danger ? colors.bad : colors.accent} />
        </View>
        <View style={styles.menuText}>
          <Text style={[styles.menuTitle, danger && { color: colors.bad }]}>{title}</Text>
          {subtitle ? <Text style={styles.menuSub}>{subtitle}</Text> : null}
        </View>
        <FontAwesome name="chevron-right" size={12} color={colors.muted} />
      </Pressable>
    );
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
        <RefreshControl refreshing={pulling} onRefresh={onPullRefresh} tintColor={colors.accent} />
      }
    >
      {status ? (
        <View style={[styles.statusBox, statusBad && styles.statusBad]}>
          {authBusy ? (
            <ActivityIndicator color={statusBad ? colors.bad : colors.accent} style={{ marginRight: 8 }} />
          ) : null}
          <Text style={[styles.statusText, statusBad && styles.statusTextBad]}>{status}</Text>
        </View>
      ) : null}

      {section === 'home' ? (
        <>
          <View style={styles.card}>
            <Text style={styles.section}>Account</Text>
            {sessionEmail ? (
              <Text style={styles.muted}>Signed in as {sessionEmail}</Text>
            ) : (
              <>
                <Text style={styles.hint}>Sign in to keep tips synced to your email.</Text>
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
                <Text style={styles.label}>Password (min {MIN_PASSWORD_LENGTH})</Text>
                <PasswordInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder={`at least ${MIN_PASSWORD_LENGTH} characters`}
                  placeholderTextColor={colors.muted}
                />
                <View style={styles.row}>
                  <Pressable
                    style={[styles.btn, styles.btnFlex, authBusy && styles.btnDisabled]}
                    disabled={authBusy}
                    onPress={() => void onSignIn()}
                  >
                    <Text style={styles.btnText}>Sign in</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.btnSecondary, styles.btnFlex, authBusy && styles.btnDisabled]}
                    disabled={authBusy}
                    onPress={() => void onSignUp()}
                  >
                    <Text style={styles.btnSecondaryText}>Sign up</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>

          <View style={styles.card}>
            {sessionEmail ? (
              <MenuRow
                icon="id-card"
                title="Account details"
                subtitle={sessionEmail}
                onPress={() => setSection('details')}
              />
            ) : null}
            {sessionEmail ? (
              <MenuRow
                icon="lock"
                title="Change password"
                onPress={() => setSection('password')}
              />
            ) : null}
            <MenuRow
              icon="sliders"
              title="Settings"
              subtitle="Bankroll, unit %, Safe pick style"
              onPress={() => setSection('settings')}
            />
            <MenuRow
              icon="envelope"
              title="Contact / Support"
              subtitle={SUPPORT_EMAIL}
              onPress={() =>
                void Linking.openURL(
                  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Bet Scanner support')}`
                )
              }
            />
            <MenuRow
              icon="question-circle"
              title="FAQ"
              subtitle="Help & how-to"
              onPress={() => router.push('/help')}
            />
            <MenuRow
              icon="info-circle"
              title="About"
              subtitle={`v${Constants.expoConfig?.version ?? '1.0.0'} · com.betscanner.app`}
              onPress={() => void Linking.openURL('https://bet-scanner-znvg.onrender.com/privacy')}
            />
            <MenuRow
              icon="shield"
              title="Privacy policy"
              onPress={() => void Linking.openURL('https://bet-scanner-znvg.onrender.com/privacy')}
            />
          </View>

          {sessionEmail ? (
            <Pressable
              style={[styles.signOutBtn, authBusy && styles.btnDisabled]}
              disabled={authBusy}
              onPress={() => void onSignOut()}
            >
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {section === 'details' ? (
        <View style={styles.card}>
          <Pressable onPress={() => setSection('home')} style={styles.backLink}>
            <Text style={styles.backLinkText}>← Account</Text>
          </Pressable>
          <Text style={styles.section}>Account details</Text>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.muted}>{sessionEmail}</Text>
          <Text style={styles.hint}>Tips you log are saved under this account.</Text>
        </View>
      ) : null}

      {section === 'password' ? (
        <View style={styles.card}>
          <Pressable onPress={() => setSection('home')} style={styles.backLink}>
            <Text style={styles.backLinkText}>← Account</Text>
          </Pressable>
          <Text style={styles.section}>Change password</Text>
          <Text style={styles.label}>New password (min {MIN_PASSWORD_LENGTH})</Text>
          <PasswordInput
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder={`at least ${MIN_PASSWORD_LENGTH} characters`}
            placeholderTextColor={colors.muted}
          />
          <Pressable
            style={[styles.btn, authBusy && styles.btnDisabled]}
            disabled={authBusy}
            onPress={() => void onChangePassword()}
          >
            <Text style={styles.btnText}>Update password</Text>
          </Pressable>
        </View>
      ) : null}

      {section === 'settings' ? (
        <View style={styles.card}>
          <Pressable onPress={() => setSection('home')} style={styles.backLink}>
            <Text style={styles.backLinkText}>← Account</Text>
          </Pressable>
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
          {showDeveloperTools ? (
            <>
              <Text style={styles.label}>App access key (developer)</Text>
              <Text style={styles.hint}>
                Only visible to the developer account. Matches APP_API_KEY on the server.
              </Text>
              <PasswordInput
                value={accessKey}
                onChangeText={setAccessKey}
                placeholder="Paste access key"
                placeholderTextColor={colors.muted}
              />
            </>
          ) : null}
          <Pressable style={styles.btn} onPress={() => void onSaveSettings()}>
            <Text style={styles.btnText}>Save settings</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  muted: { color: colors.muted, marginTop: 6, fontSize: 13, lineHeight: 18 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18, marginBottom: 4 },
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
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  section: { color: colors.ink, fontWeight: '800', fontSize: 16, marginBottom: 8 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnFlex: { flex: 1 },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  btnSecondary: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: '#06241c', fontWeight: '800', fontSize: 14 },
  btnSecondaryText: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  chip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  chipText: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  chipTextOn: { color: colors.accent },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIconDanger: { backgroundColor: 'rgba(239, 107, 107, 0.12)' },
  menuText: { flex: 1, minWidth: 0 },
  menuTitle: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  menuSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  signOutBtn: {
    marginTop: 8,
    marginBottom: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.bad,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: { color: colors.bad, fontWeight: '800', fontSize: 15 },
  backLink: { marginBottom: 8 },
  backLinkText: { color: colors.accent, fontWeight: '700', fontSize: 14 },
});
