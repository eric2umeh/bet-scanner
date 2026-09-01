import { useQuery } from '@tanstack/react-query';

import { getJson } from '../api/client';
import { fetchTipStats } from '../api/tips';
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

export function useNeedsSignIn() {
  const { data } = useAuthStatus();
  const email = getSessionEmail();
  if (!data?.auth_required_for_tips) return false;
  return !email && !data.signed_in;
}
