/** Minimum length for account passwords (Sign in / Sign up). */
export const MIN_PASSWORD_LENGTH = 8;

export function assertPassword(password: string): string {
  const value = password ?? '';
  if (value.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  return value;
}

export function assertPasswordsMatch(password: string, confirm: string): string {
  const pwd = assertPassword(password);
  if (pwd !== (confirm ?? '')) {
    throw new Error('Passwords do not match. Re-enter both fields.');
  }
  return pwd;
}
