/**
 * Map Supabase Auth errors to plain messages.
 *
 * Note: for wrong password vs unknown email, Supabase usually returns the same
 * "Invalid login credentials" on purpose (stops people guessing emails).
 */

function asRecord(err: unknown): { message?: string; code?: string; status?: number } {
  if (!err || typeof err !== 'object') return {};
  const e = err as { message?: string; code?: string; status?: number };
  return {
    message: typeof e.message === 'string' ? e.message : undefined,
    code: typeof e.code === 'string' ? e.code : undefined,
    status: typeof e.status === 'number' ? e.status : undefined,
  };
}

export function formatAuthError(err: unknown, action: 'sign_in' | 'sign_up'): string {
  if (err instanceof Error && err.message.startsWith('Password must be')) {
    return err.message;
  }

  const { message = '', code = '' } = asRecord(err);
  const lower = `${code} ${message}`.toLowerCase();

  if (lower.includes('email not confirmed') || code === 'email_not_confirmed') {
    return 'This email is not confirmed yet. Open the link in your inbox, then sign in.';
  }
  if (lower.includes('user already registered') || code === 'user_already_exists') {
    return 'An account with this email already exists. Use Sign in instead.';
  }
  if (
    lower.includes('invalid login credentials') ||
    code === 'invalid_credentials' ||
    lower.includes('invalid_credentials')
  ) {
    if (action === 'sign_in') {
      return 'Wrong email or password — or no account for this email yet. Use Sign up if you are new.';
    }
    return 'Could not create the account. Check the email and try again.';
  }
  if (lower.includes('invalid email') || code === 'validation_failed') {
    return 'Enter a valid email address.';
  }
  if (lower.includes('password') && (lower.includes('least') || lower.includes('weak'))) {
    return message || 'Password is too weak. Use at least 8 characters.';
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('timeout')) {
    return 'Network problem talking to login. Check internet and try again.';
  }
  if (message.trim()) return message.trim();
  return action === 'sign_in' ? 'Sign in failed.' : 'Sign up failed.';
}

export function assertEmail(email: string): string {
  const value = (email || '').trim().toLowerCase();
  if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error('Enter a valid email address.');
  }
  return value;
}
