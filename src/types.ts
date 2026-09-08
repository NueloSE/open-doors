/** Chain as reported by `baw wallet chains`. */
export type Chain = { binanceChainId: string; chainName: string };

/** One token balance from `baw wallet balance`. */
export type Balance = {
  chainId: string;
  tokenContract: string;
  tokenSymbol: string;
  amount: number;
  usdValue: number;
};

/** Approval type as reported by baw. Required verbatim when revoking. */
export type ApprovalType = 'approve' | 'permit2';

export type Tier = 'CRITICAL' | 'HIGH' | 'REVIEW' | 'OK';

/**
 * One standing approval, after normalisation, joining and scoring.
 *
 * Fields marked NULLABLE come back null from the CLI in normal operation —
 * every one needs an explicit fallback at render time, never a blank cell.
 */
export type Approval = {
  /** chainId:tokenContract:spender:type — stable across runs, used by `close`. */
  id: string;

  chainId: string;
  chainName: string;
  tokenSymbol: string;
  tokenContract: string;
  spender: string;
  /** NULLABLE — fall back to the raw spender address. */
  spenderName: string | null;
  /** Required for revoke. `approve` and `permit2` are different objects. */
  type: ApprovalType;

  isUnlimited: boolean;
  /** Human-readable approved amount, or the literal "unlimited". */
  approvedAmount: string;

  riskyLevel: 'low' | 'medium' | 'high' | null;
  /** NULLABLE — e.g. "Spender contract is unverified". */
  riskyMsg: string | null;
  /** NULLABLE — true means the wallet has never interacted with this spender. */
  noInteractive: boolean | null;

  /** Unix ms. */
  approveTime: number;
  /** NULLABLE — null means the approval never expires. Only present via `approvals detail`. */
  expireTime: number | null;

  /** USD value of the wallet's balance of this token on this chain. */
  balanceUsd: number;
  /** USD actually reachable by this spender: min(approved, balance). */
  exposureUsd: number;
  /** Multiplier from the deterministic model in score.ts. */
  danger: number;
  /** exposureUsd * danger — the sort key. */
  priority: number;
  tier: Tier;
  /** Ordered plain-English facts behind the tier. Never model-generated. */
  reasons: string[];
};

/** Result of a revoke attempt. */
export type RevokeResult = {
  approvalId: string;
  orderId: string | null;
  /** baw returns BROADCASTED — this is NOT on-chain confirmation. */
  status: string;
  txHash: string | null;
};
