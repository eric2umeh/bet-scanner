import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fetchPublicAppConfig } from '../api/appConfig';
import { scanValue } from '../api/edge';
import { loadSettings } from '../store/settings';
import {
  getValuePickCount,
  setValuePickCount,
  subscribeValuePickCount,
} from '../store/valuePickCount';
import { colors } from '../theme/colors';

/**
 * Compact free shortcuts for the Home status line (value tips + morning brief).
 */
export function FreeHomeExtras() {
  const router = useRouter();
  const [valueCount, setValueCount] = useState(getValuePickCount);

  useEffect(() => subscribeValuePickCount(() => setValueCount(getValuePickCount())), []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        try {
          const s = await loadSettings();
          const cfg = await fetchPublicAppConfig().catch(() => null);
          const books = cfg?.odds_bookmakers?.length
            ? cfg.odds_bookmakers.join(',')
            : undefined;
          const data = await scanValue({
            bankroll_ngn: s.bankroll,
            unit_pct: s.unitPct,
            bookmakers: books,
          });
          if (!cancelled) setValuePickCount(data.picks?.length || data.count || 0);
        } catch {
          /* keep last known count */
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  return (
    <View style={styles.row}>
      <Pressable
        style={styles.btn}
        onPress={() => router.push('/tools/value')}
        accessibilityRole="button"
        accessibilityLabel={
          valueCount > 0 ? `Free tips, ${valueCount} available` : 'Free tips'
        }
        hitSlop={4}
      >
        <FontAwesome name="gift" size={11} color={colors.accent} />
        <Text style={styles.btnText}>Free tips</Text>
        {valueCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{valueCount > 99 ? '99+' : valueCount}</Text>
          </View>
        ) : null}
      </Pressable>
      <Pressable
        style={styles.btn}
        onPress={() => router.push('/tools/morning')}
        accessibilityRole="button"
        accessibilityLabel="Match brief"
        hitSlop={4}
      >
        <FontAwesome name="magic" size={11} color={colors.accent} />
        <Text style={styles.btnText}>Brief</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(15, 138, 95, 0.35)',
    backgroundColor: colors.accentDim,
    position: 'relative',
  },
  btnText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  badge: {
    marginLeft: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.bad,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.onAccent, fontSize: 9, fontWeight: '800' },
});
