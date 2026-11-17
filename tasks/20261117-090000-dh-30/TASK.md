# Deep hedger, to confirm: two confidences, and the tight quotes decide the quotes'

- STATUS: OPEN
- PRIORITY: 80
- TAGS: dh,owner

Two choices of 2026-11-17, not the owner's decisions (`demos/deep-hedger/THEORY.md`, section
4; task dh-28). The owner's sentence has one confidence: "Use Expected shortfall with some
parameter as the risk preference, this should make the spread a function of the confidence
level?" (braut, 2026-08-17).

1. The hedger hedges at a risk preference of its own, typed (0.5), and the quotes are priced at
   another confidence. With one for both, the confidence AAPL's quotes imply is so low that the
   hedger stops hedging (task dh-28), and the price is then no cost of replication.
2. The quotes' confidence is fitted so that the model's bid is at the market's bid and its ask
   at the market's ask, each distance counted in widths of that contract's own band, as the
   generator's loss counts.

## State 2026-11-17

In `dh-fit.mojo` (`quote`, `adjoint`). On AAPL the second gives 0.0016 after 900 iterations, two seeds alike (task dh-19): the
contracts with bands of a cent or two decide.

What the other answers change. One confidence, typed: at a low one nobody hedges; at one where
the hedger hedges the model's spreads at the money are many times the market's bands and the
quotes no longer pin the law. The quotes' confidence counted in currency: the wide bands decide, the confidence
comes out near the one at which the model's spreads add up to the market's (the earlier
measurement put that risk price at 0.12 deviations), and the model's spreads at the money are
then wider than the market's bands there, so fewer quotes fit. A third: the confidence typed,
as the stock's cost is. Waits for the owner.

## The owner, 2026-11-17 evening, second answer

On the loss: the owner meant tick size, not contract size: "especially the smallest possible
tick having gigantic consequences for the wings". On who is paid: "I think in terms of how much
it costs to get out of a position. In a liquid name you can get out at any time, so the spread
is mostly to \"be able to hedge quickly enough\" [...] In an illiquid name, it's very expensice
to get out, so the hedger needs more spread." So a spread that is mostly cost in AAPL is what
the owner expects. On the hedger: it replicates, the trading cost being inside the miss it
makes small; the Expected Shortfall and its two confidences are not the owner's (asked again).

## The owner, 2026-11-17 evening, third answer

The hedger's aim, settled: "How much does it cost me to replicate it? The \"replication
PL\"/\"hedge PL\" is the sum of all trades and their payoffs including transaction costs. So
yes, it should minimize the difference between the payoff to hedge and the \"replication PL\"."
No Expected Shortfall, no confidence. Ticks: "Keep vague for now, I just dont want weird errors
because tick sizeo nthe wings." A sketch of the model that follows is with the owner; no code
changes before the owner agrees to it.
