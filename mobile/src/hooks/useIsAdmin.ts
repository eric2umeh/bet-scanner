import { useCallback, useEffect, useState } from 'react';

import { getJson } from '../api/client';
import { getAccessToken, subscribeSession } from '../store/session';

type AuthStatus = {
  signed_in?: boolean;
  is_admin?: boolean;
};

/**
 * True when /auth/status reports is_admin for the current session
 * (DB role via user_profiles; bootstrap email only seeds the first admin).
 */
export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);

  const refresh = useCallback(async () => {
    if (!getAccessToken()) {
      setIsAdmin(false);
      return;
    }
    try {
      const st = await getJson<AuthStatus>('/auth/status');
      setIsAdmin(Boolean(st.signed_in && st.is_admin));
    } catch {
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeSession(() => {
      void refresh();
    });
  }, [refresh]);

  return isAdmin;
}
