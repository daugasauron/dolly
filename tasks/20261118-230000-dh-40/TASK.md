# Deep hedger, later questions: which contract hedges two-week vega; cliquets and barriers

- STATUS: OPEN
- PRIORITY: 120
- TAGS: dh,owner

The owner, 2026-11-18, on the backtest's first period (task dh-39): "This is in line with my
expectations, sounds like a decent baseline. One of the fundamental but later questions is, if
you're at a desk and want to hege 2week Vega at some level - what contract do you pick? They have
to do this stuff and BS models just aren't good at it. Ideally this kind of model would do better.
Other interesting things are cliques and various knock ins/outs where BS hedging just breaks down
completely, and this kind of model might add some edge."

And before it: "One of my goals is to have a model that can be used to hedge Vol in a realistic
setting but where the core has nothing to do with 'black sholes' or SDEs or whatever. The core is
some non-parametric deep hedging model that has 'some way' to express hedging the implied moments
of the underlying."

Not started before task dh-39's backtest has its answer.

## 1. Which contract for a two-week vega hedge at a level

Where dh-39 stands: a short straddle hedged with holdings in the chain's other contracts, chosen
under the fitted law to make the deviation of the whole book's residual small net of their
spreads, left 46 to 81 bp of deviation on real later closes where a Black vega hedge in the next
expiry's straddle left 108 to 200 (2020-09 to 2022-12, one seed). The model there may use any
number of contracts.

The desk's question is narrower: one contract, or a few, for an exposure stated as "two-week
vega at a level". In the model's terms an exposure to volatility is how a book's stock-hedged
residual moves with the law's paths; two books share it as far as their residuals move together.
So:

- State the exposure as a book (a straddle, a strangle or a calendar of about ten trading days
  at the level's strike), since the model has no vega to state it in.
- For each single contract of the chain, the holding that makes the book's residual deviation
  smallest under the law, what it costs at the real ask or bid, and the deviation left; then the
  best pair. A table by contract is the answer a desk reads.
- Against it: the contract a Black vega hedge picks (same expiry's neighbouring strike, or the
  next expiry at the strike) in its vega-neutral ratio.
- Score both on the real later closes, as dh-39 does, over the same days: deviation left, cost,
  and how often the model's pick is another contract than Black's.

## 2. Cliquets, knock-ins and knock-outs

The hedger replicates a payoff along the law's paths and nothing in it is specific to a call or
a put: a book's payoff is a function of its path. For these payoffs:

- The payoff kernel needs the path, not the last day: a running product of capped period returns
  for a cliquet, a flag that a barrier was touched for a knock-in or knock-out. The policy needs
  the same as inputs (the period's return so far and the periods left; the distance to the
  barrier and whether it was touched).
- The law is the one fitted to the listed chain. A cliquet's value turns on the law of the
  forward smile (what a month's return looks like a month from now), a barrier's on the law
  between expiries; both are what the volatility state and the intervals' laws say, and what the
  listed quotes pin least. The family of laws that fit the chain, and how far their prices for
  such a payoff are apart, is the model's own measure of that.
- A fair test without quotes for such payoffs (there are none listed): hedge the payoff on real
  history with the model's hedger against a Black delta (and its barrier formula's delta), each
  starting from its own price, and compare what each leaves: the deviation and the worst of
  price less realised hedged cost, over many start days. The stock's history is on this machine
  from 1999; the law is refitted each start day from that day's chain as in dh-39.
- With options as hedge instruments (task dh-06) the same test with a static hedge in listed
  options chosen under the law, against the classical static replication of a barrier.
