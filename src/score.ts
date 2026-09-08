import type { Approval, Tier } from './types.js';

/**
 * Risk model.
 *
 * Deliberately deterministic and readable: the same wallet must produce the same
 * ranking on every run, and a reader must be able to check the logic here rather
 * than trust a number. Nothing in this file calls out to a model or the network.
 *
 * Two independent quantities are combined:
 *
 *   exposureUsd — how much money this spender can actually reach today.
 *                 An unlimited approval on a token you hold none of is harmless;
 *                 the same approval over your main stablecoin balance is not.
 *
 *   danger      — how likely that reach is to be a problem, from the signals
 *                 Binance already returns with each approval.
 *
 * Ranking on the product of the two is what turns a list of approvals into a
 * decision about what to close first.
 */

export const DEFAULTS = {
  /** Below this, an approval is noise regardless of how it scores. Configurable. */
  materialUsd: 100,
  weights: {
    riskyHigh: 2.5,
    riskyMedium: 1.7,
    unlimited: 1.8,
    neverUsed: 1.6,
    neverExpires: 1.3,
    staleOver180d: 1.4,
    staleOver30d: 1.15,
  },
};

export type ScoreOptions = { materialUsd?: number; now?: number };

const DAY_MS = 86_400_000;

export function ageInDays(approveTime: number, now: number): number {
  if (!Number.isFinite(approveTime) || approveTime <= 0) return 0;
  return Math.max(0, Math.floor((now - approveTime) / DAY_MS));
}

/**
 * USD a spender can reach: the approved amount, capped by what is actually held.
 * "unlimited" reaches the entire balance.
 */
export function exposure(a: Pick<Approval, 'isUnlimited' | 'approvedAmount' | 'balanceUsd'>,
                         tokenUsdPerUnit: number): number {
  if (a.balanceUsd <= 0) return 0;
  if (a.isUnlimited) return a.balanceUsd;
  const approved = Number(a.approvedAmount);
  if (!Number.isFinite(approved) || approved <= 0) return 0;
  return Math.min(approved * tokenUsdPerUnit, a.balanceUsd);
}

/** Danger multiplier, plus the ordered human-readable facts behind it. */
export function danger(
  a: Pick<Approval, 'riskyLevel' | 'riskyMsg' | 'isUnlimited' | 'noInteractive' | 'expireTime' | 'approveTime'>,
  now: number,
  w = DEFAULTS.weights,
): { danger: number; reasons: string[] } {
  let d = 1;
  const reasons: string[] = [];

  // Order matters: the reason chain is truncated in narrow terminals, so the
  // signals that most justify acting are emitted first.
  if (a.riskyLevel === 'high') {
    d *= w.riskyHigh;
    reasons.push(a.riskyMsg?.trim() || 'flagged high risk by Binance');
  } else if (a.riskyLevel === 'medium') {
    d *= w.riskyMedium;
    reasons.push(a.riskyMsg?.trim() || 'flagged medium risk by Binance');
  }
  if (a.noInteractive === true) {
    d *= w.neverUsed;
    reasons.push('never used');
  }
  if (a.isUnlimited) {
    d *= w.unlimited;
    reasons.push('unlimited');
  }
  if (a.expireTime === null) {
    d *= w.neverExpires;
    reasons.push('never expires');
  }

  const days = ageInDays(a.approveTime, now);
  if (days > 180) {
    d *= w.staleOver180d;
    reasons.push(`granted ${days} days ago`);
  } else if (days > 30) {
    d *= w.staleOver30d;
    reasons.push(`granted ${days} days ago`);
  }

  return { danger: Number(d.toFixed(3)), reasons };
}

export function tierFor(exposureUsd: number, dangerScore: number, a: Pick<Approval,
  'riskyLevel' | 'isUnlimited' | 'noInteractive'>, materialUsd: number): Tier {
  const material = exposureUsd >= materialUsd;
  if (material && (a.riskyLevel === 'high' || (a.isUnlimited && a.noInteractive === true))) return 'CRITICAL';
  if (material && dangerScore >= 2.0) return 'HIGH';
  if (exposureUsd > 0 && dangerScore >= 1.5) return 'REVIEW';
  return 'OK';
}

/**
 * Score and rank. Pure: same input, same output, no I/O.
 * `tokenUsdPerUnit` is looked up per approval by the caller and defaults to 0
 * for tokens we could not price (which simply yields zero exposure).
 */
export function score(
  approvals: Approval[],
  prices: Map<string, number>,
  opts: ScoreOptions = {},
): Approval[] {
  const now = opts.now ?? Date.now();
  const materialUsd = opts.materialUsd ?? DEFAULTS.materialUsd;

  const scored = approvals.map((a) => {
    const priceKey = `${a.chainId}:${a.tokenContract.toLowerCase()}`;
    const exposureUsd = Math.round(exposure(a, prices.get(priceKey) ?? 0) * 100) / 100;
    const { danger: d, reasons } = danger(a, now);
    const tier = tierFor(exposureUsd, d, a, materialUsd);
    return { ...a, exposureUsd, danger: d, priority: Math.round(exposureUsd * d * 100) / 100, tier, reasons };
  });

  // Worst first. Ties break on raw exposure, then on age, so the order is total
  // and stable rather than dependent on the order baw happened to return.
  return scored.sort(
    (x, y) =>
      y.priority - x.priority ||
      y.exposureUsd - x.exposureUsd ||
      x.approveTime - y.approveTime,
  );
}

export function totals(approvals: Approval[]) {
  const open = approvals.filter((a) => a.tier !== 'OK');
  return {
    openDoors: open.length,
    reachableUsd: Math.round(open.reduce((s, a) => s + a.exposureUsd, 0) * 100) / 100,
    critical: approvals.filter((a) => a.tier === 'CRITICAL').length,
    hidden: approvals.length - open.length,
    worst: open[0] ?? null,
  };
}
