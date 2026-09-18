import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { userFacingError } from '../api/client';
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
import { LoadingRadar } from './LoadingRadar';
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

function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return `${Number(n)}%`;
}

export function TipstersPanel({ active, onFlash }: Props) {
  const [tipsters, setTipsters] = useState<Tipster[]>([]);
  const [codes, setCodes] = useState<BookingCode[]>([]);
  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  const [boardNote, setBoardNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusBad, setStatusBad] = useState(false);
  const [settlingId, setSettlingId] = useState<number | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const loadedOnceRef = useRef(false);

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
    setBoardNote(null);
    if (!loadedOnceRef.current) {
      setStatus('Loading your tipsters…');
      setStatusBad(false);
    }
    try {
      const [t, c, lbResult] = await Promise.all([
        fetchTipsters(80),
        fetchCodes({ limit: 40 }),
        fetchTipsterLeaderboard(1)
          .then((lb) => ({ ok: true as const, lb }))
          .catch((e) => ({ ok: false as const, err: userFacingError(e) })),
      ]);
      setTipsters(t);
      setCodes(c);
      if (lbResult.ok) {
        setBoard(lbResult.lb.leaderboard || []);
        setBoardNote(null);
      } else {
        setBoard([]);
        setBoardNote(lbResult.err);
      }
      flash(
        t.length
          ? `${t.length} tipster(s) · ${c.length} recent code(s) · your account`
          : 'No tipsters yet — add one below. They stay on this signed-in account.'
      );
      loadedOnceRef.current = true;
      setLoadedOnce(true);
    } catch (e) {
      flash(userFacingError(e), true);
      loadedOnceRef.current = true;
      setLoadedOnce(true);
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
      flash(userFacingError(e), true);
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
      setStake('');
      setOdds('');
      setNotes('');
      flash(data.message || 'Code logged.');
      await refresh();
    } catch (e) {
      flash(userFacingError(e), true);
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
      flash(userFacingError(e), true);
    } finally {
      setSettlingId(null);
    }
  }

  const showInitialLoad = busy && !loadedOnce;

  return (
    <View style={styles.wrap}>
      {status ? (
        <View style={[styles.statusBox, statusBad && styles.statusBad]}>
          {busy ? (
            <LoadingRadar
              color={statusBad ? colors.bad : colors.accent}
              style={{ marginRight: 8 }}
            />
          ) : null}
          <Text style={[styles.statusText, statusBad && styles.statusTextBad]}>{status}</Text>
        </View>
      ) : null}

      {showInitialLoad ? (
        <View style={styles.loadingBlock}>
          <LoadingRadar />
          <Text style={styles.muted}>Loading your tipsters…</Text>
        </View>
      ) : null}

      {!showInitialLoad ? (
        <>
          <Text style={styles.subhead}>Add tipster</Text>
          <Text style={styles.hint}>Saved to your signed-in account (not shared with other users).</Text>
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
          <Pressable
            style={[styles.btn, busy && styles.disabled]}
            disabled={busy}
            onPress={() => void onAddTipster()}
          >
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
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No tipsters yet</Text>
                <Text style={styles.emptyText}>Add a tipster above, then log their booking codes.</Text>
              </View>
            )}
          </View>
          {selectedTipster ? (
            <Text style={styles.hint}>Logging for {selectedTipster.name}</Text>
          ) : null}
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
          <Text style={styles.label}>Stake ₦ (optional — helps ROI)</Text>
          <TextInput
            style={styles.input}
            value={stake}
            onChangeText={setStake}
            keyboardType="numeric"
            placeholder="e.g. 2000"
            placeholderTextColor={colors.muted}
          />
          <Text style={styles.label}>Odds (optional — helps ROI)</Text>
          <TextInput
            style={styles.input}
            value={odds}
            onChangeText={setOdds}
            keyboardType="decimal-pad"
            placeholder="e.g. 1.85"
            placeholderTextColor={colors.muted}
          />
          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.notes]}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Markets, slip text…"
            placeholderTextColor={colors.muted}
          />
          <Pressable
            style={[styles.btn, busy && styles.disabled]}
            disabled={busy}
            onPress={() => void onLogCode()}
          >
            <Text style={styles.btnText}>Log code</Text>
          </Pressable>

          <View style={styles.innerCard}>
            <Text style={styles.subheadFlush}>Your leaderboard</Text>
            <Text style={styles.hint}>
              Private to this account. Rank uses ROI when stake + odds are logged; otherwise hit rate.
            </Text>
            {boardNote ? <Text style={styles.errorLine}>{boardNote}</Text> : null}
            {!board.length && !boardNote ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No rankings yet</Text>
                <Text style={styles.emptyText}>
                  Log codes with stake and odds when you can, then settle Won / Lost to rank your tipsters.
                </Text>
              </View>
            ) : null}
            {board.slice(0, 8).map((row, i) => {
              const hit = fmtPct(row.hit_rate_pct);
              const roi = fmtPct(row.roi_pct);
              const settled = Number(row.settled) || 0;
              const won = Number(row.won) || 0;
              const pending = Number(row.pending) || 0;
              return (
                <View key={`${row.tipster_id || i}`} style={styles.boardItem}>
                  <Text style={styles.boardRank}>#{i + 1}</Text>
                  <View style={styles.boardBody}>
                    <Text style={styles.boardName}>{String(row.name || '—')}</Text>
                    <Text style={styles.boardMeta}>
                      {won}/{settled} won
                      {hit ? ` · ${hit} hit` : ''}
                      {roi ? ` · ${roi} ROI` : ''}
                      {pending ? ` · ${pending} pending` : ''}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          <Text style={styles.subhead}>Recent codes</Text>
          {!codes.length ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No codes yet</Text>
              <Text style={styles.emptyText}>
                Paste a booking code above. Settle results when you know the outcome.
              </Text>
            </View>
          ) : (
            codes.slice(0, 12).map((c) => (
              <View key={c.id} style={styles.innerCard}>
                <Text style={styles.cardTitle}>
                  {c.tipster_name} · {c.code_text}
                </Text>
                <Text style={styles.meta}>
                  {bookLabel(c.bookmaker)}
                  {c.stake_ngn != null ? ` · ₦${c.stake_ngn}` : ''}
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
                        onPress={() => void onSettle(c.id, opt.value)}
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
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, gap: 4 },
  subhead: { color: colors.ink, fontSize: 14, fontWeight: '700', marginTop: 12 },
  subheadFlush: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  errorLine: { color: colors.bad, fontSize: 12, marginTop: 6, fontWeight: '600' },
  loadingBlock: {
    marginTop: 24,
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
  },
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
  notes: { minHeight: 64, textAlignVertical: 'top' },
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
  btnText: { color: colors.onAccent, fontWeight: '700' },
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
  empty: {
    marginTop: 8,
    width: '100%',
    backgroundColor: colors.bg,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  emptyTitle: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  emptyText: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  innerCard: {
    marginTop: 8,
    backgroundColor: colors.bg,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  boardItem: { flexDirection: 'row', gap: 10, marginTop: 8, alignItems: 'flex-start' },
  boardRank: { color: colors.accent, fontWeight: '800', fontSize: 13, width: 28 },
  boardBody: { flex: 1 },
  boardName: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  boardMeta: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
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
