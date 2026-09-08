#!/usr/bin/env node
import { collect, enrichExpiry } from './collect.js';
import { score, totals } from './score.js';
import { renderScan } from './render.js';
import { sentence, usd, identity, shortIds } from './explain.js';
import { closeDoors } from './revoke.js';
import { BawMissing, BawSignedOut } from './baw.js';
import type { Approval, Tier } from './types.js';
import { progress } from './progress.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/** Bundled sample, resolved relative to this file so it works from any cwd. */
const DEMO_FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'live-capture.json');

const HELP = `
open-doors — see what can spend your tokens without asking, and close it.

  open-doors scan                    rank every standing approval by money at risk
  open-doors scan --demo             run on a real captured wallet, no wallet needed
  open-doors scan --all              include low-risk approvals
  open-doors explain <id>            explain one approval in full
  open-doors close <id>              close one approval
  open-doors close --tier CRITICAL   close every approval at a tier

Options
  --chain <id>       limit to one chain (e.g. 56 for BSC)
  --material <usd>   floor for "worth acting on" (default: 10% of what you hold,
                     bounded to $1-$100)
  --demo             replay a real captured wallet instead of live data
  --fixture <path>   read a saved JSON capture instead of the wallet
  --cex-balance <usd>  Agentic sub-account balance from the Binance MCP Server,
                       shown as funds approvals cannot reach
  --json             machine-readable output
  --yes              skip per-approval confirmation (not recommended)
`;

type Args = { _: string[]; [k: string]: string | boolean | string[] };

function parse(argv: string[]): Args {
  const out: Args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; } else { out[key] = true; }
    } else out._.push(a);
  }
  return out;
}

function fixturePath(args: Args): string | undefined {
  if (args.demo === true) return DEMO_FIXTURE;
  return typeof args.fixture === 'string' ? args.fixture : undefined;
}

async function load(args: Args) {
  const fixture = fixturePath(args);
  // Silent for --json so machine output is never racing a spinner.
  const prog = progress(!fixture && args.json !== true);
  try {
    return await gather(args, fixture, prog);
  } finally {
    prog.done();
  }
}

async function gather(args: Args, fixture: string | undefined, prog: ReturnType<typeof progress>) {
  const { approvals, prices, portfolioUsd } = await collect({
    chainId: typeof args.chain === 'string' ? args.chain : undefined,
    fixture,
    progress: prog,
  });
  const material = typeof args.material === 'string' ? Number(args.material) : undefined;
  const opts = { materialUsd: material, portfolioUsd };
  // Rank once cheaply, enrich the top of the list, then rank again with expiry known.
  let ranked = score(approvals, prices, opts);
  if (!fixture) {
    await enrichExpiry(ranked, 12, prog);
    ranked = score(ranked, prices, opts);
  }
  return { ranked, totals: totals(ranked) };
}

const TIERS: Tier[] = ['CRITICAL', 'HIGH', 'REVIEW', 'OK'];

/**
 * Asking "which one?" is only useful alongside the answer. Rather than telling
 * the user to go and find an id, show the rows with a ready-to-run command.
 */
function listChoices(ranked: Approval[], verb: 'explain' | 'close'): void {
  const open = ranked.filter((a) => a.tier !== 'OK');
  if (open.length === 0) {
    console.log('\n  No open doors — nothing to ' + verb + '.\n');
    return;
  }
  const short = shortIds(open.map((a) => a.id));
  console.log(`\n  Which approval? Any of these:\n`);
  for (const a of open) {
    console.log(
      `    ${a.tier.padEnd(8)} ${usd(a.exposureUsd).padStart(9)}  ${a.tokenSymbol.padEnd(6)}` +
        `  open-doors ${verb} ${short.get(a.id)}`,
    );
  }
  console.log('');
}

async function main() {
  const args = parse(process.argv.slice(2));
  const cmd = args._[0] ?? 'scan';

  if (args.help || cmd === 'help') { console.log(HELP); return; }

  if (cmd === 'scan') {
    const { ranked, totals: t } = await load(args);
    if (args.json) { console.log(JSON.stringify({ totals: t, approvals: ranked }, null, 2)); return; }
    if (args.demo === true) {
      console.log('\n  Replaying a real captured wallet — not yours. Run without --demo to scan your own.');
    }
    const cex = typeof args['cex-balance'] === 'string' ? Number(args['cex-balance']) : undefined;
    process.stdout.write(
      renderScan(ranked, t, {
        showAll: args.all === true,
        cexBalanceUsd: Number.isFinite(cex) ? cex : undefined,
      }),
    );
    return;
  }

  if (cmd === 'explain') {
    const id = args._[1];
    const { ranked } = await load(args);
    if (!id) { listChoices(ranked, 'explain'); process.exitCode = 1; return; }
    const a = ranked.find((x) => x.id === id || x.id.startsWith(id));
    if (!a) { console.error(`No approval matching "${id}".`); process.exitCode = 1; return; }
    console.log(`\n  ${sentence(a)}\n`);
    for (const line of identity(a)) console.log(`    ${line}`);
    console.log(`    Scope    ${a.isUnlimited ? 'unlimited' : a.approvedAmount}    Reaches  ${usd(a.exposureUsd)}`);
    console.log(`    Tier     ${a.tier}`);
    console.log(`    Why      ${a.reasons.join(' · ') || 'no elevated signals'}`);
    console.log(`\n  Close it with:  open-doors close ${a.id.slice(0, 20)}\n`);
    return;
  }

  if (cmd === 'close') {
    if (args.demo === true) {
      console.error('\n  --demo replays a capture. There is nothing live to close.\n' +
                    '  Run `open-doors scan` against your own wallet first.\n');
      process.exitCode = 1;
      return;
    }
    const { ranked } = await load(args);
    let targets: Approval[];
    const tier = typeof args.tier === 'string' ? args.tier.toUpperCase() as Tier : null;

    if (tier) {
      if (!TIERS.includes(tier)) { console.error(`Unknown tier "${args.tier}". Use one of: ${TIERS.join(', ')}`); process.exitCode = 1; return; }
      targets = ranked.filter((a) => a.tier === tier);
    } else {
      const id = args._[1];
      if (!id) { listChoices(ranked, 'close'); process.exitCode = 1; return; }
      targets = ranked.filter((a) => a.id === id || a.id.startsWith(id));
    }

    if (targets.length === 0) { console.log('\n  Nothing matched — nothing to close.\n'); return; }
    const results = await closeDoors(targets, { assumeYes: args.yes === true });
    if (results.length > 0) {
      console.log(`  ${results.length} of ${targets.length} submitted. Re-run \`open-doors scan\` once they confirm.\n`);
    }
    return;
  }

  console.error(`Unknown command "${cmd}".`);
  console.log(HELP);
  process.exitCode = 1;
}

main().catch((err) => {
  if (err instanceof BawMissing || err instanceof BawSignedOut) {
    console.error(`\n${err.message}\n`);
    process.exitCode = 1;
    return;
  }
  console.error(`\n${(err as Error).message}\n`);
  process.exitCode = 1;
});
