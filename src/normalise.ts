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

const UNLIMITED_WORD = /^(unlimited|infinite|max)$/i;

/**
 * Approvals come back as raw uint256, not the string "unlimited" the docs show.
 * An infinite approval is uint256 max; anything above 2^255 is astronomically
 * beyond any real token supply, so it is infinite in every sense that matters.
 */
const EFFECTIVELY_INFINITE = 1n << 255n;

function isUnlimitedAmount(raw: string): boolean {
  if (UNLIMITED_WORD.test(raw.trim())) return true;
  try {
    return BigInt(raw.trim()) >= EFFECTIVELY_INFINITE;
  } catch {
    return false;
  }
}

/** Raw base units to a human-readable figure, given the token's decimals. */
function toHuman(raw: string, decimals: number): string {
  try {
    const v = BigInt(raw.trim());
    if (decimals <= 0) return v.toString();
    const base = 10n ** BigInt(decimals);
    const whole = v / base;
    const frac = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '');
    return frac ? `${whole}.${frac.slice(0, 6)}` : whole.toString();
  } catch {
    return raw;
  }
}

/** `riskyLevel` is a number in practice (0 = low), a string in the docs. */
function riskLevel(v: unknown): 'low' | 'medium' | 'high' | null {
  if (typeof v === 'number') return v <= 0 ? 'low' : v === 1 ? 'medium' : 'high';
  if (typeof v === 'string' && v.trim() !== '') {
    const t = v.toLowerCase();
    if (t === 'high' || t === 'medium' || t === 'low') return t;
    const n = Number(t);
    if (Number.isFinite(n)) return n <= 0 ? 'low' : n === 1 ? 'medium' : 'high';
  }
  return null;
}

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

  const rawAmount = str(raw.amount) ?? '0';
  const decimals = num(raw.tokenDecimals) ?? 18;
  const isUnlimited = isUnlimitedAmount(rawAmount);

  return {
    id: approvalId(chainId, tokenContract, spender, type),
    chainId,
    // the CLI returns networkSymbol / networkName; the docs say chainName
    chainName: str(raw.networkSymbol) ?? str(raw.networkName) ?? str(raw.chainName) ?? fallbackChain?.name ?? chainId,
    tokenSymbol: str(raw.tokenSymbol) ?? '—',
    tokenContract,
    spender,
    spenderName: str(raw.spenderName),
    type,
    isUnlimited,
    approvedAmount: isUnlimited ? 'unlimited' : toHuman(rawAmount, decimals),
    riskyLevel: riskLevel(raw.riskyLevel),
    riskyMsg: str(raw.riskyMsg),
    noInteractive: typeof raw.noInteractive === 'boolean' ? raw.noInteractive : null,
    // the CLI calls it `time`; the docs call it `approveTime`
    approveTime: num(raw.approveTime) ?? num(raw.time) ?? 0,
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

/**
 * `wallet balance` names its fields `address`, `balance` and `value`, not the
 * `tokenContract` / `amount` / `usdValue` the docs imply. Both spellings are
 * accepted so the join survives either shape — getting this wrong silently
 * zeroes every exposure, which is the number the whole ranking rests on.
 */
export function normaliseBalance(raw: Raw, fallbackChain?: { id: string }): Balance | null {
  const tokenContract =
    str(raw.tokenContract) ?? str(raw.tokenAddress) ?? str(raw.contractAddress) ?? str(raw.address);
  const chainId = str(raw.binanceChainId) ?? str(raw.chainId) ?? fallbackChain?.id ?? null;
  if (!tokenContract || !chainId) return null;
  return {
    chainId,
    tokenContract,
    tokenSymbol: str(raw.tokenSymbol) ?? str(raw.symbol) ?? '—',
    amount: num(raw.amount) ?? num(raw.balance) ?? 0,
    usdValue: num(raw.usdValue) ?? num(raw.valueUsd) ?? num(raw.usd) ?? num(raw.value) ?? 0,
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
