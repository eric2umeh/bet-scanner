import type { Session } from '@supabase/supabase-js';

import { assertEmail, formatAuthError } from '../lib/authErrors';
import { assertPassword } from '../lib/password';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';

let cachedAccessToken: string | null = null;
let cachedEmail: string | null = null;
const listeners = new Set<() => void>();

/** Fail fast if Supabase is slow / unreachable. */
const AUTH_TIMEOUT_MS = 12_000;

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribeSession(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getAccessToken(): string | null {
  return cachedAccessToken;
}

export function getSessionEmail(): string | null {
  return cachedEmail;
}

function applySession(session: Session | null) {
  cachedAccessToken = session?.access_token ?? null;
  cachedEmail = session?.user?.email ?? null;
  notify();
}

async function withTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out. Check internet and try again.`));
        }, AUTH_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function initSession(): Promise<void> {
  const sb = getSupabase();
  if (!sb) {
    applySession(null);
    return;
  }
  const { data } = await sb.auth.getSession();
  applySession(data.session ?? null);
  sb.auth.onAuthStateChange((_event, session) => {
    applySession(session);
  });
}

export async function signIn(email: string, password: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('Login is not configured (missing Supabase URL / anon key).');
  const em = assertEmail(email);
  const pwd = assertPassword(password);
  try {
    const { data, error } = await withTimeout(
      sb.auth.signInWithPassword({ email: em, password: pwd }),
      'Sign in'
    );
    if (error) throw error;
    applySession(data.session);
    return data.session;
  } catch (e) {
    throw new Error(formatAuthError(e, 'sign_in'));
  }
}

export async function signUp(email: string, password: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('Sign up is not configured (missing Supabase URL / anon key).');
  const em = assertEmail(email);
  const pwd = assertPassword(password);
  try {
    const { data, error } = await withTimeout(
      sb.auth.signUp({ email: em, password: pwd }),
      'Sign up'
    );
    if (error) throw error;
    applySession(data.session);
    return data.session;
  } catch (e) {
    throw new Error(formatAuthError(e, 'sign_up'));
  }
}

export async function signOut() {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
  applySession(null);
}

export { isSupabaseConfigured };
