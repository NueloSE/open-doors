```
   ██████  ██████  ███████ ███    ██     ██████   ██████   ██████  ██████  ███████
  ██    ██ ██   ██ ██      ████   ██     ██   ██ ██    ██ ██    ██ ██   ██ ██
  ██    ██ ██████  █████   ██ ██  ██     ██   ██ ██    ██ ██    ██ ██████  ███████
  ██    ██ ██      ██      ██  ██ ██     ██   ██ ██    ██ ██    ██ ██   ██      ██
   ██████  ██      ███████ ██   ████     ██████   ██████   ██████  ██   ██ ███████
```

**See what can spend your tokens without asking you again — and close it.**

An AI agent for [Binance Agent OS](https://developers.binance.com/en/docs/agent-native/mcp-server)
that ranks standing token approvals by money actually at risk — not by how alarming they look.

[![npm](https://img.shields.io/npm/v/open-doors?color=0f5460&label=npm)](https://www.npmjs.com/package/open-doors)
[![license](https://img.shields.io/badge/license-MIT-0f5460)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518-0f5460)](package.json)

```bash
npx open-doors --demo    # 30 seconds, no wallet, no keys
```

```

  3 open doors · $41.00 reachable
  Worst: unlimited USDT to Binance Wallet — unlimited · never expires

  ┌────────┬───────────┬───────┬────────────────────────────┬───────┬───────────────────────────┐
  │ TIER   │ REACHABLE │ TOKEN │ SPENDER                    │ CHAIN │ WHY                       │
  ├────────┼───────────┼───────┼────────────────────────────┼───────┼───────────────────────────┤
  │ HIGH   │    $40.00 │ USDT  │ Binance Wallet 0xb300…028d │ BSC   │ unlimited · never expires │
  ├────────┼───────────┼───────┼────────────────────────────┼───────┼───────────────────────────┤
  │ REVIEW │     $0.50 │ USDC  │ Binance Wallet 0xb300…028d │ BSC   │ unlimited · never expires │
  ├────────┼───────────┼───────┼────────────────────────────┼───────┼───────────────────────────┤
  │ REVIEW │     $0.50 │ U     │ Binance Wallet 0xb300…028d │ BSC   │ unlimited · never expires │
  └────────┴───────────┴───────┴────────────────────────────┴───────┴───────────────────────────┘
```

*Real output from a live wallet on BSC. Three ordinary swaps left three standing
unlimited approvals behind — one of them over the whole USDT balance.*

## Try it — three levels, pick one

### 1. No wallet, no keys, no setup — 30 seconds

```bash
git clone https://github.com/NueloSE/open-doors
cd open-doors
npm install && npm link      # `open-doors` is now on your PATH
open-doors --demo
```

Replays a real captured wallet (address redacted). Nothing to sign in to, nothing to fund.

### 2. On your own wallet — read-only

Needs the Binance Agentic Wallet CLI and an MPC wallet created in the Binance app:

```bash
npm install -g @binance/agentic-wallet     # the skill installs this lazily; do it directly
baw auth signin --json                     # open the link, check the pairing code, confirm in the app
baw wallet status --json                   # must say CONNECTED — this, not the app screen, is the truth
open-doors scan
```

`scan` only reads. It calls `wallet chains`, `wallet balance`, `approvals list` and `approvals
detail` and writes nothing. Point it at your own wallet and it will tell you something true about it
in about ten seconds.

### 3. As an agent skill — how it is meant to be used

This is the intended experience. The CLI is the engine; the conversation is the interface.

```bash
npx skills add https://github.com/NueloSE/open-doors
```

Then talk to your agent normally:

> "What can spend my money right now?"
> "Why is that top one dangerous?"
> "Close the critical ones."

The agent routes plain language to the right command, reads the ranking back in words, and confirms
with you before revoking anything. The CLI is the engine; the conversation is the interface.

Optionally connect the Binance MCP Server too, and the scan will also show what approvals *cannot*
reach:

```bash
claude mcp add binance-mcp-server --transport http https://agent.binance.com/mcp/agentic
```

### Troubleshooting

| Symptom | Cause |
|---|---|
| `zsh: command not found: baw` | The skill declares `baw` as a lazy install. Run `npm install -g @binance/agentic-wallet`. |
| `DNS_RESOLVE_FAILED` on `binance.com` | Your resolver is filtering Binance. Point DNS at `1.1.1.1` / `8.8.8.8`. |
| Scan says the wallet is not connected | Correct behaviour — it refuses to report a clean wallet it could not read. Re-run `baw auth signin`. |
| `AUTH_REJECTED` during sign-in | The pairing code expired (~5 min). Start a fresh `baw auth signin`, don't retry the old id. |
| `REQUEST_TIMEOUT` | A transient network blip. Reads retry twice with backoff before giving up; if it still fails, the network is genuinely down. Offline modes (`--demo`, `--fixture`) work regardless. |

## The problem

Every swap you have ever made was two transactions, not one. First you **approved** a contract to
spend your token; then it swapped. That approval is almost always **unlimited**, because it saves
gas on every future trade — and it **never expires**.

So a DEX you used once in January still has permission to move your USDT today. If that contract is
ever compromised or maliciously upgraded, it drains what you approved, with no prompt. This is one
of the most common ways wallets are emptied, and it has nothing to do with losing your keys.

Most active wallets carry dozens of these. Almost nobody has looked.

## What makes this different

Approval tools list approvals and tag them risky. That is a wall of warnings, which is why people
close the tab.

**Open Doors ranks by money actually at risk.** An unlimited approval on a token you hold none of is
harmless. The same approval over your main stablecoin balance is your whole wallet. So it joins two
things Agent OS already gives you:

```
exposure = min(approved amount, balance held)     # "unlimited" → the entire balance
danger   = risky spender · never used · unlimited · never expires · age
rank     = exposure × danger
```

No single signal is alarming — unlimited approvals are normal, and so are old ones. The combination
is the thing worth acting on, and it is what puts one row at the top of the list instead of forty.

The ranking is computed in [`src/score.ts`](src/score.ts) as a pure function with no model in the
loop, so it is reproducible and you can read the logic rather than trust a number.

## Agent OS surfaces used

| Surface | Used for |
|---|---|
| **Binance Agentic Wallet** (`baw`) | `wallet chains`, `wallet balance`, `approvals list`, `approvals detail`, `approvals revoke` |
| **Binance MCP Server** | Agentic sub-account balance — shown as funds approvals *cannot* reach |

The MCP call is made by the **agent**, not by this CLI, which is how MCP is meant to work: the agent
is already an authenticated MCP client, so it reads the sub-account balance and passes the figure in
via `--cex-balance`. That keeps OAuth out of the tool and keeps the tool deterministic and testable.
The flag is optional — the scan is complete without it.

## Command reference

```bash
open-doors signin                      # sign in to Binance Agentic Wallet
open-doors                             # rank every standing approval by money at risk
open-doors --all                       # include the low-risk ones it filtered out
open-doors --demo                      # replay a real captured wallet, no credentials
open-doors --chain 56                  # one chain only
open-doors --no-borders                # drop the rules between columns and rows
open-doors --fresh                     # re-read the wallet instead of reusing a recent scan
open-doors --json                      # machine-readable, ids included
open-doors explain <id>                # full identity and why it ranks where it does
open-doors close <id>                  # close one, confirmed individually
open-doors close --tier CRITICAL       # close a whole tier, still one confirmation each
open-doors --help
```

`scan` is the default, so bare `open-doors` is the scan.

Reading a wallet takes a few seconds, so a scan is cached for 60 seconds and `explain` reuses it —
otherwise describing a row you were just shown would re-read everything. The output says when it is
replaying a cached scan, and `--fresh` forces a live read. **`close` never uses the cache**: a revoke
is decided on current state, because acting on a stale approval list is the mistake this tool exists
to prevent.

**Ids are long, and a unique prefix is enough** — `open-doors explain 56:0x55d3` works. Full ids come
from `--json`.

### Verifying an approval before you close it

The table truncates addresses to stay readable. `explain` gives you the whole thing:

```
  Binance Wallet can spend unlimited USDT on BSC, reaching $39.98 of what you hold today.

    Token    USDT  0x55d398326f99059fF775485246999027B3197955
    Spender  Binance Wallet  0xb300000b72DEAEb607a12d5f54773D1C19c7028d
    Chain    BSC (56)    Type  approve
    Scope    unlimited    Reaches  $39.98
    Tier     HIGH
    Why      unlimited · never expires

  Close it with:  open-doors close 56:0x55d398326f99059
```

### The materiality floor

Below some amount, an approval is not worth anyone's attention. That threshold **scales to your
wallet** — ten percent of what you hold, bounded to $1–$100 — so a $40 wallet surfaces its $40
approval without any flag, and a $40,000 wallet is not buried under every $5 allowance it ever
granted. Override with `--material <usd>`.

`fixtures/illustrative.json` is synthetic and shows the full range of signals the model reads — a
high-risk unverified spender, a never-used approval, differing ages — which a fresh wallet does not
have. Run it with `--fixture fixtures/illustrative.json --material 100`.

## Closing a door is not instant

`approvals revoke` returns `status: BROADCASTED`. **That is not confirmation.** The approval stays
live until the transaction confirms on-chain, and Open Doors says so rather than claiming a fix it
has not finished. Track with `baw wallet tx-history --json`, then re-scan.

## Safety

- Every revoke is confirmed individually. There is no bulk-revoke-without-asking path, and a
  non-interactive stdin is treated as refusal rather than consent.
- Spender names and token symbols are attacker-controlled strings. They are displayed, never
  interpreted as instructions.
- CLI errors are relayed verbatim. If the wallet does not say why something failed, neither do we.
- Open Doors can read approvals and remove them. It cannot move funds, trade, or withdraw.

## Limitations

- `riskyLevel` is Binance's assessment, not a guarantee. `low` does not mean safe.
- `expireTime` requires a per-approval `detail` call, so it is fetched for the top candidates rather
  than all of them.
- Exposure is only as good as the wallet's USD pricing; unpriced tokens score as zero exposure and
  fall to the bottom rather than being hidden.
- The $100 materiality floor is a default, not a truth. Tune it with `--material`.

## Tests

```bash
npm test
```

Covers the scoring model against the cases that matter: exposure capping, null handling, ordering
stability, and the rule that no single signal is enough to be critical on its own.

## License

MIT
