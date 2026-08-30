import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  createTipster,
  fetchCodes,
  fetchTipsterLeaderboard,
  fetchTipsters,
  logBookingCode,
  settleBookingCode,
  type BookingCode,
  type LeaderboardRow,
  type Tipster,
} from '../api/tipsters';
import { bookLabel } from '../lib/tipKey';
import { colors } from '../theme/colors';

const SETTLE = [
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'void', label: 'Void' },
  { value: 'pending', label: 'Pend' },
];

type Props = {
  active: boolean;
  onFlash?: (msg: string, bad?: boolean) => void;
};

function resultColor(result: string) {
  const r = (result || '').toLowerCase();
  if (r === 'won') return colors.good;
  if (r === 'lost') return colors.bad;
  if (r === 'pending') return colors.warn;
  return colors.muted;
}

export function TipstersPanel({ active, onFlash }: Props) {
  const [tipsters, setTipsters] = useState<Tipster[]>([]);
  const [codes, setCodes] = useState<BookingCode[]>([]);
  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusBad, setStatusBad] = useState(false);
  const [settlingId, setSettlingId] = useState<number | null>(null);

  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [platform, setPlatform] = useState('instagram');

  const [tipsterId, setTipsterId] = useState<number | null>(null);
  const [codeText, setCodeText] = useState('');
  const [bookmaker, setBookmaker] = useState<'sportybet' | 'bet9ja'>('sportybet');
  const [stake, setStake] = useState('');
  const [odds, setOdds] = useState('');
  const [notes, setNotes] = useState('');

  function flash(msg: string, bad = false) {
    setStatus(msg);
    setStatusBad(bad);
    onFlash?.(msg, bad);
  }

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [t, c, lb] = await Promise.all([
        fetchTipsters(80),
        fetchCodes({ limit: 40 }),
        fetchTipsterLeaderboard(1).catch(() => ({ leaderboard: [] as LeaderboardRow[] })),
      ]);
      setTipsters(t);
      setCodes(c);
      setBoard(lb.leaderboard || []);
      flash(
        t.length
          ? `${t.length} tipster(s) · ${c.length} recent code(s)`
          : 'No tipsters yet — add one below.'
      );
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void refresh();
  }, [active, refresh]);

  useEffect(() => {
    if (tipsterId == null && tipsters.length) setTipsterId(tipsters[0].id);
  }, [tipsters, tipsterId]);

  const selectedTipster = useMemo(
    () => tipsters.find((t) => t.id === tipsterId) || null,
    [tipsters, tipsterId]
  );

  async function onAddTipster() {
    const n = name.trim();
    if (!n) {
      flash('Enter a tipster name.', true);
      return;
    }
    setBusy(true);
    try {
      const t = await createTipster({
        name: n,
        handle: handle.trim() || null,
        platform: platform.trim() || null,
      });
      setName('');
      setHandle('');
      setTipsterId(t.id);
      flash(`Added tipster ${t.name}.`);
      await refresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }

  async function onLogCode() {
    if (!tipsterId) {
      flash('Select or add a tipster first.', true);
      return;
    }
    const code = codeText.trim();
    if (!code) {
      flash('Paste the booking code.', true);
      return;
    }
    setBusy(true);
    try {
      const stakeN = Number(stake);
      const oddsN = Number(odds);
      const data = await logBookingCode({
        tipster_id: tipsterId,
        code_text: code,
        bookmaker,
        stake_ngn: Number.isFinite(stakeN) && stakeN > 0 ? stakeN : null,
        odds_price: Number.isFinite(oddsN) && oddsN > 1 ? oddsN : null,
        notes: notes.trim() || null,
      });
      setCodeText('');
      setNotes('');
      flash(data.message || 'Code logged.');
      await refresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }

  async function onSettle(codeId: number, result: string) {
    setSettlingId(codeId);
    try {
      await settleBookingCode(codeId, result);
      flash(`Code #${codeId} marked ${result}.`);
      await refresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setSettlingId(null);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>Tipsters / booking codes</Text>
      <Text style={styles.muted}>
        Instagram / Telegram codes → settle → leaderboard. We store the code — we cannot open
        opaque SportyBet / Bet9ja slips automatically.
      </Text>

      {status ? (
        <View style={[styles.statusBox, statusBad && styles.statusBad]}>
          {busy ? (
            <ActivityIndicator
              color={statusBad ? colors.bad : colors.accent}
              style={{ marginRight: 8 }}
            />
          ) : null}
          <Text style={[styles.statusText, statusBad && styles.statusTextBad]}>{status}</Text>
        </View>
      ) : null}

      <Text style={styles.subhead}>Add tipster</Text>
      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Lagos Tips"
        placeholderTextColor={colors.muted}
      />
      <Text style={styles.label}>Handle (optional)</Text>
      <TextInput
        style={styles.input}
        value={handle}
        onChangeText={setHandle}
        placeholder="@lagostips"
        autoCapitalize="none"
        placeholderTextColor={colors.muted}
      />
      <Text style={styles.label}>Platform</Text>
      <View style={styles.row}>
        {['instagram', 'telegram', 'twitter', 'other'].map((p) => (
          <Pressable
            key={p}
            style={[styles.chip, platform === p && styles.chipOn]}
            onPress={() => setPlatform(p)}
          >
            <Text style={[styles.chipText, platform === p && styles.chipTextOn]}>{p}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={[styles.btn, busy && styles.disabled]} disabled={busy} onPress={onAddTipster}>
        <Text style={styles.btnText}>Add tipster</Text>
      </Pressable>

      <Text style={styles.subhead}>Log booking code</Text>
      <Text style={styles.label}>Tipster</Text>
      <View style={styles.row}>
        {tipsters.length ? (
          tipsters.map((t) => (
            <Pressable
              key={t.id}
              style={[styles.chip, tipsterId === t.id && styles.chipOn]}
              onPress={() => setTipsterId(t.id)}
            >
              <Text style={[styles.chipText, tipsterId === t.id && styles.chipTextOn]}>
                {t.name}
              </Text>
            </Pressable>
          ))
        ) : (
          <Text style={styles.muted}>Add a tipster first.</Text>
        )}
      </View>
      <Text style={styles.label}>Booking code</Text>
      <TextInput
        style={styles.input}
        value={codeText}
        onChangeText={setCodeText}
        autoCapitalize="characters"
        placeholder="ABC123XYZ"
        placeholderTextColor={colors.muted}
      />
      <Text style={styles.label}>Bookmaker</Text>
      <View style={styles.row}>
        {(['sportybet', 'bet9ja'] as const).map((b) => (
          <Pressable
            key={b}
            style={[styles.chip, bookmaker === b && styles.chipOn]}
            onPress={() => setBookmaker(b)}
          >
            <Text style={[styles.chipText, bookmaker === b && styles.chipTextOn]}>
              {bookLabel(b)}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={[styles.btn, busy && styles.disabled]} disabled={busy} onPress={onLogCode}>
        <Text style={styles.btnText}>Log code</Text>
      </Pressable>

      {board.length ? (
        <View style={styles.innerCard}>
          <Text style={styles.subhead}>Leaderboard</Text>
          {board.slice(0, 6).map((row, i) => (
            <Text key={`${row.tipster_id || i}`} style={styles.boardRow}>
              {i + 1}. {String(row.name || '—')}
              {row.hit_rate_pct != null ? ` · ${row.hit_rate_pct}% hit` : ''}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={styles.subhead}>Recent codes</Text>
      {!codes.length ? (
        <Text style={styles.muted}>No codes yet.</Text>
      ) : (
        codes.slice(0, 12).map((c) => (
          <View key={c.id} style={styles.innerCard}>
            <Text style={styles.cardTitle}>
              {c.tipster_name} · {c.code_text}
            </Text>
            <Text style={styles.meta}>
              {bookLabel(c.bookmaker)}
              {c.odds_price != null ? ` · @${c.odds_price}` : ''}
            </Text>
            <Text style={[styles.result, { color: resultColor(c.result) }]}>
              {(c.result || 'pending').toUpperCase()}
            </Text>
            <View style={styles.settleRow}>
              {SETTLE.map((opt) => {
                const on = (c.result || '').toLowerCase() === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[
                      styles.settleBtn,
                      on && styles.settleBtnOn,
                      settlingId === c.id && styles.disabled,
                    ]}
                    disabled={settlingId === c.id || busy}
                    onPress={() => onSettle(c.id, opt.value)}
                  >
                    <Text style={[styles.settleBtnText, on && styles.settleBtnTextOn]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))
      )}

      <Pressable
        style={[styles.btnSecondary, busy && styles.disabled]}
        disabled={busy}
        onPress={() => void refresh()}
      >
        <Text style={styles.btnSecondaryText}>Refresh tipsters</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, gap: 4 },
  section: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  subhead: { color: colors.ink, fontSize: 14, fontWeight: '700', marginTop: 12 },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 17 },
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
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
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
    marginTop: 10,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { color: '#06241c', fontWeight: '700' },
  btnSecondary: {
    marginTop: 10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnSecondaryText: { color: colors.ink, fontWeight: '600' },
  disabled: { opacity: 0.55 },
  innerCard: {
    marginTop: 8,
    backgroundColor: colors.bg,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  boardRow: { color: colors.ink, fontSize: 13, lineHeight: 20 },
  cardTitle: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  result: { fontWeight: '700', fontSize: 12, marginTop: 4 },
  settleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  settleBtn: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  settleBtnOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  settleBtnText: { color: colors.muted, fontWeight: '600', fontSize: 12 },
  settleBtnTextOn: { color: colors.accent },
});
