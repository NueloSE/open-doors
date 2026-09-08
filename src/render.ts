import type { Approval, Tier } from './types.js';
import { spenderLabel, usd, why, headline } from './explain.js';

/**
 * Terminal rendering.
 *
 * Colour is applied only when stdout is a TTY and NO_COLOR is unset, so piped
 * output and CI logs stay clean.
 */

const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string, s: string) => (useColour ? `\x1b[${code}m${s}\x1b[0m` : s);

const dim = (s: string) => paint('2', s);
const bold = (s: string) => paint('1', s);

const TIER_STYLE: Record<Tier, (s: string) => string> = {
  CRITICAL: (s) => paint('1;31', s),
  HIGH: (s) => paint('33', s),
  REVIEW: (s) => paint('36', s),
  OK: dim,
};

/** Visible width, ignoring ANSI escapes, so padding survives colour. */
const width = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '').length;
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - width(s)));
const padStart = (s: string, n: number) => ' '.repeat(Math.max(0, n - width(s))) + s;

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return n <= 1 ? s.slice(0, n) : `${s.slice(0, n - 1)}…`;
}

export type RenderOptions = {
  showAll?: boolean;
  whyWidth?: number;
  /** Agentic sub-account balance, read via the Binance MCP Server. */
  cexBalanceUsd?: number;
};

export function renderScan(approvals: Approval[], t: {
  openDoors: number; reachableUsd: number; critical: number; hidden: number; worst: Approval | null;
}, opts: RenderOptions = {}): string {
  const out: string[] = [];
  const whyWidth = opts.whyWidth ?? 74;

  out.push('');
  for (const [i, line] of headline(t).entries()) {
    out.push(`  ${i === 0 ? bold(line) : dim(line)}`);
  }
  out.push('');

  const shown = opts.showAll ? approvals : approvals.filter((a) => a.tier !== 'OK');
  if (shown.length === 0) {
    out.push(dim('  Nothing to close.'), '');
    return out.join('\n');
  }

  const rows = shown.map((a) => ({
    tier: a.tier,
    reach: usd(a.exposureUsd),
    token: a.tokenSymbol || '—',
    spender: truncate(spenderLabel(a), 26),
    chain: a.chainName || a.chainId,
    why: truncate(why(a), whyWidth),
  }));

  const w = {
    tier: Math.max(4, ...rows.map((r) => r.tier.length)),
    reach: Math.max(9, ...rows.map((r) => r.reach.length)),
    token: Math.max(5, ...rows.map((r) => r.token.length)),
    spender: Math.max(7, ...rows.map((r) => r.spender.length)),
    chain: Math.max(5, ...rows.map((r) => r.chain.length)),
  };

  out.push(
    '  ' +
      dim(
        [
          pad('TIER', w.tier),
          padStart('REACHABLE', w.reach),
          pad('TOKEN', w.token),
          pad('SPENDER', w.spender),
          pad('CHAIN', w.chain),
          'WHY',
        ].join('  '),
      ),
  );

  for (const [i, r] of rows.entries()) {
    const style = TIER_STYLE[r.tier];
    out.push(
      '  ' +
        [
          style(pad(r.tier, w.tier)),
          padStart(r.reach, w.reach),
          pad(r.token, w.token),
          dim(pad(r.spender, w.spender)),
          dim(pad(r.chain, w.chain)),
          dim(r.why),
        ].join('  '),
    );
    if (i === 0 && rows.length > 1) out.push('');
  }

  out.push('');
  if (typeof opts.cexBalanceUsd === 'number') {
    out.push(
      dim(`  ${usd(opts.cexBalanceUsd)} in your Agentic sub-account is out of reach — token approvals`),
      dim('  apply to your on-chain wallet only. Exchange balances cannot be touched this way.'),
      '',
    );
  }
  if (!opts.showAll && t.hidden > 0) {
    const s = t.hidden === 1 ? 'approval' : 'approvals';
    out.push(dim(`  +${t.hidden} low-risk ${s} not shown — run with --all`));
  }
  if (t.critical > 0) {
    out.push('', `  Close the critical ones:  ${bold('open-doors close --tier CRITICAL')}`);
  }
  out.push('');
  return out.join('\n');
}

/** Shown before a revoke. The user is giving up a permission — spell out which. */
export function renderConfirm(a: Approval): string {
  return [
    '',
    `  ${bold('Close this door?')}`,
    `    Token    ${a.tokenSymbol}  ${dim(a.tokenContract)}`,
    `    Spender  ${spenderLabel(a)}`,
    `    Chain    ${a.chainName}  ${dim(`(${a.chainId})`)}`,
    `    Type     ${a.type}`,
    `    Scope    ${a.isUnlimited ? 'unlimited' : a.approvedAmount}  →  reaches ${usd(a.exposureUsd)} today`,
    `    Why      ${why(a)}`,
    '',
    dim('  This submits an on-chain transaction and costs gas.'),
    '',
  ].join('\n');
}

/**
 * Shown after a revoke. baw returns BROADCASTED, which is not on-chain
 * confirmation — the approval stays live until the transaction confirms, and
 * saying so is the difference between a security tool and a claim.
 */
export function renderRevoked(a: Approval, txHash: string | null, status: string): string {
  return [
    '',
    `  Submitted — ${a.tokenSymbol} → ${spenderLabel(a)}`,
    txHash ? `    tx      ${txHash}` : '',
    `    status  ${status}`,
    '',
    `  ${bold('Not closed yet.')} ${dim('This transaction is broadcast, not confirmed.')}`,
    dim('  The approval stays active until it confirms on-chain.'),
    dim('  Track it with:  baw wallet tx-history --json'),
    '',
    '',
  ]
    .filter(Boolean)
    .join('\n');
}
