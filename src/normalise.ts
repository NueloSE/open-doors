import type { Approval, ApprovalType, Balance } from './types.js';

/**
 * Shape raw baw responses into our own types.
 *
 * The CLI returns several fields as null in normal operation — spenderName,
 * riskyMsg, noInteractive, expireTime, spenderIcon. Each gets an explicit
 * fallback here so nothing downstream has to guess, and no blank cells reach
 * the user.
 */

type Raw = Record<string, unknown>;

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v : null;

const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};

const UNLIMITED = /^(unlimited|infinite|max)$/i;

export function approvalId(chainId: string, token: string, spender: string, type: string): string {
  return `${chainId}:${token.toLowerCase()}:${spender.toLowerCase()}:${type}`;
}

export function normaliseApproval(raw: Raw, fallbackChain?: { id: string; name: string }): Approval | null {
  const chainId = str(raw.binanceChainId) ?? str(raw.chainId) ?? fallbackChain?.id ?? null;
  const tokenContract = str(raw.tokenContract) ?? str(raw.tokenAddress);
  const spender = str(raw.spender);
  if (!chainId || !tokenContract || !spender) return null; // unusable without these

  const rawType = (str(raw.type) ?? 'approve').toLowerCase();
  const type: ApprovalType = rawType === 'permit2' ? 'permit2' : 'approve';

  const amount = str(raw.amount) ?? '0';
  const isUnlimited = UNLIMITED.test(amount);

  const risky = str(raw.riskyLevel)?.toLowerCase();

  return {
    id: approvalId(chainId, tokenContract, spender, type),
    chainId,
    chainName: str(raw.chainName) ?? fallbackChain?.name ?? chainId,
    tokenSymbol: str(raw.tokenSymbol) ?? '—',
    tokenContract,
    spender,
    spenderName: str(raw.spenderName),
    type,
    isUnlimited,
    approvedAmount: amount,
    riskyLevel: risky === 'high' ? 'high' : risky === 'low' ? 'low' : null,
    riskyMsg: str(raw.riskyMsg),
    noInteractive: typeof raw.noInteractive === 'boolean' ? raw.noInteractive : null,
    approveTime: num(raw.approveTime) ?? 0,
    // Only `approvals detail` carries expireTime. Undefined here means "not yet
    // looked up"; null means "looked up, and it never expires". They score
    // differently, so the distinction is preserved by leaving it 0 until enriched.
    expireTime: raw.expireTime === null ? null : num(raw.expireTime) ?? 0,
    balanceUsd: 0,
    exposureUsd: 0,
    danger: 1,
    priority: 0,
    tier: 'OK',
    reasons: [],
  };
}

export function normaliseBalance(raw: Raw, fallbackChain?: { id: string }): Balance | null {
  const tokenContract = str(raw.tokenContract) ?? str(raw.tokenAddress) ?? str(raw.contractAddress);
  const chainId = str(raw.binanceChainId) ?? str(raw.chainId) ?? fallbackChain?.id ?? null;
  if (!tokenContract || !chainId) return null;
  return {
    chainId,
    tokenContract,
    tokenSymbol: str(raw.tokenSymbol) ?? str(raw.symbol) ?? '—',
    amount: num(raw.amount) ?? num(raw.balance) ?? 0,
    usdValue: num(raw.usdValue) ?? num(raw.valueUsd) ?? num(raw.usd) ?? 0,
  };
}

/** Index balances so scoring can look up exposure by chain + token in O(1). */
export function balanceIndex(balances: Balance[]) {
  const usd = new Map<string, number>();
  const unitPrice = new Map<string, number>();
  for (const b of balances) {
    const key = `${b.chainId}:${b.tokenContract.toLowerCase()}`;
    usd.set(key, (usd.get(key) ?? 0) + b.usdValue);
    if (b.amount > 0) unitPrice.set(key, b.usdValue / b.amount);
  }
  return { usd, unitPrice };
}
