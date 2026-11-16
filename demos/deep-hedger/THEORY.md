# The deep hedger: problem, assumptions, theory

Reconciled on 2026-11-16 from the owner's own messages in every earlier attempt
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
| 4 | No SDE, no hidden volatility state, no implied volatility, vega or Black-Scholes in the model. IV only in plots, with the forward the quotes imply. | "The generator should be an arbitrary kernel based thing that just produces the" log return of S. "NO HIDDEN VOL DYNAMICS." (braut, 07-25); "I want to use the forward price thats implied by the market quotes for the IV conversions" (braut, 08-12) |
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

**The path law.** `x_0 = 1`, `log x_{t+1} = log x_t + r_t`, with `r_t` drawn
from a density that is a weighted sum of N fixed kernels on a fixed grid of
returns. The weights are the parameters. They may depend on the calendar day
(the listed expiries cut time into intervals, one weight vector each) and, in
the full model, on the path's own past returns and on event dates (decisions
3, 18). No constraint is put on the mean: `x` is in forward units, and a law
whose mean leaves 1 puts calls above and puts below their bands, so the
forward is fitted with everything else ("there is an implied forward price in
the option chains that I sort of hope will" emerge, boom, 07-22).

**Frictions.** A stock trade pays a fraction `c` of its value, the stock's
half-spread and slippage: a measured quantity of the name, not a fitted one.
An option trade crosses the model's own bid or ask (decision 12).

**Carry of the hedge.** The stock is bought forward, at the law's own mean
move `g_u` of the day: a position earns the day's move less that mean. Holding
stock is then a fair game under any law, and nothing can be earned from a
drift (conflict 3). It is the ledger's statement that a forward costs its
forward price; the law itself is not corrected.

**The hedger.** A function of what a trader can see on the day: the contract's
terms relative to the stock, the time left, the side, the position held
(decisions 7, 8, 19). It never sees a quote or the future.

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

**What `rho` is, is the open question of the whole program** (section 5). With
`rho` the mean, the stock a fair game and a hedger that only reduces variance,
`ask - bid` is the expected cost of two hedges and nothing else: the second
friction, the risk that daily hedging leaves, is not paid for. The owner saw
it: "The bid=ask=E[Y] is a fundamental problem. I somehow imagined that the
spread would emerge from the replication error" (braut, 08-13); "the seller
should also be compensated by taking on the risk of hedging errors" (braut,
08-13). This reconciliation takes

    rho(L) = mean(L) + lambda * std(L)

with one number `lambda`, the price of a unit of risk that hedging cannot
remove, and has the hedger minimize `rho` itself. Then:

- `ask - bid = (cost of the short hedge + cost of the long hedge) + lambda *
  (std of the short residual + std of the long residual)`: the two frictions of
  decision 10, each in currency, each emerging from the path law and the
  hedger. Nothing sets a spread.
- `std(L)` is the root of the owner's replication error `mean((Y - W - p)^2)`.
  The hedger still replicates; `lambda` is the rate at which it may pay cost to
  replicate better. Without that rate a squared error cannot weigh cost at
  all: centered, it ignores the mean, so it ignores cost (measured in `braut`
  attempt 10: three hedger seeds, one generator, spreads of 8, 17 and 27 bp;
  an agent's result, its note read, not rerun); uncentered, `mean((Y - W)^2)`
  penalizes cost on the short side and rewards it on the long side, where the
  mean residual is `-(E[Y] - cost)`. The second half is this reconciliation's
  own algebra; `~/dev/neil/THESIS.md` 4.3 claims the uncentered loss is the
  remedy and is wrong for the long book.
- `lambda = 0`: nobody hedges, `bid = ask = E[Y]`: the owner's first
  formulation, "something that generated stock price paths such that the
  expected value (from simulating with this) of all puts/calls on a surface
  ends up within the bid ask spread" (cher, 03-20). `c = 0`, continuous time,
  a complete law: perfect replication, no spread, any `lambda`. The classical
  models are these two corners.
- The market's spreads then imply a `lambda`, as the owner asked: "this should
  make the spread a function of the confidence level? With some imagination
  you couldn then say that a certain confidence level is implied by the
  market?" (braut, 08-17); "what does it mean to calibrate a model like this
  to the market? The implied hedge cost/risk aversion in the market?" (mano,
  09-07). For a normal residual `lambda` maps to an Expected Shortfall level;
  the standard deviation is used because it is the replication error itself
  and needs no sort. It has a known defect that Expected Shortfall has not:
  it is not monotone, a residual that is never worse can be charged more.

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
gradient may hold positions fixed: exact at a converged hedger, measured
otherwise (section 6).

**No-arbitrage is a consequence**, not a constraint (neil, 10-23): one law
prices every contract, so the levels are consistent in strike and expiry, and
`rho` is subadditive, so a portfolio's ask is at most the sum of its legs'.

## 5. Open conflicts

1. **What the spread is.** The owner's positions, in order: side-dependent
   execution alone (07-22); `price = average(W)` (08-12); `bid = ask = E[Y]`
   is a problem (08-13); mid plus mean replication error, "I like it" (08-13);
   Expected Shortfall with a confidence level (08-17), and of the standard
   error as the spread, the same day, "I can't convince myself why it makes
   sense"; "You are focusing way too much on ES and missing the big picture.
   The spread should emerge" yet "I do think there has to be some in the end,
   like es confidence intterval or whatever" (neil, 10-23). Earlier: "Why do
   you keep talking about lambda? In my mind there are no parameters in this
   models except for the genrator." (sig-mmd, 07-07). Section 4 is a
   proposal that keeps every later statement and gives up the 07-07 one. Not
   decided by the owner.
2. **Historical returns** (the conflict `mano` flags). Refused on 07-22
   ("You forgot to remove the dependence on recent historical returns"),
   allowed as a short window on 07-25 ("fine to use the actual historical
   returns with a short history"), refused on 09-07 (decision 1).
   `braut/mojo`, the newest code, still reads observed returns
   (`gpu_generator.mojo:104-139`, checked). The latest word decides: none.
   What history may give later is temporal structure "as parametric
   properties (vol clustering), not add the returns directly" (braut, 07-25).
3. **Drift.** "Regarding 0 drift, I'm not sure" (boom, 07-22). A hedger that
   minimizes `rho` holds stock for a drift once the drift over the holding
   time exceeds `lambda` times the deviation over it, whatever it hedges, and
   the generator then moves the drift: measured here before the forward was
   in the ledger (section 6). `neil/THESIS.md` 4.5 proposes to constrain the
   law's mean. The demo leaves the law free, so that the forward is fitted,
   and takes the drift out of the hedge instrument (section 3). With a law
   that has memory the mean move depends on the path's past and has to be
   computed there.
4. **Pathwise option prices** (decision 13) against the agents' objection
   that a fill price made of the path's own future is not known on the day.
   The owner asked to measure, not argue (braut, 07-22). Not measured in any
   project. It does not arise while the hedger trades the stock only.
5. **The illiquid thesis is untested.** Every attempt used AAPL or another
   liquid name; none ran an illiquid one (`fable`, an agent's audit). The
   claim that spreads are manufacturing cost is about names where they are
   wide (cher-sim, 05-23: "Thats EXACTLY the point of the whole model").
6. **American exercise.** Listed single-name options are American; the model
   prices the payoff at expiry. No project addressed it. In-the-money puts
   carry an early-exercise premium the model does not have.

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
command.

## 7. What the demo implements, and what it does not

Implemented: assumptions and theory of sections 3 and 4 with **the stock as
the only hedge instrument** and weights that depend on the calendar interval
only (independent daily returns). This is the first experiment the owner
asked for when the idea was new ("Try this with stock only hedge", sig-mmd,
07-06) and not the model of decision 12.

Not implemented, in the order the theory needs them:

1. Options as hedge instruments at the model's own quotes, pathwise, with
   dropout (decisions 12, 13, 19). It is where `braut` measured most of the
   spread to come from (an agent's claim: 6.27 of 6.36 bp).
2. Weights conditioned on the path's own past returns and on event dates
   (decisions 3, 18): without them the law has no volatility clustering.
3. The stock's cost read from the stock's own market, and growing with size
   and with the path's own turbulence ("the spreads increase/decrease with
   vol, they should definitely increase during e.g. COVID", fable, 06-28).
4. An illiquid name (conflict 5); the realized backtest (decision 22).
