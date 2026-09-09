import { useEffect, useState } from 'react';

import { fetchPublicAppConfig } from '../api/appConfig';
import { getSessionEmail, subscribeSession } from '../store/session';
import { isSupabaseConfigured } from '../lib/supabase';

/**
 * True when auth is configured and the user is not signed in.
 * Used to gate Home / Tips / Surebets / Tools until Account sign-in.
 */
export function useMustSignIn(): boolean {
  const [email, setEmail] = useState<string | null>(() => getSessionEmail());
  const [authConfigured, setAuthConfigured] = useState(() => isSupabaseConfigured());

  useEffect(() => subscribeSession(() => setEmail(getSessionEmail())), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cfg = await fetchPublicAppConfig().catch(() => null);
      if (cancelled) return;
      setAuthConfigured(Boolean(cfg?.auth_configured) || isSupabaseConfigured());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!authConfigured) return false;
  return !Boolean((email || '').trim());
}
