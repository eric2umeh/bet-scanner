import { postJson } from './client';

export type DailyOpsStep = {
  step: string;
  ok: boolean;
  message?: string;
  settled_count?: number;
  inserted?: number;
};

export type DailyOpsResponse = {
  ok: boolean;
  summary: string;
  steps: DailyOpsStep[];
  errors: string[];
  settle?: { settled_count?: number; message?: string } | null;
  brief?: {
    summary?: string;
    message?: string;
    explanations?: {
      engine?: string;
      match?: string;
      mode?: string;
      explanation?: string;
    }[];
  } | null;
  learning?: {
    hit_rate_pct?: number | null;
    won?: number;
    lost?: number;
    pending?: number;
  };
  tipsters_ranked?: number;
  message: string;
};

/** Morning path: fixtures + settle + brief. Odds sync optional (quota). */
export function runDailyOps(opts: {
  bankroll_ngn: number;
  unit_pct: number;
  pick_market: string;
  sync_odds?: boolean;
  sync_fixtures?: boolean;
  auto_settle?: boolean;
  build_brief?: boolean;
  notify_telegram?: boolean;
  prefer_llm?: boolean;
}) {
  // Fixture sync + settle + brief regularly exceeds the default 55s wake timeout.
  return postJson<DailyOpsResponse>(
    '/ops/daily-run',
    {
      sync_fixtures: opts.sync_fixtures !== false,
      sync_odds: !!opts.sync_odds,
      auto_settle: opts.auto_settle !== false,
      build_brief: opts.build_brief !== false,
      notify_telegram: !!opts.notify_telegram,
      bankroll_ngn: opts.bankroll_ngn,
      unit_pct: opts.unit_pct,
      pick_market: opts.pick_market || 'double_chance',
      prefer_llm: opts.prefer_llm !== false,
    },
    { timeoutMs: 180_000 }
  );
}
