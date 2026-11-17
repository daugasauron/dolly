# Deep hedger, for the owner: who holds, and for how long

- STATUS: OPEN
- PRIORITY: 145
- TAGS: dh,owner

What the night of 2026-11-17 could not settle (`demos/deep-hedger/THEORY.md`, section 4; task
dh-36). The owner: "everything is \"other dealers giving prices\" and the thing that anchors
everything in reality is that the spread should be similar to the spread of todays quotes".

## State 2026-11-18

Three closures were measured on AAPL's chain, each with a floor of about a tick for the name
and one number for each expiry:

1. a chain of dealers, each holding a day: the spread is the price of a day's deviation, summed
   to expiry;
2. a holder who is out after some days at the middle: the spread is one deviation of those days;
3. a holder to expiry: the spread is a price of the whole residual's deviation.

The first and the third fit the out-of-the-money spreads equally (within a factor of 1.3 for the
middle half) and cannot be told apart on this chain; the second fits worse. None explains the
in-the-money spreads, ten to thirty times wider.

For the owner:

- Is "each expiry has its own liquidity, read off its spreads" what you mean by the time to get
  out being implied by the market? It takes one number an expiry, eight on this chain, not one
  for the name.
- The first and the third closure differ in what a dealer is: one who passes the book on each
  day at the next dealer's quote, or one who holds it. The chain cannot say; which is the
  market you have in mind?
- The floor: every contract's spread holds about a tick that no risk explains. Is that the
  tick, as you said of the wings, or a cost of dealing you would name otherwise?

What would tell the first from the third without the owner: a name whose expiries differ more
in length than AAPL's eight (task dh-20), since a sum of days and a whole residual grow
differently with the days to expiry.

A fourth, tried in the night as a variant and not in the tree (`work/dh-evidence/loop.py`,
`build/dh-evidence/batch13-loop-run.log`, this machine): under the third closure the hedger
trades cost against risk at its expiry's implied price, making small its mean residual plus that
price times its deviation, which is its quote and has no side. Then a hedge is as tight as the
market's spreads pay for, and the model is one loop: the spreads imply the price, the price
sets the hedge, the hedge sets the risk the spreads are read against. On AAPL the loop settles
by iteration at one answer and changes little: the hedger leaves 37% of the risk where the
replicating one leaves 35%, at a hedge cost of 0.000071 of the forward against 0.000075, the
expiries' prices near the replicating hedger's (within a sixth but for the first), the same 65%
of the quotes in band.
Stock is cheap enough to trade that even at these prices of risk the hedger hedges nearly in
full. It would matter in a name where the stock is dear to trade.

## The owner's answer, 2026-11-18

"Let me rephrase everything in a more simple way. I want you to go back to the fundamentals.
The idea is to do something like the fundamental theorem of asset pricing, but with spreads and
slippage as first class parameters. In classical financial mathematics, there is no edge, and
no spread. How I think about it in this case is that, the spread is determined by the sell
side/market makers. The market makers think that they can offer those quotes, get the "spread"
as profit, and hedge everything else. This is not entirely true since there is some demand for
options as hedges for other types of contracts as well but lets disregard that for now. Does
that answer your 3 questions?"

What it settles (THEORY.md, decision 30):

- Who holds: one market maker, who hedges its book to expiry. No chain of dealers, no days
  after which it is out. The closure held to expiry stays; the other two go.
- The spread is the market makers' and is read off the quotes. The model does not explain its
  width from a risk and a fitted price of it; what a spread is against the hedge's cost and
  against what the hedge leaves is a measurement, by contract.
- The tick: no fitted floor. A quote is known to within a tick, and no more is said of it.

The integrator's reading had, for the first, one price of unhedged risk for the name with the
expiries' differences left to the demand set aside. The owner's words do not say that there is
such a price; with one number the model's half spreads are a factor of three from the market's
(miss 1.2). Put to the owner.

Open after it: on a later day of a path the hedger trades options at that day's quotes
(decision 28), so the model must say what a spread is on a later day. The reading put to the
owner: by the rule that gives today's spreads on today's chain.

