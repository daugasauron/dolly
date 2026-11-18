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

(none yet)
