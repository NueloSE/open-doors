# Open Doors

**See what can spend your tokens without asking you again — and close it.**

Built on [Binance Agent OS](https://developers.binance.com/en/docs/agent-native/mcp-server) for the
Agent OS Mini Hackathon.

```

  3 open doors · $41.00 reachable
  Worst: unlimited USDT to Binance Wallet — unlimited · never expires

  TIER    REACHABLE  TOKEN  SPENDER                     CHAIN  WHY
  HIGH       $40.00  USDT   Binance Wallet 0xb300…028d  BSC    unlimited · never expires

  REVIEW      $0.50  USDC   Binance Wallet 0xb300…028d  BSC    unlimited · never expires
  REVIEW      $0.50  U      Binance Wallet 0xb300…028d  BSC    unlimited · never expires
```

*Real output from a live wallet on BSC. Three ordinary swaps left three standing
unlimited approvals behind — one of them over the whole USDT balance.*

## Reviewers: two ways to try it

**Zero setup — 30 seconds, no wallet, no keys:**

```bash
git clone <this repo> && cd open-doors && npm install
npx tsx src/cli.ts scan --demo
```

**On your own wallet — read-only, no risk:**

```bash
npx tsx src/cli.ts scan
```

`scan` only reads. It calls `wallet chains`, `wallet balance`, `approvals list` and
`approvals detail` and writes nothing. If you already have a Binance Agentic Wallet, point it at
yours and it will tell you something true about it in about ten seconds — most active wallets have
approvals nobody has looked at.

The only command that changes anything is `close`, which confirms every single revoke individually
and refuses to run at all in `--demo` mode.

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

## Install

```bash
# 1. Binance Agentic Wallet (needs an MPC wallet created in the Binance app first)
npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet
# then, to your agent: "Sign in to Binance Agentic Wallet"

# 2. Open Doors
git clone <this repo> && cd open-doors
npm install
```

## Use

```bash
npm run scan                          # rank every standing approval
npx tsx src/cli.ts scan --all         # include low-risk ones
npx tsx src/cli.ts explain <id>       # why is this one dangerous
npx tsx src/cli.ts close <id>         # close one, with confirmation
npx tsx src/cli.ts close --tier CRITICAL
npx tsx src/cli.ts scan --cex-balance 250   # also show what approvals cannot reach
```

Or just talk to your agent — the skill routes plain language:

> "What can spend my money right now?"
> "Close the critical ones."

### Try it without a wallet

```bash
npx tsx src/cli.ts scan --demo                             # replay a real captured wallet
npx tsx src/cli.ts scan --fixture fixtures/illustrative.json --material 100
```

`--demo` replays `fixtures/live-capture.json`, a genuine capture from a live BSC wallet with the
address redacted. `illustrative.json` is synthetic and exists to show the full range of signals the
model reads — a high-risk unverified spender, a never-used approval, differing ages — which a fresh
wallet simply does not have.

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
