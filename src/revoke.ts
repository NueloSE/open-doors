import { createInterface } from 'node:readline/promises';
import { baw } from './baw.js';
import type { Approval, RevokeResult } from './types.js';
import { renderConfirm, renderRevoked } from './render.js';

/**
 * Closing a door is destructive and costs gas, so it is confirmed one approval
 * at a time. There is deliberately no "revoke everything" path: an agent that
 * silently rewrites wallet permissions is the thing users are right to fear.
 */

export async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false; // never assume consent from a pipe
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

export async function revokeOne(a: Approval): Promise<RevokeResult> {
  const data = await baw<Record<string, unknown>>([
    'approvals', 'revoke',
    '--binanceChainId', a.chainId,
    '--tokenContract', a.tokenContract,
    '--spender', a.spender,
    '--type', a.type,
  ]);
  return {
    approvalId: a.id,
    orderId: typeof data.orderId === 'string' ? data.orderId : null,
    status: typeof data.status === 'string' ? data.status : 'UNKNOWN',
    txHash: typeof data.txHash === 'string' ? data.txHash : null,
  };
}

export async function closeDoors(
  targets: Approval[],
  opts: { assumeYes?: boolean } = {},
): Promise<RevokeResult[]> {
  const results: RevokeResult[] = [];

  for (const a of targets) {
    process.stdout.write(renderConfirm(a));
    const ok = opts.assumeYes || (await confirm('  Close it?'));
    if (!ok) {
      // No TTY means nobody could have answered — say so, rather than letting an
      // agent read "Skipped" as a decision the user made.
      process.stdout.write(
        process.stdin.isTTY
          ? '  Skipped.\n'
          : '  Skipped — nothing here can answer a prompt.\n' +
            '  If the user has already confirmed, re-run with --yes.\n',
      );
      continue;
    }
    try {
      const r = await revokeOne(a);
      process.stdout.write(renderRevoked(a, r.txHash, r.status));
      results.push(r);
    } catch (err) {
      // Relay the CLI's own words. Guessing at a cause would be worse than silence.
      process.stdout.write(`\n  Could not close it. The wallet reported:\n  ${(err as Error).message}\n\n`);
    }
  }

  return results;
}
