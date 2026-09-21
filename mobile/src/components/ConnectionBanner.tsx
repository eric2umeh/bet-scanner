import NetInfo from '@react-native-community/netinfo';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getJson } from '../api/client';
import { colors } from '../theme/colors';

type Kind = 'offline' | 'server' | 'db' | null;

type HealthPayload = {
  status?: string;
};

type ReadyPayload = {
  status?: string;
  db_ok?: boolean;
};

/** Liveness only — no Postgres (cuts Supabase pooler egress). */
const HEALTH_OK_MS = 60_000;
const HEALTH_BAD_MS = 15_000;
/** DB check — rare unless we already know the pool is unhappy. */
const READY_OK_MS = 5 * 60_000;
const READY_BAD_MS = 30_000;

/**
 * Top banner when the phone has no internet, or Bet Scout's server
 * does not answer a quick health check.
 */
export function ConnectionBanner() {
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState<Kind>(null);
  const kindRef = useRef<Kind>(null);
  const lastReadyAt = useRef(0);

  useEffect(() => {
    kindRef.current = kind;
  }, [kind]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function checkReady() {
      try {
        const ready = await getJson<ReadyPayload>('/ready', { timeoutMs: 10000 });
        lastReadyAt.current = Date.now();
        if (cancelled) return;
        if (ready?.db_ok === false) {
          setKind('db');
        } else if (kindRef.current === 'db') {
          setKind(null);
        }
      } catch {
        // /ready failed — treat as server issue only if we thought DB was the problem.
        if (!cancelled && kindRef.current === 'db') {
          setKind('server');
        }
      }
    }

    async function check(isConnected: boolean | null) {
      if (isConnected === false) {
        if (!cancelled) setKind('offline');
        return;
      }
      try {
        // Cheap — does not touch Postgres.
        await getJson<HealthPayload>('/health', { timeoutMs: 10000 });
        if (cancelled) return;

        const now = Date.now();
        const needReady =
          kindRef.current === 'db' ||
          kindRef.current === 'server' ||
          now - lastReadyAt.current >= READY_OK_MS;

        if (needReady) {
          await checkReady();
        } else if (kindRef.current === 'offline' || kindRef.current === 'server') {
          setKind(null);
        }
      } catch {
        if (!cancelled) setKind('server');
      }
    }

    function scheduleNext() {
      const bad = kindRef.current === 'offline' || kindRef.current === 'server' || kindRef.current === 'db';
      const delay = bad ? HEALTH_BAD_MS : HEALTH_OK_MS;
      timer = setTimeout(() => {
        NetInfo.fetch().then((state) => {
          void check(state.isConnected).finally(() => {
            if (!cancelled) scheduleNext();
          });
        });
      }, delay);
    }

    const unsub = NetInfo.addEventListener((state) => {
      void check(state.isConnected);
    });

    NetInfo.fetch().then((state) => {
      void check(state.isConnected).finally(() => {
        if (!cancelled) scheduleNext();
      });
    });

    return () => {
      cancelled = true;
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, []);

  // While showing DB error, retry /ready a bit faster without extra /health DB cost.
  useEffect(() => {
    if (kind !== 'db') return;
    let cancelled = false;
    const id = setInterval(() => {
      void getJson<ReadyPayload>('/ready', { timeoutMs: 10000 })
        .then((ready) => {
          if (cancelled) return;
          lastReadyAt.current = Date.now();
          if (ready?.db_ok !== false) setKind(null);
        })
        .catch(() => {});
    }, READY_BAD_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [kind]);

  if (!kind) return null;

  const message =
    kind === 'offline'
      ? 'No internet — showing last saved Home matches & Safe picks. Prices and tips will not update until you are back online.'
      : kind === 'db'
        ? 'Server is up but the database is busy or full (connection pool). Wait a minute, then pull down to refresh. Prefer one API host (local OR Render), not both at once.'
        : 'Cannot reach the Bet Scout server. Showing saved Home data if you have it — wait a minute and pull down to refresh.';

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) }]}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#5c2b2b',
    borderBottomWidth: 1,
    borderBottomColor: colors.bad,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  text: {
    color: '#ffd4d4',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
});
