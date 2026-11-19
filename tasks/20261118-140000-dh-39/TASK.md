# Deep hedger: a model that finds statistical arbitrage, and a backtest that says so

- STATUS: OPEN
- PRIORITY: 160
- TAGS: dh,owner

The owner, 2026-11-18 13:40: "Dont wait for my input... I want fable5.2 to create a model based
on my ideas that works. Those questions are things you should investigate, what makes sense, will
it result in a useful model, so on. If you get a model that finds statistical arbitrage in a
calibrated model and it holds up in backtests we're good."

And, as context: "Let's say you're a trader and you want to hedge VEGA. [...] Just saying VEGA
implies that you have some 'BS based' model and it includes a lot of assumptions. One of my goals
is to have a model that can be used to hedge Vol in a realistic setting but where the core has
nothing to do with 'black sholes' or SDEs or whatever. The core is some non-parametric deep
hedging model that has 'some way' to express hedging the implied moments of the underlying."

Brief: `work/briefs-2026-11-18/deep-hedger-model.md`.

## The three questions of task dh-38, settled here

1. **A price of risk by expiry is an implied number, not a parameter.** The trades below do not
   use it: a pick compares the market's own bid or ask with the model's mean replication cost.
   It stays what the GUI shows of a spread.
2. **One snapshot of spreads is what a trade is entered at**, so the backtest uses each day's
   quoted bid and ask as they are; the noise of a close's spread is then part of what is tested.
3. **In-the-money quotes** stay in the law's fit where the GUI keeps them and are never traded:
   their spreads are several times wider, and a listed put in the money can be exercised early.

## The backtest

Data: daily closes of AAPL's option chain with bid and ask, 2008-01 to 2025-12, and of the
stock with dividends and splits, found on this machine (`~/dev/cher-sim/data/dubach`, read only).

Protocol (`work/dh-evidence/bt-*.py`, this machine):

- A trade day each fifth trading day from 2020-09-08 (after the last split) to 2025-11-03: 214
  days with a chain. The chain of a day is built as `dh-gui` builds it, from that day's rows only;
  expiries of 3 to 30 trading days, at most five, with no ex-dividend date before them.
- The fit of a day (`bt-fit.py`, the PyTorch reference of the tree's model on the GPU) reads
  that chain file and nothing else. The score (`bt-score.py`) reads the closes that followed.
- A pick: an out-of-the-money contract whose ask is under what the model's hedged long book
  recovers on average (buy), or whose bid is over what its hedged short book costs (sell).
- Entered at the day's real ask or bid, hedged in the stock at the real closes with a cost of
  half a basis point a trade, carried to expiry. Hedges compared: the model's hedger, a Black
  delta at the entry's implied volatility with the model's one-day lag and without it, none.
- 2020-09 to 2022-12 is for choosing the rule; 2023-01 on is scored once the rule is fixed.

## Findings

Everything from "A harness error" to "The fit beyond 1.5 deviations" below was measured with
every stock trade filled a day after its decision, which decision 9 said until 2026-11-19. It is
history. The current numbers are in the last section, "Without the fill lag".

### A harness error, found and fixed (2026-11-18 evening)

The first 95 fits kept their last training step, and the law still moved from step to step
there: on fresh paths the model's values sat under the market's (20% of the out-of-the-money
contracts in band where the training's window said 73%), so the model "picked" the sale of
nearly every out-of-the-money contract and the P&L was the premium for being short options.
The picks did no better than the contracts not picked. Those fits were thrown away. The fit
(`make-bt.py`) now lets its two learning rates fall to a fiftieth over its second half, and
values every book on 131,072 fresh paths; it prints the share of middles in band on them.

### 2020-09 to 2022-12, seed 1 (96 days; the period for choosing the rule)

- The law fits within 1.5 deviations of the forward and is thin beyond: the model's middle sits
  inside the band out to 1.5 deviations (median place -0.7 to +0.1 half spreads) and 1.7 to 3.4
  half spreads under the market's mid beyond. 74% of all middles in band on fresh paths, 59% out
  of the money.
- Single contracts picked where the quote is on the wrong side of the model's value: 1847 picks,
  87% of them sales; +10.0 bp a day with the model's hedge (t 3.9), and on the selling side no
  better than the contracts not picked (-4.5 bp a day, t -0.7). The profit is the premium for
  selling options, which every out-of-the-money sale earned in that period (+15 bp a day).
- The model's hedge against a Black delta with the same one-day lag, same trades: -0.3 bp a day
  (t -0.3), the same deviation of a trade's P&L (64 against 61 bp). Without the lag the Black
  delta leaves 37 bp: the lag costs more than the hedger adds.
- Does the model's middle say which contracts are rich (`bt-fm.py`, liquid out-of-the-money
  contracts, beside moneyness, days and side)? Slope +0.63 (t 1.1; a Black delta's P&L 1.8).
  The richest fifth sold against the cheapest bought: +0.09 deviations at the mid (t 1.8),
  +0.05 at bid and ask (t 1.0).
- The best deal under the law (`bt-deal.py`: the holdings of out-of-the-money books with the
  most mean profit per deviation, scaled to a model deviation of 10 bp): seen on 75 days, +2.06
  bp a trade realised at a deviation of 3.8 (t 4.5), +1.28 entered a day late, unrelated to the
  premium of selling everything (correlation 0.06). It is the sale of options 1.5 to 5
  deviations out at a median price of 13 cents, where the law is thin: without its three
  best-liked holdings a day it makes nothing (-0.3). Not a finding until the law fits there;
  a deal among the liquid contracts within 1.5 deviations is fitted from here on.
- A short straddle hedged with the chain's other contracts as the law chooses them (bought at
  the ask, sold at the bid, held): the deviation of its realised P&L across days is 46 to 81 bp
  for the five expiries, against 130 to 188 with a Black delta alone and 108 to 200 with a
  Black vega hedge in the next expiry's straddle; the hedge's spreads cost 5 to 12 bp.

### 2020-09 to 2022-12, seed 2 beside seed 1 (2026-11-19)

| | Seed 1 | Seed 2 |
|---|---|---|
| Middles in band on fresh paths, all / out of the money | 74% / 59% | 76% / 61% |
| Single picks, the model's hedge, bp a day | +10.0 (t 3.9), 13% buys | +4.4 (t 1.5), 24% buys |
| Sales picked less sales not picked | -4.5 (t -0.7) | -7.1 (t -1.1) |
| Buys picked less buys not picked | +15.0 (t 2.7) | +11.8 (t 2.3) |
| The model's hedge less a Black delta with the same lag | -0.3 (t -0.3) | -0.2 (t -0.2) |
| Richest fifth sold less cheapest bought, at the mid / at the quotes, deviations | +0.09 (t 1.8) / +0.05 (t 1.0) | +0.08 (t 1.8) / +0.04 (t 0.9) |
| Best deal among all out-of-the-money contracts, bp a trade | +2.06 (t 4.5) on 75 days | +1.93 (t 4.8) on 83 days |
| The same entered a day late / less 65 cents a contract | +1.28 / +1.81 | +1.35 / +1.69 |
| Short straddle with the law's option hedge, deviation by expiry, bp | 46 to 81 | 47 to 84 |

- What depends on the seed: the single picks' P&L (it is the mix of sides, and so how much of
  the short-option premium a seed's picks carry). What does not: that picked sales are no better
  than the rest, the weak ordering by richness, the hedger against a lagged Black delta, the
  best deal (the two seeds agree on whether there is one on 85% of the days; their holdings'
  cosine is 0.87 and their realised P&L correlate 0.61), and the straddle's option hedge.
- The best deal among the liquid contracts only (seed 2): +1.92 bp (t 5.2), +1.42 a day late.
  It is still the sale of wings.
- **The best deal among liquid contracts within 1.5 deviations, where the law fits (seed 2):
  seen on 49 of 96 days, +0.19 bp a trade (t 0.25).** Where the model is calibrated it finds
  nothing that pays.

### The rules, fixed here for 2023-01 to 2025-11 (scored once, both seeds)

1. The best deal among all out-of-the-money contracts, among the liquid ones, and among the
   liquid ones within 1.5 deviations: realised with the model's hedge, a day late, and less 65
   cents a contract; what is left beside the premium of selling every contract; seeds beside
   each other.
2. Single picks (out of the money, the quote on the wrong side of the model's value), and
   picks less the rest of their side.
3. The richest fifth sold against the cheapest bought among liquid contracts, at the quotes.
4. A short straddle by expiry with the law's option hedge (price 0.2), a Black delta, a Black
   vega hedge: deviation and mean.

What the first period makes likely: 1 pays in the wings and not within 1.5 deviations; 2 and 3
do not pay; 4 holds.

### The fit beyond 1.5 deviations (2026-11-19)

One day (2022-02-17, seed 1) fitted with 1800 iterations in place of 600: within 1.5 deviations
the out-of-the-money middles in band go from 85% to 98%; beyond, from 63% to 68%, the median
place from 0.9 to 0.5 half spreads under the mid. So the wings are thin partly from too short a
fit and partly from the law. 4096 paths do not fit the GPU's memory beside the round. The
backtest keeps 600 iterations for both periods; a longer fit is a new model to score.

### Without the fill lag (2026-11-19): 2020-09 to 2022-12 again, both seeds

The owner, 2026-11-19: "This makes no sense to me, can we just remove it?" (THEORY.md, decision
9). The reference, `dh-fit`, the GUI and the score now trade a day's decision at that day's
close (commit 5fd0123c3). The fits and scores under the lag are kept beside these
(`build/dh-evidence/bt/lag`). 96 days, 600 iterations, both seeds fitted after that commit.

Commands (this machine): `bash work/dh-evidence/bt-run.sh SEED 20200908 20221231 600 1`;
`python -B work/dh-evidence/bt-score.py build/dh-evidence/bt/chains build/dh-evidence/bt/fits
UNDERLYING.parquet build/dh-evidence/bt/rows-sSEED.csv SEED`; `bash work/dh-evidence/bt-all.sh
2020-09-01 2022-12-31` (its output: `build/dh-evidence/bt/dev-nolag.txt`).

| | Seed 1 | Seed 2 |
|---|---|---|
| Middles in band on fresh paths, all / out of the money | 76% / 62% | 75% / 62% |
| Deviation of a hedged trade's P&L, every out-of-the-money contract both sides, bp: model / Black delta / unhedged | 58.7 / 56.8 / 216 | 58.9 / 56.8 / 216 |
| The same over the single picks | 42.5 / 40.0 / 150 | 45.2 / 41.4 / 163 |
| Single picks, the model's hedge less a Black delta, bp a day | -0.9 (t -0.9) | -0.5 (t -0.5) |
| Single picks, the model's hedge, bp a day | +6.6 (t 3.8), 16% buys | +5.4 (t 2.3), 22% buys |
| Sales picked less sales not picked | -0.1 (t -0.0) | -0.1 (t -0.0) |
| Buys picked less buys not picked | +11.3 (t 3.9) | +8.6 (t 1.6) |
| Richest fifth sold less cheapest bought, at the mid / at the quotes, deviations | +0.09 (t 2.0) / +0.03 (t 0.7) | +0.10 (t 2.8) / +0.04 (t 1.2) |
| Best deal, all out-of-the-money contracts, bp a trade | +1.51 (t 2.9) on 85 days | +1.38 (t 2.9) on 84 days |
| The same a day late / less 65 cents a contract | +0.82 (t 1.6) / +1.20 (t 2.3) | +0.81 (t 1.8) / +1.07 (t 2.2) |
| Best deal among liquid contracts | +1.49 (t 2.7) | +1.35 (t 2.7) |
| Best deal among liquid contracts within 1.5 deviations | +0.24 (t 0.2) on 54 days | -0.18 (t -0.2) on 57 days |
| Short straddle, deviation by expiry, bp: the law's option hedge / Black delta / Black vega hedge | 44 to 90 / 130 to 188 / 108 to 200 | 44 to 89 / 130 to 188 / 108 to 200 |

- **The model's stock hedge against a same-day Black delta**: it leaves 27% of the unhedged
  deviation where the delta leaves 26% (3 to 4% more deviation, both seeds), and on the picks
  half a basis point to one a day less, not distinguishable from none. With the lag gone the
  hedger does what a Black delta at the entry's implied volatility does, no better.
- **The best deal**: within 1.5 deviations, where the law fits, nothing (+0.24 and -0.18 bp, t
  0.2). Beyond, the sale of wings: +1.4 to +1.5 bp a trade at a deviation of 4 to 5 (t 2.9),
  half of it gone a day late, +1.1 to +1.2 after commission. The seeds agree on whether there is
  a deal on 91% of the days; their holdings' cosine is 0.90 and their P&L correlate 0.83.
  Without the lag it is smaller than under it (+1.9 to +2.1 then).
- The straddle's option hedge holds: 44 to 90 bp against a Black vega hedge's 108 to 200.
- The rules fixed above for 2023-01 to 2025-11 are kept as they are, with the lagged Black delta
  dropped from them: there is none now.

