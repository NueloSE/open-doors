# baw commands used

Every call appends `--json`.

## Read

```bash
baw wallet status --json
baw wallet chains --json
baw wallet balance  [--binanceChainId <id>] --json
baw approvals list  [--binanceChainId <id>] [--spender <addr>] --json
baw approvals detail --binanceChainId <id> --tokenContract <addr> --spender <addr> --type <approve|permit2> --json
```

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
