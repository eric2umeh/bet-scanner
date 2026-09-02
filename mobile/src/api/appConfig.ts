import { getJson } from './client';

export type PublicAppConfig = {
  supabase_url?: string | null;
  supabase_anon_key?: string | null;
  auth_configured?: boolean;
  odds_bookmakers?: string[];
  odds_sync_enabled?: boolean;
};

let cached: PublicAppConfig | null = null;

export async function fetchPublicAppConfig(): Promise<PublicAppConfig> {
  if (cached) return cached;
  try {
    cached = await getJson<PublicAppConfig>('/auth/config');
    return cached;
  } catch {
    return { odds_bookmakers: ['sportybet', 'onexbet'] };
  }
}

export function clearPublicAppConfigCache() {
  cached = null;
}
