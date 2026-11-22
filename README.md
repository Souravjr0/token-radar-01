[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Souravjr0/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Souravjr0/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Built for the [Token Radar bounty on make.fun](https://make.fun/bounty/token-radar-01).

# Token Launch Radar

Which pre-token protocol is worth farming next — ranked by an implied launch
value worked out from the sealed DefiLlama snapshot, not by TVL alone.

## What it is

- `main.ts` (Node 22, standard library only) reads the snapshot at
  `/input/snapshot.json`, builds a 198-row board and writes
  `board.json`, `data.js`, `dashboard/` and `dossier.json` to `/output`.
- The board covers **all 40 watchlist protocols** plus the other 158
  pre-token protocols in the snapshot that pass the same eligibility rule
  (records no token, not a wrapped / staked / bridged product, not a CEX).
  Token-bearing protocols are never on the board; the 24 largest are shown
  in the dashboard only as calibration for the comparables ratios.
- The dashboard is a static page with no network: board, watchlist view,
  live-token calibration view, search / category / sort / watchlist filters,
  and a detail view for every protocol with a model breakdown and farm plan.

## The value model (radar-2-comps)

```
implied = TVL x category ratio x growth x maturity x chain breadth
```

- **Category ratio:** median market-cap / TVL of token-bearing protocols
  in the same category in this snapshot, only where at least 5 exist,
  otherwise the global median (0.205), clipped to 0.10–0.45.
- **Growth:** 7-day TVL change, clamped to −40%…+60%, at 0.6 weight.
- **Maturity:** 0.70–1.00 over 0–1,095 days since `listed_at`
  (365 days when unlisted) — longer-running with no token, higher.
- **Chain breadth:** +2% per extra chain, to 1.20.
- No protocol name is special-cased. The same function scores every row.

Top of the board on the 2026-11-14 snapshot: Steakhouse Financial
($567m implied), Sentora Curator ($493m), Gauntlet ($340m), Veda ($319m),
USDD ($192m). Total implied value across 198 rows: about $4.0bn.

## Farm plans

Each row carries 5 steps, category-specific, each with a cost and a time:
set up a wallet, do the protocol's core action with real funds, repeat on a
second chain or vault, stay active for 30–90 days, then check eligibility
and claim within 7 days if a claim opens. Capital tiers are $100 / $250 /
$500 / $1,000 by TVL. Gas is estimated by chain.

## Language that matters

A protocol "records no token" — that is what DefiLlama's record says, never
a claim it has no token. Implied value is this radar's own claim, never a
prediction that a token will launch, or when.

## Run it locally

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
# then open out/dashboard/index.html in a browser (it reads ../data.js)
```

No network, no dependencies, no API keys. Deterministic: two runs write
identical bytes.

## Files

- `main.ts` — entrypoint
- `lib/model.ts` — snapshot parsing, comparables, implied value, farm plans
- `vendor/makefun-board.ts` — dossier builder supplied with the kit
- `dashboard/` — index.html, app.css, app.js (static, no network)
- `screenshots/` — board, detail view, filtered view
