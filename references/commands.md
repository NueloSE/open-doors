# baw commands used

Every call appends `--json`.

## Read

```bash
baw wallet status --json
baw wallet chains --json
baw wallet balance  [--symbol <sym>] [--tokenAddress <addr>] [--binanceChainId <id>] --json
baw approvals list  [--spender <addr>] [--filterTypes <types>] [--limit <n>] [--offset <cursor>] --json
baw approvals detail --binanceChainId <id> --tokenContract <addr> --spender <addr> --type <approve|permit2> --json
```

Verified against `baw` 1.9.0, which differs from the published docs in three ways
that matter:

- **`approvals list` takes no `--binanceChainId`.** It returns every chain at once;
  filter client-side.
- **`--offset` is an opaque cursor**, not a numeric index. Page until a short page
  or an unchanged cursor.
- **`--filterTypes` exposes a `medium_risk` tier** (`high_risk`, `medium_risk`,
  `non_interactive`, `others`) that the docs do not mention.

`wallet chains` returns `name` / `simpleName` rather than `chainName`.

`approvals list` returns `data.list[]` with:

| Field | Notes |
|---|---|
| `tokenSymbol`, `tokenContract`, `tokenDecimals` | the token |
| `spender` | the contract holding the permission |
| `spenderName`, `spenderIcon` | **nullable** — fall back to the raw address |
| `amount` | human-readable, or the literal string `"unlimited"` |
| `riskyLevel` | `low` / `high` |
| `riskyMsg` | **nullable** — e.g. "Spender contract is unverified" |
| `binanceChainId`, `chainName` | the chain |
| `type` | `approve` or `permit2` — **required to revoke** |
| `noInteractive` | **nullable** — true means never interacted with |
| `approveTime` | unix ms |

`expireTime` appears only on `approvals detail`. **Null means never expires.**

## Write

```bash
baw approvals revoke --binanceChainId <id> --tokenContract <addr> --spender <addr> --type <approve|permit2> --json
```

Returns `{ orderId, status: "BROADCASTED", txHash }`.

**`BROADCASTED` is not confirmation.** The approval remains effective until the transaction confirms
on-chain. Track with `baw wallet tx-history --json`.

## Generating approvals for a demo

A fresh wallet has none. Two or three small swaps in **different pairs** create different spenders:

```bash
baw market-order quote --json
baw market-order swap  --json
```
