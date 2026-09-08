import { readFile } from 'node:fs/promises';
import { baw, requireSignedIn } from './baw.js';
import { normaliseApproval, normaliseBalance, balanceIndex } from './normalise.js';
import type { Approval, Balance, Chain } from './types.js';

/**
 * Gather what the model needs: every standing approval, and what the wallet
 * actually holds behind each one.
 *
 * `approvals list` and `wallet balance` are both cross-chain in the CLI, so this
 * is two calls plus pagination rather than a fan-out per chain. Chain filtering,
 * where asked for, is applied afterwards.
 *
 * A fixture path can stand in for the CLI so the pipeline runs offline.
 */

type Raw = Record<string, unknown>;
const rows = (d: unknown): Raw[] =>
  Array.isArray(d) ? (d as Raw[])
  : Array.isArray((d as Raw)?.list) ? ((d as Raw).list as Raw[])
  : Array.isArray((d as Raw)?.items) ? ((d as Raw).items as Raw[])
  : [];

export type Collected = { approvals: Approval[]; prices: Map<string, number>; chains: Chain[] };

/** Page size per request. The CLI defaults to 20; approvals are small rows. */
const PAGE = 100;
/** Stop rather than loop forever if the cursor never settles. */
const MAX_PAGES = 20;

async function chains(): Promise<Chain[]> {
  try {
    const data = await baw<unknown>(['wallet', 'chains']);
    const list = rows(data)
      .map((c) => ({
        binanceChainId: String(c.binanceChainId ?? c.chainId ?? ''),
        // the CLI returns `name` / `simpleName`; docs say `chainName`. Accept all.
        chainName: String(c.simpleName ?? c.chainName ?? c.name ?? ''),
      }))
      .filter((c) => c.binanceChainId);
    if (list.length) return list;
  } catch {
    // a scan is still useful without pretty chain names
  }
  return [];
}

/** Page through every approval. `--offset` is an opaque cursor, not an index. */
async function allApprovals(): Promise<Raw[]> {
  const out: Raw[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const args = ['approvals', 'list', '--limit', String(PAGE)];
    if (cursor) args.push('--offset', cursor);

    const data = await baw<Raw>(args);
    const batch = rows(data);
    out.push(...batch);

    const next = data.offset ?? data.nextOffset ?? data.cursor;
    const nextCursor = typeof next === 'string' && next !== '' ? next : undefined;
    // Stop on a short page, a missing cursor, or a cursor that has not moved.
    if (batch.length < PAGE || !nextCursor || nextCursor === cursor) break;
    cursor = nextCursor;
  }

  return out;
}

export async function collect(opts: { chainId?: string; fixture?: string } = {}): Promise<Collected> {
  if (opts.fixture) return fromFixture(opts.fixture);

  // An unreadable wallet must fail loudly rather than look empty.
  await requireSignedIn();

  const [chainList, approvalRows, balanceRows] = await Promise.all([
    chains(),
    allApprovals(),
    baw<unknown>(opts.chainId ? ['wallet', 'balance', '--binanceChainId', opts.chainId] : ['wallet', 'balance'])
      .catch(() => []),
  ]);

  const names = new Map(chainList.map((c) => [c.binanceChainId, c.chainName]));

  let approvals = approvalRows
    .map((r) => normaliseApproval(r))
    .filter((a): a is Approval => a !== null);

  if (opts.chainId) approvals = approvals.filter((a) => a.chainId === opts.chainId);

  for (const a of approvals) {
    if (!a.chainName || a.chainName === a.chainId) a.chainName = names.get(a.chainId) ?? a.chainId;
  }

  const balances = rows(balanceRows)
    .map((r) => normaliseBalance(r))
    .filter((b): b is Balance => b !== null);

  return join(approvals, balances, chainList);
}

async function fromFixture(path: string): Promise<Collected> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as Raw;
  const approvals = rows(parsed.approvals ?? parsed)
    .map((r) => normaliseApproval(r))
    .filter((a): a is Approval => a !== null);
  const balances = rows(parsed.balances)
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
 * `expireTime` only comes back from `approvals detail`, one call per approval,
 * so it is fetched for the top candidates rather than the whole list — it only
 * changes the ranking where there is real exposure to rank.
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
        if (d.expireTime === null) a.expireTime = null;
        else if (typeof d.expireTime === 'number') a.expireTime = d.expireTime;
      } catch {
        // enrichment only; a failure must not sink the scan
      }
    }),
  );
}
