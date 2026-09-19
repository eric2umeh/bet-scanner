import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Clipboard from 'expo-clipboard';

import { userFacingError } from '../api/client';
import {
  convertScoutCode,
  fetchScoutCodes,
  refreshScoutFeed,
  type ScoutConvertResponse,
  type ScoutedCode,
  type ScoutSort,
} from '../api/scout';
import { useIsAdmin } from '../hooks/useIsAdmin';
import { bookLabel } from '../lib/tipKey';
import { loadSettings, saveSettings, type PreferredBook } from '../store/settings';
import { LoadingRadar } from './LoadingRadar';
import { colors } from '../theme/colors';
import { webScrollBottom } from '../theme/webScroll';

const SORT_OPTS: { value: ScoutSort; label: string }[] = [
  { value: 'odds_desc', label: 'Odds ↓' },
  { value: 'odds_asc', label: 'Odds ↑' },
  { value: 'folds_desc', label: 'Folds ↓' },
  { value: 'folds_asc', label: 'Folds ↑' },
  { value: 'date_desc', label: 'Newest' },
  { value: 'date_asc', label: 'Oldest' },
];

const RISK_OPTS = [
  { value: 'all', label: 'All risk' },
  { value: 'good', label: 'Good only' },
  { value: 'safer', label: 'Safer' },
  { value: 'stretch', label: 'Stretch' },
  { value: 'lottery', label: 'Lottery' },
];

function riskColor(band: string) {
  const b = (band || '').toLowerCase();
  if (b === 'safer') return colors.good;
  if (b === 'stretch') return colors.warn;
  if (b === 'lottery') return colors.bad;
  return colors.muted;
}

function confColor(pct: number | null | undefined, verification?: string | null) {
  if (pct == null || (verification || '') === 'unverified') return colors.muted;
  if (pct >= 65) return colors.good;
  if (pct >= 45) return colors.warn;
  return colors.bad;
}

function fmtOdds(v: number | string | null | undefined) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(n >= 100 ? 0 : 2) : String(v);
}

function whenLabel(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function confidenceLine(row: ScoutedCode) {
  const label = (row.confidence_label || '').trim();
  const pct = row.confidence_pct;
  const v = (row.verification || 'unverified').toLowerCase();
  if (v === 'unverified' || pct == null) {
    return label || 'Unverified — copy only.';
  }
  const base = `${Math.round(Number(pct))}%`;
  return label ? `${base} · ${label}` : `${base} confidence`;
}

function severityColor(sev: string) {
  const s = (sev || '').toLowerCase();
  if (s === 'high') return colors.bad;
  if (s === 'medium') return colors.warn;
  return colors.muted;
}

type FilterDraft = {
  bookmaker: PreferredBook;
  sort: ScoutSort;
  risk: string;
};

type Props = {
  bookmaker: PreferredBook;
  onBookChange?: (b: PreferredBook) => void;
};

function ChipRow<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.filterBlock}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {options.map((o) => (
          <Pressable
            key={String(o.value)}
            style={[styles.chip, value === o.value && styles.chipOn]}
            onPress={() => onChange(o.value)}
          >
            <Text style={[styles.chipText, value === o.value && styles.chipTextOn]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function CodeScoutPanel({ bookmaker, onBookChange }: Props) {
  const isAdmin = useIsAdmin();
  const [codes, setCodes] = useState<ScoutedCode[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusBad, setStatusBad] = useState(false);
  const [sort, setSort] = useState<ScoutSort>('odds_desc');
  const [risk, setRisk] = useState('all');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [editsOpenId, setEditsOpenId] = useState<number | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertBusy, setConvertBusy] = useState(false);
  const [convertResult, setConvertResult] = useState<ScoutConvertResponse | null>(null);
  const [draft, setDraft] = useState<FilterDraft>({
    bookmaker,
    sort: 'odds_desc',
    risk: 'all',
  });

  const load = useCallback(async () => {
    setBusy(true);
    setStatusBad(false);
    try {
      const data = await fetchScoutCodes({
        bookmaker,
        sort,
        risk_band: risk,
        refresh_if_empty: true,
      });
      setCodes(data.codes || []);
      setStatus(null);
    } catch (e) {
      setStatus(userFacingError(e));
      setStatusBad(true);
    } finally {
      setBusy(false);
    }
  }, [bookmaker, sort, risk]);

  useEffect(() => {
    void load();
  }, [load]);

  const filterSummary = useMemo(() => {
    const sortL = SORT_OPTS.find((o) => o.value === sort)?.label ?? sort;
    const riskL = RISK_OPTS.find((o) => o.value === risk)?.label ?? risk;
    return `${bookLabel(bookmaker)} · Today+ · ${sortL} · ${riskL}`;
  }, [bookmaker, sort, risk]);

  function openFilters() {
    setDraft({ bookmaker, sort, risk });
    setFilterOpen(true);
  }

  function applyFilters() {
    onBookChange?.(draft.bookmaker);
    setSort(draft.sort);
    setRisk(draft.risk);
    setFilterOpen(false);
  }

  async function onAdminRefresh() {
    setBusy(true);
    try {
      await refreshScoutFeed();
      setStatus(null);
      setStatusBad(false);
      await load();
    } catch (e) {
      setStatus(userFacingError(e));
      setStatusBad(true);
      setBusy(false);
    }
  }

  async function onCopy(row: ScoutedCode) {
    try {
      await Clipboard.setStringAsync(row.code_text);
      setCopiedId(row.id);
      setStatus(`Copied ${row.code_text} — paste into ${bookLabel(bookmaker)}.`);
      setStatusBad(false);
      setTimeout(() => setCopiedId((id) => (id === row.id ? null : id)), 2000);
    } catch (e) {
      setStatus(userFacingError(e));
      setStatusBad(true);
    }
  }

  async function onOpenHub(row: ScoutedCode) {
    const url =
      row.hub_url ||
      (bookmaker === 'sportybet'
        ? `https://www.sportybet.com/ng/?shareCode=${encodeURIComponent(row.code_text)}&c=ng`
        : 'https://www.bet9ja.com/');
    try {
      await Linking.openURL(url);
    } catch (e) {
      setStatus(userFacingError(e));
      setStatusBad(true);
    }
  }

  async function onConvert(row: ScoutedCode) {
    const target = row.convert_target || (bookmaker === 'sportybet' ? 'bet9ja' : 'sportybet');
    setConvertBusy(true);
    setConvertResult(null);
    setConvertOpen(true);
    try {
      const res = await convertScoutCode(row.id, target);
      setConvertResult(res);
    } catch (e) {
      setConvertResult({
        convertible: false,
        source_book: bookmaker,
        target_book: target,
        code_text: row.code_text,
        matched_count: 0,
        place_summary: '',
        message: userFacingError(e),
      });
    } finally {
      setConvertBusy(false);
    }
  }

  async function onCopyConvertSummary() {
    if (!convertResult?.place_summary) return;
    try {
      await Clipboard.setStringAsync(convertResult.place_summary);
      setStatus('Convert plan copied.');
      setStatusBad(false);
    } catch (e) {
      setStatus(userFacingError(e));
      setStatusBad(true);
    }
  }

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          Platform.OS === 'web' ? { paddingBottom: webScrollBottom(24) } : null,
        ]}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void load()} />}
      >
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Code Scout</Text>
        </View>

        <Pressable style={styles.filterBtn} onPress={openFilters}>
          <FontAwesome name="filter" size={14} color={colors.accent} style={{ marginRight: 8 }} />
          <View style={styles.filterBtnText}>
            <Text style={styles.filterBtnTitle}>Filters</Text>
            <Text style={styles.filterBtnSummary} numberOfLines={1}>
              {filterSummary}
            </Text>
          </View>
          <FontAwesome name="chevron-down" size={12} color={colors.muted} />
        </Pressable>

        {statusBad && status ? (
          <View style={[styles.statusBox, styles.statusBad]}>
            {busy ? (
              <LoadingRadar color={colors.bad} style={{ marginRight: 8 }} />
            ) : null}
            <Text style={[styles.statusText, styles.statusTextBad]}>{status}</Text>
          </View>
        ) : null}

        {isAdmin ? (
          <Pressable
            style={[styles.btnSecondary, busy && styles.disabled]}
            disabled={busy}
            onPress={() => void onAdminRefresh()}
          >
            <Text style={styles.btnSecondaryText}>Refresh from web sources</Text>
          </Pressable>
        ) : null}

        {busy && !codes.length ? (
          <View style={styles.loadingBlock}>
            <LoadingRadar />
            <Text style={styles.muted}>Scouting codes…</Text>
          </View>
        ) : null}

        {!busy && !codes.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No codes in this filter</Text>
            <Text style={styles.emptyText}>
              {bookmaker === 'bet9ja'
                ? 'Bet9ja codes come mainly from SureCodes24 + tipster tweets. Pull to refresh, or ask an admin to tap Refresh from web sources. Official @Bet9ja Twitter rarely posts booking codes.'
                : 'Pull down to refresh. If still empty, ask an admin to tap Refresh from web sources.'}
            </Text>
          </View>
        ) : null}

        {codes.map((row) => (
          <View key={row.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.code}>{row.code_text}</Text>
              <Text style={[styles.band, { color: riskColor(row.risk_band) }]}>
                {(row.risk_band || 'unknown').toUpperCase()}
              </Text>
            </View>
            <Text
              style={[
                styles.confLine,
                { color: confColor(row.confidence_pct, row.verification) },
              ]}
            >
              {confidenceLine(row)}
            </Text>
            <Text style={styles.meta}>
              @{fmtOdds(row.combined_odds)}
              {row.folds != null ? ` · ${row.folds} folds` : ''}
              {row.source_label ? ` · ${row.source_label}` : ` · ${row.source}`}
              {whenLabel(row.scouted_at) ? ` · ${whenLabel(row.scouted_at)}` : ''}
            </Text>
            {row.title ? <Text style={styles.titleLine}>{row.title}</Text> : null}
            {(row.safety_edits?.length ?? 0) > 0 ? (
              <View style={styles.editsBlock}>
                <Pressable
                  style={styles.editsToggle}
                  onPress={() =>
                    setEditsOpenId((id) => (id === row.id ? null : row.id))
                  }
                >
                  <Text style={styles.editsToggleText}>
                    {row.safety_summary ||
                      `${row.safety_edits!.length} safety edit${row.safety_edits!.length === 1 ? '' : 's'}`}
                  </Text>
                  <FontAwesome
                    name={editsOpenId === row.id ? 'chevron-up' : 'chevron-down'}
                    size={11}
                    color={colors.accent}
                  />
                </Pressable>
                {editsOpenId === row.id
                  ? row.safety_edits!.map((ed, i) => (
                      <View key={`${ed.kind}-${i}`} style={styles.editRow}>
                        <Text style={[styles.editSev, { color: severityColor(ed.severity) }]}>
                          {(ed.severity || 'medium').toUpperCase()}
                        </Text>
                        <Text style={styles.editTitle}>{ed.title}</Text>
                        <Text style={styles.editDetail}>{ed.detail}</Text>
                      </View>
                    ))
                  : null}
              </View>
            ) : null}
            <View style={styles.actions}>
              <Pressable
                style={[styles.btn, copiedId === row.id && styles.btnDone]}
                onPress={() => void onCopy(row)}
              >
                <Text style={styles.btnText}>{copiedId === row.id ? 'Copied' : 'Copy code'}</Text>
              </Pressable>
              <Pressable style={styles.btnGhost} onPress={() => void onOpenHub(row)}>
                <Text style={styles.btnGhostText}>Open book</Text>
              </Pressable>
            </View>
            {row.convertible ? (
              <Pressable
                style={[styles.btnConvert, convertBusy && styles.disabled]}
                disabled={convertBusy}
                onPress={() => void onConvert(row)}
              >
                <Text style={styles.btnConvertText}>
                  Convert to {bookLabel(row.convert_target || (bookmaker === 'sportybet' ? 'bet9ja' : 'sportybet'))}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </ScrollView>

      <Modal
        visible={filterOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setFilterOpen(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Filters</Text>
              <Pressable
                onPress={() => setFilterOpen(false)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close filters"
              >
                <Text style={styles.modalClose}>×</Text>
              </Pressable>
            </View>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <ChipRow
                label="Bookmaker"
                options={[
                  { value: 'sportybet' as PreferredBook, label: bookLabel('sportybet') },
                  { value: 'bet9ja' as PreferredBook, label: bookLabel('bet9ja') },
                ]}
                value={draft.bookmaker}
                onChange={(v) => setDraft((d) => ({ ...d, bookmaker: v }))}
              />
              <ChipRow
                label="Sort"
                options={SORT_OPTS}
                value={draft.sort}
                onChange={(v) => setDraft((d) => ({ ...d, sort: v }))}
              />
              <ChipRow
                label="Risk band"
                options={RISK_OPTS}
                value={draft.risk}
                onChange={(v) => setDraft((d) => ({ ...d, risk: v }))}
              />
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setFilterOpen(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalApply} onPress={applyFilters}>
                <Text style={styles.modalApplyText}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={convertOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setConvertOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setConvertOpen(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Cross-book convert</Text>
              <Pressable onPress={() => setConvertOpen(false)} hitSlop={8}>
                <Text style={styles.modalClose}>×</Text>
              </Pressable>
            </View>
            {convertBusy ? (
              <View style={styles.convertLoading}>
                <LoadingRadar />
                <Text style={styles.muted}>Pricing legs on the other book…</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
              >
                <Text style={styles.convertMsg}>{convertResult?.message}</Text>
                {convertResult?.combined_target != null ? (
                  <Text style={styles.convertCombo}>
                    Combined {bookLabel(convertResult.target_book)} ~{' '}
                    {fmtOdds(convertResult.combined_target)}
                  </Text>
                ) : null}
                {convertResult?.place_summary ? (
                  <Text style={styles.convertSummary}>{convertResult.place_summary}</Text>
                ) : null}
              </ScrollView>
            )}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setConvertOpen(false)}>
                <Text style={styles.modalCancelText}>Close</Text>
              </Pressable>
              {convertResult?.place_summary ? (
                <Pressable style={styles.modalApply} onPress={() => void onCopyConvertSummary()}>
                  <Text style={styles.modalApplyText}>Copy plan</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

/** Screen wrapper that loads preferred book from settings. */
export function CodeScoutScreenBody() {
  const [book, setBook] = useState<PreferredBook>('sportybet');

  useEffect(() => {
    void loadSettings().then((s) => setBook(s.preferredBook));
  }, []);

  return (
    <CodeScoutPanel
      bookmaker={book}
      onBookChange={(b) => {
        setBook(b);
        void loadSettings().then((s) => saveSettings({ ...s, preferredBook: b }));
      }}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40, gap: 4 },
  hero: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    marginBottom: 8,
  },
  heroTitle: { color: colors.ink, fontWeight: '800', fontSize: 16 },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
  },
  filterBtnText: { flex: 1, minWidth: 0 },
  filterBtnTitle: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  filterBtnSummary: { color: colors.muted, fontSize: 12, marginTop: 2 },
  filterBlock: { marginBottom: 8 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '600', marginTop: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
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
  loadingBlock: { marginTop: 28, alignItems: 'center', gap: 10 },
  muted: { color: colors.muted, fontSize: 13 },
  empty: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 14,
    backgroundColor: colors.card,
  },
  emptyTitle: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  card: {
    marginTop: 10,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  code: { color: colors.ink, fontWeight: '800', fontSize: 18, letterSpacing: 1 },
  band: { fontWeight: '800', fontSize: 11 },
  confLine: { fontSize: 12, fontWeight: '600', marginTop: 4, marginBottom: 2 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  titleLine: { color: colors.ink, fontSize: 13, marginTop: 2 },
  editsBlock: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
  },
  editsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 4,
  },
  editsToggleText: { color: colors.accent, fontWeight: '700', fontSize: 12, flex: 1 },
  editRow: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  editSev: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  editTitle: { color: colors.ink, fontWeight: '700', fontSize: 13, marginTop: 2 },
  editDetail: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  btnDone: { backgroundColor: colors.good },
  btnText: { color: colors.onAccent, fontWeight: '700' },
  btnGhost: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  btnGhostText: { color: colors.ink, fontWeight: '600', fontSize: 13 },
  btnConvert: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentDim,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnConvertText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  convertLoading: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  convertMsg: { color: colors.ink, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  convertCombo: { color: colors.accent, fontWeight: '800', fontSize: 15, marginTop: 10 },
  convertSummary: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
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
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalSheet: {
    backgroundColor: colors.bg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 14,
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    zIndex: 1,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: { color: colors.ink, fontWeight: '800', fontSize: 18 },
  modalClose: { color: colors.muted, fontSize: 28, lineHeight: 28, fontWeight: '400' },
  modalScroll: { flexGrow: 0 },
  modalScrollContent: { paddingBottom: 12 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancel: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalCancelText: { color: colors.ink, fontWeight: '600' },
  modalApply: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: colors.accent,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalApplyText: { color: colors.onAccent, fontWeight: '700' },
});
