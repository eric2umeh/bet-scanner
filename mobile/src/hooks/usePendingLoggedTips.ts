import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { isAuthError } from '../api/client';
import { fetchTipsPage } from '../api/tips';
import {
  pickLooksLogged,
  tipOutToLoggedRef,
  type LoggedTipRef,
} from '../lib/loggedTipMatch';
import { queryKeys } from '../query/client';
import { getAccessToken, subscribeSession } from '../store/session';
import type { TipPick } from '../types/api';

const STALE_MS = 90_000;

/**
 * One shared pending-tips fetch for Today strikethrough.
 * Cached (~90s) — not polled — so we don't burn Supabase egress.
 */
export function usePendingLoggedTips(enabled = true) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(() => getAccessToken());

  useEffect(() => subscribeSession(() => setToken(getAccessToken())), []);

  const query = useQuery({
    queryKey: queryKeys.pendingLoggedTips,
    queryFn: async (): Promise<LoggedTipRef[]> => {
      const page = await fetchTipsPage({ result: 'pending', limit: 100 });
      return (page.items || []).map(tipOutToLoggedRef);
    },
    enabled: enabled && !!token,
    staleTime: STALE_MS,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: (count, err) => {
      if (isAuthError(err)) return false;
      return count < 1;
    },
  });

  const refs = query.data ?? [];

  function isPickLogged(p: TipPick): boolean {
    return pickLooksLogged(p, refs);
  }

  /** Only hits the network if the cache is missing or older than staleTime. */
  function refetchIfStale() {
    void queryClient.refetchQueries({
      queryKey: queryKeys.pendingLoggedTips,
      type: 'active',
      stale: true,
    });
  }

  return {
    refs,
    isPickLogged,
    isLoading: query.isLoading,
    refetch: query.refetch,
    refetchIfStale,
  };
}
