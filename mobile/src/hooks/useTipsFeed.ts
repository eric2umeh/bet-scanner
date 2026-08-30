import { useQuery } from '@tanstack/react-query';

import { getJson } from '../api/client';
import { fetchTipStats, fetchTips } from '../api/tips';
import { getSessionEmail } from '../store/session';
import { queryKeys } from '../query/client';

export type AuthStatus = {
  auth_configured: boolean;
  auth_required_for_tips: boolean;
  signed_in: boolean;
  user_id: string | null;
  email: string | null;
  message: string;
};

export function useAuthStatus() {
  return useQuery({
    queryKey: queryKeys.authStatus,
    queryFn: () => getJson<AuthStatus>('/auth/status'),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useTipsFeed(limit = 50) {
  const tipsQuery = useQuery({
    queryKey: queryKeys.tips(limit),
    queryFn: () => fetchTips(limit),
    placeholderData: (prev) => prev,
  });

  const statsQuery = useQuery({
    queryKey: queryKeys.tipStats,
    queryFn: () => fetchTipStats(),
    placeholderData: (prev) => prev,
  });

  const refresh = async () => {
    await Promise.all([tipsQuery.refetch(), statsQuery.refetch()]);
  };

  const isOfflineCache =
    (tipsQuery.isError || statsQuery.isError) &&
    !!(tipsQuery.data?.length || statsQuery.data);

  return {
    tips: tipsQuery.data ?? [],
    stats: statsQuery.data ?? null,
    isLoading: tipsQuery.isLoading && !tipsQuery.data,
    isRefreshing: tipsQuery.isFetching || statsQuery.isFetching,
    isOfflineCache,
    error: tipsQuery.error ?? statsQuery.error,
    refresh,
  };
}

export function useNeedsSignIn() {
  const { data } = useAuthStatus();
  const email = getSessionEmail();
  if (!data?.auth_required_for_tips) return false;
  return !email && !data.signed_in;
}
