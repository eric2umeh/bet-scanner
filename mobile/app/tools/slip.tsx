import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  convertSlip,
  type ConvertedLeg,
  type SlipConvertResponse,
} from '../../src/api/convert';
import { shareOrCopyText } from '../../src/lib/shareText';
import { bookLabel } from '../../src/lib/tipKey';
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

export default function SlipToolScreen() {
  const [slipText, setSlipText] = useState('');
  const [codeText, setCodeText] = useState('');
  const [sourceBook, setSourceBook] = useState<'sportybet' | 'bet9ja'>('sportybet');
  const [converting, setConverting] = useState(false);
  const [convertResult, setConvertResult] = useState<SlipConvertResponse | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [statusBad, setStatusBad] = useState(false);

  function flash(msg: string, bad = false) {
    setStatus(msg);
    setStatusBad(bad);
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

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.hero}>
        <Text style={styles.heroText}>
          Paste match names and picks in plain text. We look up saved odds — booking codes alone
          cannot be opened automatically.
        </Text>
      </View>

      {status ? (
        <View style={[styles.statusBox, statusBad && styles.statusBad]}>
          {converting ? (
            <ActivityIndicator color={statusBad ? colors.bad : colors.accent} style={{ marginRight: 8 }} />
          ) : null}
          <Text style={[styles.statusText, statusBad && styles.statusTextBad]}>{status}</Text>
        </View>
      ) : null}

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
      <Text style={styles.label}>Booking code (optional note)</Text>
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
          style={[styles.btn, styles.btnFlex, converting && styles.disabled]}
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
          <Text style={styles.btnSecondaryText}>Copy summary</Text>
        </Pressable>
      </View>

      {convertResult ? (
        <View style={styles.resultBox}>
          <Text style={styles.resultTitle}>{convertResult.message}</Text>
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
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  hero: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    marginBottom: 12,
  },
  heroText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
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
  label: { color: colors.muted, fontSize: 12, fontWeight: '600', marginTop: 8 },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    marginTop: 4,
  },
  textarea: { minHeight: 120, paddingTop: 10 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 10 },
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
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  btnFlex: { flex: 1, minWidth: 120 },
  btnText: { color: '#06241c', fontWeight: '700' },
  btnSecondary: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  btnSecondaryText: { color: colors.ink, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  resultBox: { marginTop: 16, gap: 8 },
  resultTitle: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  combo: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  legCard: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    gap: 2,
  },
  legTitle: { color: colors.ink, fontWeight: '600', fontSize: 14 },
  muted: { color: colors.muted, fontSize: 12 },
  legPrices: { color: colors.ink, fontSize: 12, marginTop: 2 },
});
