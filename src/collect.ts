import { readFile } from 'node:fs/promises';
import { baw, requireSignedIn } from './baw.js';
import { normaliseApproval, normaliseBalance, balanceIndex } from './normalise.js';
import type { Approval, Balance, Chain } from './types.js';

/**
 * Gather everything the model needs: which chains to sweep, what is approved on
 * each, and what the wallet actually holds there.
 *
 * A fixture path can stand in for the CLI so the pipeline can be developed and
 * demonstrated offline against saved responses.
 */

type Raw = Record<string, unknown>;
const list = (d: unknown): Raw[] =>
  Array.isArray(d) ? (d as Raw[])
  : Array.isArray((d as Raw)?.list) ? ((d as Raw).list as Raw[])
  : Array.isArray((d as Raw)?.items) ? ((d as Raw).items as Raw[])
  : [];

export type Collected = {
  approvals: Approval[];
  prices: Map<string, number>;
  chains: Chain[];
};

async function chains(): Promise<Chain[]> {
  try {
    const data = await baw<unknown>(['wallet', 'chains']);
    const rows = list(data)
      .map((c) => ({
        binanceChainId: String(c.binanceChainId ?? c.chainId ?? ''),
        chainName: String(c.chainName ?? c.name ?? ''),
      }))
      .filter((c) => c.binanceChainId);
    if (rows.length) return rows;
  } catch {
    // fall through — BSC alone is a reasonable default and keeps the scan working
  }
  return [{ binanceChainId: '56', chainName: 'BSC' }];
}

export async function collect(opts: { chainId?: string; fixture?: string } = {}): Promise<Collected> {
  if (opts.fixture) return fromFixture(opts.fixture);

  // Before anything else: an unreadable wallet must fail loudly, not look empty.
  await requireSignedIn();

  const all = await chains();
  const sweep = opts.chainId ? all.filter((c) => c.binanceChainId === opts.chainId) : all;

  const perChain = await Promise.all(
    sweep.map(async (c) => {
      const chain = { id: c.binanceChainId, name: c.chainName };
      const [approvalsRaw, balancesRaw] = await Promise.all([
        baw<unknown>(['approvals', 'list', '--binanceChainId', c.binanceChainId]).catch(() => []),
        baw<unknown>(['wallet', 'balance', '--binanceChainId', c.binanceChainId]).catch(() => []),
      ]);
      return {
        approvals: list(approvalsRaw)
          .map((r) => normaliseApproval(r, chain))
          .filter((a): a is Approval => a !== null),
        balances: list(balancesRaw)
          .map((r) => normaliseBalance(r, chain))
          .filter((b): b is Balance => b !== null),
      };
    }),
  );

  const approvals = perChain.flatMap((p) => p.approvals);
  const balances = perChain.flatMap((p) => p.balances);
  return join(approvals, balances, sweep);
}

async function fromFixture(path: string): Promise<Collected> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as Raw;
  const approvals = list(parsed.approvals ?? parsed)
    .map((r) => normaliseApproval(r))
    .filter((a): a is Approval => a !== null);
  const balances = list(parsed.balances)
    .map((r) => normaliseBalance(r))
    .filter((b): b is Balance => b !== null);
  return join(approvals, balances, []);
}

function join(approvals: Approval[], balances: Balance[], chains: Chain[]): Collected {
  const { usd, unitPrice } = balanceIndex(balances);
  for (const a of approvals) {
    a.balanceUsd = usd.get(`${a.chainId}:${a.tokenContract.toLowerCase()}`) ?? 0;
  }
  return { approvals, prices: unitPrice, chains };
}

/**
 * expireTime only comes back from `approvals detail`, so it is fetched for the
 * top candidates rather than for every approval — a full sweep would be one
 * round trip per approval for a signal that only matters where exposure is real.
 */
export async function enrichExpiry(approvals: Approval[], topN = 12): Promise<void> {
  await Promise.all(
    approvals.slice(0, topN).map(async (a) => {
      try {
        const d = await baw<Raw>([
          'approvals', 'detail',
          '--binanceChainId', a.chainId,
          '--tokenContract', a.tokenContract,
          '--spender', a.spender,
          '--type', a.type,
        ]);
        a.expireTime = d.expireTime === null ? null : (typeof d.expireTime === 'number' ? d.expireTime : a.expireTime);
      } catch {
        // detail is an enrichment; a failure must not sink the scan
      }
    }),
  );
}
