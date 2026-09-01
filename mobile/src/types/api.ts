export type Match = {
  id: number;
  competition_code: string;
  competition_name: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
};

export type TipPick = {
  match_id: number;
  home_team?: string | null;
  away_team?: string | null;
  competition_code?: string | null;
  kickoff_at?: string | null;
  bookmaker: string;
  profile: string;
  market: string;
  selection: string;
  odds?: number | string | null;
  suggested_stake_ngn?: number | string | null;
  potential_return_ngn?: number | string | null;
  pick_market?: string | null;
  dog_odds?: number | string | null;
  fav_odds?: number | string | null;
  fav_side?: string | null;
  dog_side?: string | null;
  rationale?: string | null;
  confidence_pct?: number | null;
  confidence_label?: string | null;
  learning_note?: string | null;
  singles_only_hint?: string | null;
};

export type SafeScanResponse = {
  count: number;
  message: string;
  picks: TipPick[];
  pick_market?: string;
};

export type PredictionsScanResponse = {
  count: number;
  message: string;
  picks: TipPick[];
};
