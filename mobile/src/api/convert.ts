import { postJson } from './client';

export type ConvertedLeg = {
  raw: string;
  market?: string | null;
  selection?: string | null;
  match_id?: number | null;
  home_team?: string | null;
  away_team?: string | null;
  competition_code?: string | null;
  kickoff_at?: string | null;
  match_score?: number | null;
  prices: Record<string, number | string | null>;
  best_book?: string | null;
  best_price?: number | string | null;
  status: string;
};

export type SlipConvertResponse = {
  legs: ConvertedLeg[];
  matched_count: number;
  combined_sportybet?: number | string | null;
  combined_bet9ja?: number | string | null;
  combined_best_mixed?: number | string | null;
  place_summary: string;
  code_text?: string | null;
  message: string;
};

export function convertSlip(opts: {
  slip_text: string;
  code_text?: string | null;
  source_book?: string;
  days_ahead?: number;
}) {
  return postJson<SlipConvertResponse>('/convert/slip', {
    slip_text: opts.slip_text,
    code_text: opts.code_text || null,
    source_book: opts.source_book || 'sportybet',
    days_ahead: opts.days_ahead ?? 21,
  });
}
