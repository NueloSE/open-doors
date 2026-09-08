# The risk model

Implemented in `src/score.ts` as a pure function. Same wallet, same ranking, every run.

## Exposure

```
exposure = min(approved_amount, balance_held)     # "unlimited" -> the whole balance
```

An unlimited approval over a token the wallet holds none of reaches nothing and is not worth the
user's attention. The same approval over their main stablecoin balance reaches all of it. This is
the difference between a list of approvals and a decision about what to close.

## Danger

| Signal | Multiplier | Source field |
|---|---|---|
| Spender flagged high risk | x2.5 | `riskyLevel` / `riskyMsg` |
| Unlimited scope | x1.8 | `amount == "unlimited"` |
| Never interacted with | x1.6 | `noInteractive` |
| Never expires | x1.3 | `expireTime == null` |
| Granted over 180 days ago | x1.4 | `approveTime` |
| Granted over 30 days ago | x1.15 | `approveTime` |

Reasons are emitted in that order so that the most damning survive truncation in a narrow terminal.

## Tiers

| Tier | Rule |
|---|---|
| CRITICAL | material **and** (high risk **or** (unlimited **and** never used)) |
| HIGH | material and danger >= 2.0 |
| REVIEW | reaches something and danger >= 1.5 |
| OK | everything else, collapsed behind a count |

"Material" defaults to $100 of exposure and is configurable with `--material`. The floor exists so
that a dust balance cannot produce a scary-looking row.

Ranking is `exposure x danger`, descending, with ties broken on raw exposure and then age so the
order does not depend on what order the wallet happened to return.
