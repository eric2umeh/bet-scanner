import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { bookLabel, marketLabel } from '../lib/tipKey';
import { formatMatchTitle } from '../lib/matchDisplay';
import { WEB_TAB_BAR_HEIGHT } from '../theme/layout';
import {
  clearSelection,
  combinedSelectionOdds,
  getSelectedCount,
  getSelectedTips,
  subscribeSelection,
  toggleTip,
} from '../store/selection';
import { colors } from '../theme/colors';
import type { TipPick } from '../types/api';

type Props = {
  asMulti: boolean;
  onAsMultiChange: (v: boolean) => void;
  onLog: () => void;
  busy?: boolean;
};

type FabEdge = 'left' | 'right';

type FabPos = {
  edge: FabEdge;
  bottom: number;
};

const FAB_SIZE = 56;
const FAB_MARGIN = 16;
const POS_KEY = 'bet_slip_fab_pos_v1';
const DRAG_THRESHOLD = 10;
const isWeb = Platform.OS === 'web';

function defaultBottom(insetsBottom: number): number {
  const tabClearance = isWeb ? WEB_TAB_BAR_HEIGHT + 12 : 72;
  return Math.max(insetsBottom, 0) + tabClearance;
}

export function BetSlipFab({ asMulti, onAsMultiChange, onLog, busy }: Props) {
  const insets = useSafeAreaInsets();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [tips, setTips] = useState<TipPick[]>([]);
  const [combo, setCombo] = useState(0);
  const [pos, setPos] = useState<FabPos>(() => ({
    edge: 'right',
    bottom: defaultBottom(insets.bottom),
  }));
  const dragY = useRef(0);
  const moved = useRef(false);
  const startPos = useRef<FabPos | null>(null);
  const posRef = useRef(pos);
  const busyRef = useRef(!!busy);
  posRef.current = pos;
  busyRef.current = !!busy;

  useEffect(
    () =>
      subscribeSelection(() => {
        setCount(getSelectedCount());
        setTips(getSelectedTips());
        setCombo(combinedSelectionOdds());
      }),
    []
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(POS_KEY);
        if (!raw || cancelled) return;
        const saved = JSON.parse(raw) as FabPos;
        if (saved?.edge && typeof saved.bottom === 'number') {
          setPos({ edge: saved.edge, bottom: Math.max(defaultBottom(insets.bottom), saved.bottom) });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [insets.bottom]);

  const savePos = useCallback(async (next: FabPos) => {
    setPos(next);
    await AsyncStorage.setItem(POS_KEY, JSON.stringify(next));
  }, []);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > DRAG_THRESHOLD || Math.abs(g.dy) > DRAG_THRESHOLD,
      onPanResponderGrant: () => {
        moved.current = false;
        startPos.current = { ...posRef.current };
        dragY.current = 0;
      },
      onPanResponderMove: (_, g) => {
        if (Math.abs(g.dx) > DRAG_THRESHOLD || Math.abs(g.dy) > DRAG_THRESHOLD) {
          moved.current = true;
        }
        dragY.current = g.dy;
        const base = startPos.current?.bottom ?? defaultBottom(insets.bottom);
        const maxBottom =
          Dimensions.get('window').height - FAB_SIZE - FAB_MARGIN - (isWeb ? WEB_TAB_BAR_HEIGHT : 0);
        const minBottom = defaultBottom(insets.bottom);
        setPos((p) => ({
          ...p,
          bottom: Math.min(maxBottom, Math.max(minBottom, base - g.dy)),
        }));
      },
      onPanResponderRelease: (_, g) => {
        const nextEdge: FabEdge = g.moveX > Dimensions.get('window').width / 2 ? 'right' : 'left';
        const base = startPos.current?.bottom ?? defaultBottom(insets.bottom);
        const maxBottom =
          Dimensions.get('window').height - FAB_SIZE - FAB_MARGIN - (isWeb ? WEB_TAB_BAR_HEIGHT : 0);
        const minBottom = defaultBottom(insets.bottom);
        const nextBottom = Math.min(maxBottom, Math.max(minBottom, base - g.dy));
        void savePos({ edge: nextEdge, bottom: nextBottom });
        if (!moved.current && !busyRef.current) setOpen(true);
        moved.current = false;
        dragY.current = 0;
      },
    })
  ).current;

  useEffect(() => {
    if (busy) setOpen(false);
  }, [busy]);

  if (count === 0) return null;

  const fabSide = pos.edge === 'right' ? { right: FAB_MARGIN } : { left: FAB_MARGIN };

  return (
    <>
      <View
        style={[styles.fabHost, fabSide, { bottom: pos.bottom }, busy && styles.fabHostBusy]}
        {...(busy ? {} : pan.panHandlers)}
        pointerEvents={busy ? 'none' : 'auto'}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!busy }}
        accessibilityLabel={
          busy ? 'Logging tips…' : `${count} tips selected. Drag to move.`
        }
      >
        <View style={[styles.fab, busy && styles.fabBusy]}>
          <View style={styles.fabBadge}>
            <Text style={styles.fabBadgeText}>{count}</Text>
          </View>
          <Text style={styles.fabOdds}>{busy ? '…' : combo > 1 ? combo.toFixed(2) : '—'}</Text>
        </View>
        <Text style={styles.dragHint}>{busy ? 'Logging…' : 'Tap · drag to edge'}</Text>
      </View>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <View style={styles.sheetCountBubble}>
              <Text style={styles.sheetCountText}>{count}</Text>
            </View>
            <Text style={styles.sheetTitle}>Your slip</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={12}>
              <Text style={styles.sheetClose}>▼</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            {tips.map((p) => (
              <View key={`${p.match_id}-${p.bookmaker}-${p.market}-${p.selection}`} style={styles.leg}>
                <Pressable style={styles.legRemove} onPress={() => toggleTip(p, false)}>
                  <Text style={styles.legRemoveText}>×</Text>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <View style={styles.legTop}>
                    <Text style={styles.legPick}>
                      {marketLabel(p.market)} · {String(p.selection).toUpperCase()}
                    </Text>
                    {p.odds != null ? (
                      <Text style={styles.legOdds}>{Number(p.odds).toFixed(2)}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.legMatch} numberOfLines={1}>
                    {formatMatchTitle(p.home_team || '—', p.away_team || '—')}
                  </Text>
                  <Text style={styles.legBook}>{bookLabel(p.bookmaker)}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.sheetFooter}>
            <View style={styles.multiRow}>
              <Text style={styles.multiLabel}>Log as multi</Text>
              <Switch
                value={asMulti}
                onValueChange={onAsMultiChange}
                trackColor={{ true: colors.accent, false: colors.line }}
              />
            </View>
            {combo > 1 ? (
              <Text style={styles.comboLine}>Combined odds ≈ {combo.toFixed(2)}</Text>
            ) : null}
            <View style={styles.sheetActions}>
              <Pressable style={styles.btnGhost} onPress={clearSelection}>
                <Text style={styles.btnGhostText}>Clear</Text>
              </Pressable>
              <Pressable
                style={[styles.btnPrimary, busy && styles.btnDisabled]}
                disabled={busy}
                onPress={() => {
                  if (busy) return;
                  setOpen(false);
                  onLog();
                }}
              >
                <Text style={styles.btnPrimaryText}>{busy ? 'Logging…' : 'Log selected'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fabHost: {
    position: 'absolute',
    zIndex: 99999,
    alignItems: 'center',
    // @ts-expect-error RN web
    ...(isWeb ? { position: 'fixed' } : null),
  },
  fabHostBusy: { opacity: 0.55 },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
  },
  fabBusy: { backgroundColor: colors.muted },
  fabBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  fabBadgeText: { color: '#06241c', fontWeight: '800', fontSize: 12 },
  fabOdds: { color: '#06241c', fontWeight: '800', fontSize: 13 },
  dragHint: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 72,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '78%',
    backgroundColor: colors.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    borderBottomWidth: 0,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginTop: 10,
    marginBottom: 8,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  sheetCountBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCountText: { color: '#06241c', fontWeight: '800', fontSize: 13 },
  sheetTitle: { flex: 1, color: colors.ink, fontWeight: '800', fontSize: 17 },
  sheetClose: { color: colors.muted, fontSize: 16, padding: 4 },
  sheetScroll: { maxHeight: 320, paddingHorizontal: 16 },
  leg: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  legRemove: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legRemoveText: { color: colors.muted, fontSize: 18, lineHeight: 20 },
  legTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  legPick: { color: colors.ink, fontWeight: '700', fontSize: 14, flex: 1 },
  legOdds: { color: colors.accent, fontWeight: '800', fontSize: 15 },
  legMatch: { color: colors.muted, fontSize: 12, marginTop: 2 },
  legBook: { color: colors.muted, fontSize: 11, marginTop: 2 },
  sheetFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  multiRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  multiLabel: { color: colors.ink, fontSize: 14 },
  comboLine: { color: colors.accent, fontSize: 13, marginTop: 8, fontWeight: '600' },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btnGhost: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  btnGhostText: { color: colors.ink, fontWeight: '700' },
  btnPrimary: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#06241c', fontWeight: '800', fontSize: 15 },
  btnDisabled: { opacity: 0.55 },
});
