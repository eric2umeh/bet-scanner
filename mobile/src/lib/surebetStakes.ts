/**
 * Re-split a surebet sample bankroll across legs (same formula as backend).
 */

export type StakeLegIn = {
  bookmaker: string;
  market?: string;
  selection: string;
  odds: number | string;
};

export type StakeLegOut = StakeLegIn & {
  stake_ngn: number;
  potential_return_ngn: number;
};

function roundMoney(amount: number, roundTo = 100): number {
  if (roundTo <= 0) return Math.round(amount * 100) / 100;
  return Math.round(amount / roundTo) * roundTo;
}

export function recalculateSurebetStakes(
  legs: StakeLegIn[],
  totalStake: number,
  roundTo = 100
): {
  sample_legs: StakeLegOut[];
  sample_total_stake_ngn: number;
  sample_profit_ngn: number;
  implied_sum: number;
} {
  const odds = legs.map((l) => Number(l.odds));
  const implied = odds.map((o) => 1 / o);
  const impliedSum = implied.reduce((a, b) => a + b, 0);
  let stakes = implied.map((imp) => roundMoney((totalStake * imp) / impliedSum, roundTo));
  if (stakes.every((s) => s <= 0)) {
    stakes = implied.map((imp) => Math.round(((totalStake * imp) / impliedSum) * 100) / 100);
  }
  const actualTotal = stakes.reduce((a, b) => a + b, 0);
  const payouts = stakes.map((s, i) => s * odds[i]);
  const guaranteed = Math.min(...payouts);
  const profit = guaranteed - actualTotal;

  return {
    implied_sum: Math.round(impliedSum * 10000) / 10000,
    sample_total_stake_ngn: actualTotal,
    sample_profit_ngn: Math.round(profit * 100) / 100,
    sample_legs: legs.map((leg, i) => ({
      ...leg,
      stake_ngn: stakes[i],
      potential_return_ngn: Math.round(stakes[i] * odds[i] * 100) / 100,
    })),
  };
}
