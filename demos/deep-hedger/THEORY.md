# The deep hedger: problem, assumptions, theory

Reconciled on 2026-11-16, its open questions decided on 2026-11-17, from the
owner's own messages in every earlier attempt
(2,193 messages, February to October 2026: `cher`, `cher-sim`, `fable`, `fable-2`,
`sig-mmd`, `boom`, `codex-2`, `braut`, `dh`, `mano`, `neil`), read against the
documents those projects left. A decision cites the owner's words as
(project, date). What an earlier agent wrote is a claim, marked as such, unless
checked here. Section 7 says what this demo implements of it.

## 1. The problem

"The fundamental goal of this project is to statistically learn how to hedge
arbitrary payoffs in the presence of transaction costs." (cher, 02-25)

"The whole point of the project is to REPLICATE payoffs under transaction cost,
then the price will be the replication cost." (cher-sim, 05-14)

"if I generate P paths, and price the options as the cost of hedging them under
my P paths, including bid ask spread, my P path generator should be able to
calibrate to the market option prices" without measures or Q (sig-mmd, 07-06)

"each option bid/ask is priced using the hedge cost of the position. Then the
generator and the hedger are trained together to calibrate to the market option
bid/asks." (braut, 07-22)

"a model with as few parameters as possible (I do think there has to be some in
the end, like es confidence intterval or whatever), where each paramter has an
intuitive meaning, and where understanding of this model gives a competitive
edge to a trader." "The spread should emerge, and illiquidity adn slippage is a
first class citizen of the model." (neil, 10-23)

So: one generator of stock paths, one hedger that manufactures every listed
option along those paths and pays every friction, an option's ask and bid being
what manufacturing its short and its long side costs. The generator is fitted
so that today's quotes are consistent with those costs. The owner calls it "the
deep neural network data driven way of expressing the" fundamental theorem of
asset pricing, with frictions (cher-sim, 04-09; braut, 07-22).

## 2. What the owner decided

| # | Decision | The owner's words |
|---|---|---|
| 1 | Only today's option bids and asks are inputs. No historical returns. | "I have been actively against using historical stock returns as input to the model. I am trying to create a model that only take todays option prices as input since they are forward looking by definition." (mano, 09-07) |
| 2 | Bids and asks, never mids, in data, model and plots. | "one of the core ideas here is that there are NO MIDS. Theres only bids and asks." (braut, 08-05) |
| 3 | The generator is nonparametric: a combination of fixed return kernels that yields the daily log return. The number of kernels, about 50, is the one structural choice. | "The only thing I'd like to choose is how many of the kernels are used" (boom, 07-22); "N=2688 is WAY too big [...] I was imagining like ~50" (braut, 08-06) |
| 4 | No SDE, no Black-Scholes volatility, implied volatility or vega in the model; a state of the path's own volatility is allowed (2026-11-17: "what I meant with no hidden vol dynamics is that I don't want the \"BS vol\" that makes so many model assumptions, I want more of a non-parametric representation of the vol state"). IV only in plots, with the forward the quotes imply. | "The generator should be an arbitrary kernel based thing that just produces the" log return of S. "NO HIDDEN VOL DYNAMICS." (braut, 07-25); "I want to use the forward price thats implied by the market quotes for the IV conversions" (braut, 08-12) |
| 5 | No P and Q. | "there is no concept of P and Q in this approach [...] classical things for frictionless markets" (boom, 07-22) |
| 6 | No ad hoc structure: no jump channels, no targeted statistics. | "these kind of jumps should be something that emerges from the fundamental model and not something that is hard coded" (cher-sim, 06-02) |
| 7 | One hedger network for all contracts, generic across days; it never sees market quotes. It replicates; a profit-seeking copy is a later tool with its own weights. | "I want the generator to represent the market view of the distribution of the underlying, and the hedger to be sort of a generic hedger - not specific to the current market prices." (braut, 07-23) |
| 8 | The hedger's previous position is its input. | "If the next hedge didn't depend on the current hedge the transaction costs would not be relevant." (cher, 02-22) |
| 9 | Daily rebalancing; an order decided today fills tomorrow. | "Are you taking into consideration that you can't buy/sell at the same day?" (braut, 07-22) |
| 10 | Two frictions make the spread. | "For me the 2 reasons for frictions are 1: transaction costs and 2: discrete time hedging." (sig-mmd, 07-08) |
| 11 | Costs are inside the hedge, never added to a backtest afterwards; options have costs too. | "The transaction costs are built in to the model at a fundamental level" (cher-sim, 05-24); "it is crucial that the options have transaction cost" (braut, 08-13) |
| 12 | The hedger may trade the stock and every listed option at the model's own quotes, the contract being priced included. No stock-only fallback. | "Why would it make sense that the intermediate prices are the prices of hedging with stock only? Other people can hedge with options as well. This is a core idea" (braut, 07-22) |
| 13 | An option's price on a path is that path's own hedge cost; no state bins, no conditional expectations. | "the price of the option at t is the *actual* cost of hedging it until expiry using the *current* hedger for this path only [...] The only important thing is that the average gradient over the whole batch is good." (braut, 07-23) |
| 14 | The book starts empty; the payoff is in the loss; the average is the principal, which is the price. | "It should just be zero and then the payoffs are included in the loss?" "the average of this should be the principal -> this becomes the price" (braut, 08-12) |
| 15 | Generator and hedger train together, with different losses. | "If the hedger is not correct the generator will just adapt to it. The important thing is that they need different losses." (braut, 08-06) |
| 16 | Only today's quotes enter the generator's loss, and a model price inside the market's bid and ask costs nothing. | "how about only including T=0 actual market bids/asks in the loss" (braut, 07-23); "I don't want model prices that falls within the market bid/ask to generate any loss for the generator" (braut, 08-17) |
| 17 | Quotes whose price is mostly tick size carry no information and are left out; in-the-money contracts stay. | "quotes in the wings that are limited by tick size are removed" (sig-mmd, 07-08); "NOT show only OTM. I want to show all." (braut, 08-12) |
| 18 | Known event dates may be given to the generator; nothing else about them. | "the only information I want to give it is the actual date of events" (braut, 08-05) |
| 19 | Spot is 1 at the start; the hedger sees normalized observables. ReLU, ReLU, tanh: the tanh is the position limit. Dropout over hedge instruments. | "renormalize the stock price [...] so the stock price starts at 1" (braut, 08-11); "relu + relu + tanh? that gives automatic position limits" (braut, 08-12) |
| 20 | Convergence is evidence, never an epoch count; a result that depends on the seed is not converged. | "I don't want anything to have hardcoded epochs" (fable, 06-15); "If the seed has impact on the runs the models havent converged" (fable, 06-16) |
| 21 | First model a liquid name correctly; the illiquid names are the product, later. | "the first part is just to model liquid options correctly using this model, thats my goal" (codex-2, 07-17); "one of the main points is for this to work on semi illiquid names" (cher, 03-23) |
| 22 | The verdict on a hedger is a fair realized backtest at real bid and ask against a cost-aware classical hedge. | "This should be the golden numerical verdict for any model - actual fair backtest PL on read data." (fable-2, 07-01) |
| 23 | GPU kernels in Mojo, hand-written backward pass, one code path. | "The goal was to do the backprop in mojo without pytorch" (braut, 08-11); "I want to have ONE code path with no flags" (fable, 06-28) |
| 24 | Few numbers beside the generator, each with a meaning; the price of risk is an Expected Shortfall's confidence, and the market implies it. | "as few parameters as possible (I do think there has to be some in the end, like es confidence intterval or whatever), where each paramter has an intuitive meaning" (neil, 10-23); "a certain confidence level is implied by the market?" (braut, 08-17) |
| 25 | What the past teaches enters as properties of the law with their own parameters, volatility clustering first; a law of rare jumps is not a realistic one. | "express everything that comes from historical paths as parametric properties (vol clustering), not add the returns directly" (braut, 07-25); "almost all returns are close to 0 and then there are soem sudden jumps [...] it's not a realistic path law" (braut, 07-25); "shouldn't vol of vol give a lot of kurtosis?" (fable, 06-24) |

## 3. Assumptions

**Observed.** One snapshot of one name: every listed option's bid, ask, strike,
expiry and type, the stock's price, and the calendar. Nothing else (decision
1). Carry is read from the same quotes: a call less a put at one strike is
worth `D (F - K)`, and `D F` is the stock's price while no dividend falls
before the expiry, which is assumed; that gives each expiry its discount `D`
and forward `F` from the strikes near the money (decision 4). Every price is
then divided by `D F` and every strike by `F`. The model has no rate.

**Time.** Business days. One decision a day; it fills at the next day's price
(decision 9), so the last day before expiry cannot be hedged at all.

**The path law.** `x_0 = 1`, `log x_{t+1} = log x_t + s_t z_t`. The shock
`z_t` is drawn from a density that is a weighted sum of N fixed kernels on a
fixed grid; the weights are parameters, one set an interval between listed
expiries, started normal at the expiry's own at-the-money volatility. The
scale `s_t` is the path's volatility state, made of the path's own past
shocks and nothing observed (decisions 1, 25):

    log s_{t+1} = keep * log s_t + swing * (|e_t| - 0.798) + lean * e_t,    s_0 = 1

with `e_t` the shock in units of the interval's starting deviation and 0.798
the mean size of a normal one. Three numbers: `keep`, the share of the state
that lasts a day; `swing`, what a large day adds to the next day's volatility;
`lean`, what a fall adds that a rise takes away. They are fitted with the
weights. A smile's skew and its fat tails over weeks can then come from days
that cluster and lean, where a law of independent days can only make them out
of rare jumps. Event dates (decision 18) are not in it. No constraint is put
on the mean: `x` is in forward units, and a law whose mean leaves 1 puts calls
above and puts below their bands, so the forward is fitted with everything
else ("there is an implied forward price in the option chains that I sort of
hope will" emerge, boom, 07-22).

**Frictions.** A stock trade pays a fraction `c` of its value, the stock's
half-spread and slippage: a measured quantity of the name, not a fitted one.
An option trade crosses the model's own bid or ask (decision 12).

**Carry of the hedge.** The stock is bought forward, at the law's own mean
move `g_u` of the day on its path, which the day's scale decides: a position
earns the day's move less that mean. Holding
stock is then a fair game under any law, and nothing can be earned from a
drift (conflict 3). It is the ledger's statement that a forward costs its
forward price; the law itself is not corrected.

**The hedger.** A function of what a trader can see on the day: the contract's
terms relative to the stock, the time left, the side, the position held, the
path's volatility state as of the last day seen (decisions 7, 8, 19). It never sees a quote or the future.

## 4. Theory

A book is one contract on one side. Short the option, the dealer owes the
payoff `Y`; long, the dealer receives it. From an empty book the hedger trades
to expiry and ends with trading cash `W`, costs included. With the stock as
the one instrument, `q_u` the position decided on day `u - 1` and bought at
day `u`'s price, `q_0 = 0` and `T` the expiry:

    W = sum_u q_u (x_{u+1} - g_u x_u) - c sum_u |q_u - q_{u-1}| x_u - c |q_{T-1}| x_T

What is left with the dealer is the residual `L = Y - W` (short) or
`L = -Y - W` (long).

**The price is the funding of the residual** (decision 14): `ask = rho(Y - W)`,
`bid = -rho(-Y - W)`.

**`rho` is an Expected Shortfall** (decision 24):

    rho_a(L) = mean of L over all but its best share `a` of the paths
             = min over q of  q + mean(max(L - q, 0)) / (1 - a)

with one number, the confidence `a`, between 0 and 1. With the mean in its
place (`a = 0`) and the stock a fair game, a position changes a book's price
by its cost alone: nobody hedges, `bid = ask = E[Y]`, and the risk that
hedging leaves is not paid for. The owner saw it: "The bid=ask=E[Y] is a
fundamental problem. I somehow imagined that the spread would emerge from the
replication error" (braut, 08-13); "the seller should also be compensated by
taking on the risk of hedging errors" (braut, 08-13).

It is used twice, at two confidences, because one confidence cannot do both
jobs on a liquid name (section 6):

- **The hedger's**, `h`, is its risk preference and is given (0.5: it makes
  the mean of the worse half of its outcomes small). It is the mandate to
  replicate: "The whole point of the project is to REPLICATE payoffs under
  transaction cost, then the price will be the replication cost." (cher-sim,
  05-14). The hedger minimizes `rho_h` of every book.
- **The quotes'**, `a`, is what the market pays for the risk that hedge
  leaves, and is fitted: `ask = rho_a(Y - W)`, `bid = -rho_a(-Y - W)`. The
  generator's loss is zero inside a band (decision 16), so it leaves the
  width of the model's spread free, and left to it the width goes to nothing.
  The confidence is therefore moved by a loss of its own, the model's bid
  from the market's bid and its ask from the market's ask: it is the
  confidence "implied by the market" (braut, 08-17).

Then:

- `ask - bid` is the cost of the two hedges plus what the two residuals' bad
  tails exceed their means by at `a`: the two frictions of decision 10, each
  in currency, each emerging from the path law and the hedger. Nothing sets a
  spread, and there is no mid.
- `c = 0`, continuous time, a complete law: perfect replication, no spread,
  any `a`. `a = 0`: a spread of the two hedges' cost alone.
- `rho` is monotone and subadditive, which the deviation this document
  proposed on 2026-11-16 (`mean + lambda * std`) is not: a residual that is
  never worse is never charged more.

**Calibration.** The generator's loss is, over today's contracts, the distance
of the model's bid and of its ask outside the market's band, zero inside
(decision 16), in units of that quote's own width, squared up to one width
and linear beyond ("it should not explose by a few outliers if the general
fit is good", cher-sim, 04-26). The hedger's loss is the sum of `rho` over
all books; it has no quote in it (decisions 7, 15). The quote levels pin each
expiry's distribution; the widths pin what hedging between the expiries
costs, which is where the path, and not only the marginals, enters: "the
option prices DOES depend on the path, not the marginals, since the prices
are the price of hedging wchich depends on the path" (boom, 07-22).

**The generator's gradient needs no derivative of the hedger.** A hedger that
is optimal among functions of the day's information satisfies
`E[d rho / d h_t | day t] = 0`. Moving the law moves the states the hedger
sees, and the change in its positions is itself a function of the day's
information, so its first-order effect on `rho` is zero. The generator's
gradient may hold positions fixed: exact at a converged hedger when the two
confidences are one, an approximation otherwise, and measured (the README).

**No-arbitrage is a consequence**, not a constraint (neil, 10-23): one law
prices every contract, so the levels are consistent in strike and expiry, and
`rho` is subadditive, so a portfolio's ask is at most the sum of its legs'.

**The model's numbers**, each with a meaning ("as few parameters as possible
[...] where each paramter has an intuitive meaning", neil, 10-23):

| Number | What it is | Where it comes from |
|---|---|---|
| N, the count of return kernels | how smooth a day's law may be | chosen: 49 |
| the kernels' weights, one set an interval between expiries | the market's implied law of a day's shock | fitted to today's bids and asks |
| `keep`, `swing`, `lean` | how long volatility lasts, what a large day and what a fall do to it | fitted to today's bids and asks |
| `h` | the hedger's risk preference: the share of its best outcomes it does not count | given: 0.5 |
| `a` | the quotes' confidence: how much of the bad tail a price pays for | fitted to today's bids and asks |
| `c` | what a stock trade costs | the stock's own market |
| the clock and the lag | one decision a day, filled the next | the trader's situation |

The hedger's network is not among them: it is the solver, judged by the risk
it leaves.

**What a trader reads off a fitted model** (neil, 10-23: "it should be clear
if some contracts are worth buying on average since the hedged PL of those
contracts to expiry gives a good terminal PL distribution"). The model's bid
of a contract is what a dealer who hedges it as the hedger does can pay and be
left, after its charge for the bad tail, with nothing. A market ask
under the model's bid is a contract worth buying and hedging, by that much; a
market bid over the model's ask, one worth selling. Before that charge, the
trade's result on every path is the distribution itself: its mean says whether
the contract is worth buying on average, its tail what that costs.

## 5. The conflicts, as decided on 2026-11-17

Each was taken back to the owner's last and most specific words; the tasks
(`tatr ls :dh`) hold the quotations on every side.

1. **What the spread is.** Decided (decision 24, task dh-08): hedge cost plus
   an Expected Shortfall of what the hedge leaves, its confidence fitted.
   That the hedger hedges at a preference of its own is this document's
   (task dh-30). Of
   the earlier positions it gives up "there are no parameters in this models
   except for the genrator" (sig-mmd, 07-07), as the owner did on 10-23.
2. **Historical returns.** Decided (decisions 1 and 25, task dh-13): none; the
   law's memory is a property with its own parameters.
3. **Drift.** Decided as far as the owner spoke (task dh-09): the forward
   emerges, no rate, nothing corrected in the generator. That the hedge is
   carried at the law's own mean move (section 3) is this document's, for the
   owner to confirm (task dh-15): without it a hedger that minimizes `rho` is
   paid for holding a drift and the generator supplies one, measured.
4. **Pathwise option prices.** Decided by the owner every time (decision 13,
   task dh-10). It arises with options as hedge instruments (task dh-06), and
   there this document has an argument the owner has not seen (task dh-35).
   At a pathwise price an option bought is a stock strategy: a book that buys
   contract `i` on day `t` for what its short hedge will have cost on this
   path, `Y_i - W_i(t..T)`, and receives `Y_i` at expiry is left with
   `W_i(t..T)`, the gains of `i`'s own stock hedge from `t` on, its costs
   included; sold earlier at its pathwise bid, with two such sums. No payoff is
   left in the position. A book that trades such options holds nothing a stock
   strategy does not give it, so its risk cannot fall and no spread can
   tighten. An option hedges when its price is fixed on the day it trades,
   from what is known that day.
5. **The illiquid name.** The order is decided: liquid first ("Start with a
   name that is very liquid.", 2026-11-16). The illiquid run is work left
   (task dh-11).
6. **American exercise.** Postponed by the owner on 2026-11-17 (task
   dh-12). The demo leaves a put out when it is in the money and the interest
   on its strike until expiry, the most early exercise can be worth, is over
   half its band (task dh-16).

## 6. What the evidence shows

Of the earlier projects, from their own records and not rerun here:

- No realized backtest passed in any generation (`dh/docs/results/SCORECARD.md`;
  `fable/HYBRID_BACKTEST_RESULTS.md`: full panel +0.788, crisis window left
  out -0.16). The one clean positive is synthetic (`cher`, Heston paths).
- Thread B's best fit (`braut` attempt 38) put 33.9% of model prices inside
  the market band and was rejected by its trader review. `braut/mojo` v7 has
  no trained result: its last record, `run-0080`, is a stopped run of 64 paths.
- Results that looked good were repeatedly the harness: a calibrated
  checkpoint shown as a start (braut, 08-11: "It just loaded good data then
  shuffled it a bit"), a strike never given to the policy (`fable`), every
  "multi-seed" run on seed 42 (`cher-sim-v2`).

Of this demo: [the README](README.md) has the measurements, each with its
command. One of them shaped section 4: with one confidence for the hedger and
the quotes, the confidence a liquid name's tight quotes imply is so near the
mean that the hedger stops hedging, and a price is then no cost of
replication. Hence two.

## 7. What the demo implements, and what it does not

Implemented: assumptions and theory of sections 3 and 4 with **the stock as
the only hedge instrument**. This is the first experiment the owner asked for
when the idea was new ("Try this with stock only hedge", sig-mmd, 07-06) and
not the model of decision 12.

Not implemented, in the order the theory needs them:

1. Options as hedge instruments at the model's own quotes, with dropout
   (decisions 12, 19). It is where `braut` measured most of the spread to come
   from (an agent's claim: 6.27 of 6.36 bp), and what AAPL's tight quotes at
   the money point to. With pathwise prices (decision 13) it changes nothing
   (section 5, item 4).
2. Event dates as inputs of the law (decision 18).
3. The stock's cost read from the stock's own market, and growing with size
   and with the path's own turbulence ("the spreads increase/decrease with
   vol, they should definitely increase during e.g. COVID", fable, 06-28).
4. An illiquid name (conflict 5); the realized backtest (decision 22).
