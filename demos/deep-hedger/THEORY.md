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
| 9 | Daily rebalancing. A decision made on a day's information trades at that day's prices, the stock at its spread and options at their bid or ask. A position entered on a day is held until the next decision, so a contract cannot be bought and closed the same day, and closing it later pays that day's spread. Until 2026-11-19 this row read "an order decided today fills tomorrow", from the same words of 07-22; that was a misreading, and it cost the hedger a day it could have hedged. | "This makes no sense to me, can we just remove it? I think what I meant was regarding \"self trading\" a contract, where the initial pushback from claude was that you can just exit the contract directly as a hedge. But my pushback to the pushback was that the option position entered at any day won't change until the next hedge (next day) and then to exit that position you'd have to pay the spread." (2026-11-19); "Are you taking into consideration that you can't buy/sell at the same day?" (braut, 07-22) |
| 10 | Two frictions make the spread. | "For me the 2 reasons for frictions are 1: transaction costs and 2: discrete time hedging." (sig-mmd, 07-08) |
| 11 | Costs are inside the hedge, never added to a backtest afterwards; options have costs too. | "The transaction costs are built in to the model at a fundamental level" (cher-sim, 05-24); "it is crucial that the options have transaction cost" (braut, 08-13) |
| 12 | The hedger may trade the stock and every listed option at the model's own quotes, the contract being priced included. No stock-only fallback. | "Why would it make sense that the intermediate prices are the prices of hedging with stock only? Other people can hedge with options as well. This is a core idea" (braut, 07-22) |
| 13 | An option's price on a path is that path's own hedge cost; no state bins, no conditional expectations. Superseded on 2026-11-17 by decision 28. | "the price of the option at t is the *actual* cost of hedging it until expiry using the *current* hedger for this path only [...] The only important thing is that the average gradient over the whole batch is good." (braut, 07-23) |
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
| 24 | Few numbers beside the generator, each with a meaning; the market implies the price of risk. That it is an Expected Shortfall's confidence is superseded by decisions 26 and 27. | "as few parameters as possible (I do think there has to be some in the end, like es confidence intterval or whatever), where each paramter has an intuitive meaning" (neil, 10-23); "a certain confidence level is implied by the market?" (braut, 08-17) |
| 25 | What the past teaches enters as properties of the law with their own parameters, volatility clustering first; a law of rare jumps is not a realistic one. | "express everything that comes from historical paths as parametric properties (vol clustering), not add the returns directly" (braut, 07-25); "almost all returns are close to 0 and then there are soem sudden jumps [...] it's not a realistic path law" (braut, 07-25); "shouldn't vol of vol give a lot of kurtosis?" (fable, 06-24) |
| 26 | The hedger replicates, with a loss that has no side: its costs are inside what it makes small. | "it should minimize the difference between the payoff to hedge and the \"replication PL\""; "ES for example has a side, but MSE is symmetric so it doesn't have the drift problem" (2026-11-17) |
| 27 | The price of risk is the loss risked before a position can be closed, and the cost of closing it; it is tied to how hard it is to get out, and today's spreads imply it. | "The \"price of risk\" is how much you risk loosing before you're able to close out the position, and how much that would cost."; "the model bid/ask matches the market bid/ask meaning that hte \"risk/time to get out/etc\" is what is implied in the market" (2026-11-17) |
| 28 | On every day of a path the stock's price with its spread and every option's quote are known that day; a book may hedge with options at them. | "there is no such thing as a \"pathwise rule\" [...] the things that are known to me today are the price of the underlying (including spread), and all the option quotes today, induced backwards from yesterday *somehow*" (2026-11-17) |
| 29 | The tick is no parameter of the model, and must not distort the wings. | "The trader doesn't care bout the tick."; "I just dont want weird errors because tick sizeo nthe wings." (2026-11-17) |
| 30 | The model is a fundamental theorem of asset pricing with spreads and slippage as first class parameters: market makers set the spread, offer the quotes, keep the spread as profit and hedge everything else. Demand for options as hedges of other contracts is set aside. | "The idea is to do something like the fundamental theorem of asset pricing, but with spreads and slippage as first class parameters. In classical financial mathematics, there is no edge, and no spread. [...] the spread is determined by the sell side/market makers. The market makers think that they can offer those quotes, get the \"spread\" as profit, and hedge everything else. This is not entirely true since there is some demand for options as hedges for other types of contracts as well but lets disregard that for now." (2026-11-18) |
| 31 | No model is decided: assumptions are tried until one gives a model that makes sense. The spread may be an output of the network, or the bids and asks directly. | "there is no model decided yet, this is still in experimentation phase where we are trying to use assumptions to deriva a model that makes sense. [...] somehow the spread would be an output of the neural net, or even that the bids/asks are the output directly." (2026-11-18) |
| 32 | The model is good when it finds statistical arbitrage in a calibrated model and that holds up in backtests. | "If you get a model that finds statistical arbitrage in a calibrated model and it holds up in backtests we're good." (2026-11-18) |
| 33 | The model must hedge volatility without a Black-Scholes core: some way to express hedging the implied moments of the underlying. The desk's question is which contract to pick. | "a model that can be used to hedge Vol in a realistic setting but where the core has nothing to do with \"black sholes\" or SDEs"; "if you're at a desk and want to hege 2week Vega at some level - what contract do you pick?" (2026-11-18) |

## 3. Assumptions

**Observed.** One snapshot of one name: every listed option's bid, ask, strike,
expiry and type, the stock's price, and the calendar. Nothing else (decision
1). Carry is read from the same quotes: a call less a put at one strike is
worth `D (F - K)`, and `D F` is the stock's price while no dividend falls
before the expiry, which is assumed; that gives each expiry its discount `D`
and forward `F` from the strikes near the money (decision 4). Every price is
then divided by `D F` and every strike by `F`. The model has no rate.

**Time.** Business days. One decision a day, at the close, traded at that
close and held to the next (decision 9). A book trades from the day it is
opened to the last day before its expiry.

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

The owner's words of 2026-11-17 decide what follows; where a step is this
document's, it says so.

**The hedger replicates, with a loss that has no side** (the owner: "it should
minimize the difference between the payoff to hedge and the \"replication
PL\""; "ES for example has a side, but MSE is symmetric so it doesn't have the
drift problem"). Here: it makes the deviation of each book's residual small.
Costs are inside the residual. Nothing in the hedger prefers a gain to a loss,
so a drift pays it nothing; the stock is still carried at the law's mean move
(section 3), which keeps a drift out of the price as well.

**The middle of a quote is what replication costs on average**: `m = mean(L)`,
for the short book the expected payoff plus the hedge's costs, for the long
book the expected payoff less them. On a later day `t` of a path it is the
same mean given what is known that day, the stock and the volatility state:
`V_t`. This is "the option quotes today, induced backwards".

**The spread pays for the risk of not being out yet** (the owner: "The \"price
of risk\" is how much you risk loosing before you're able to close out the
position, and how much that would cost"; "everything is \"other dealers giving
prices\""; "the model bid/ask matches the market bid/ask meaning that hte
\"risk/time to get out/etc\" is what is implied in the market"). A book's
residual is a sum of days: `L - m = R_0 + R_1 + ...`, where `R_t` is what day
`t` adds that the day's hedge did not cover, `R_t = V_{t+1} - V_t` less the
day's hedge gain plus its cost. The days are uncorrelated, so the variance
still to come from day `h` on, `U_h`, falls from the whole residual's `U_0` to
nothing at expiry, and `U_0 - U_h` is the variance of the first `h` days. `U_h`
is measurable: it is the variance the cost-to-go from day `h` has left once the
stock and the volatility state of day `h` are known.

**What closes the loop** is this document's, and it is where the model is not
finished. If a dealer gets out by paying another dealer's quote, and that
dealer's quote pays for the same risk, getting out costs what carrying on
costs: nothing is gained and nothing is lost by it. So the loop does not blow
up; it only says a quote is the sum of what each day's holder charges. What it
leaves open is who holds, for how long, before the position is gone. Three
closures, each with one number that the market's spreads imply:

1. **A chain of dealers.** Each holds a day and passes the book on at the next
   day's quote. `ask - m = k * sum_t dev(R_t)`: the spread is the price `k` of
   a day's deviation, summed over the days to expiry.
2. **Out after `h` days.** The holder carries the book `h` days and is then out
   at the middle, the position having met its opposite.
   `ask - m = dev(R_0 + ... + R_{h-1}) = sqrt(U_0 - U_h)`: the spread is one
   deviation of what can happen before the holder is out. The number is `h`,
   the time to get out. With no quotes it is the expiry; with tight ones a day
   (the owner's two extremes).
3. **Held to expiry.** `ask - m = k * sqrt(U_0)`: one price of the whole
   residual's deviation. It is closure 2 with no way out, and what the first
   version of this demo did.

Each is well posed and has one answer: `m`, `U_h` and the days' deviations are
made by the law and the hedger, backward from the payoff, and the closure adds
its number. They differ in the shape they give the spreads across strikes and
expiries, which the market's quotes can tell apart: the right closure is the
one under which few numbers serve the whole chain.

**What AAPL's chain said** (the README has the numbers). No closure serves
the chain with one number for the name: the market's spreads differ between
expiries by more than any risk does, the monthly expiries tight, the weekly
ones two to three times wider, two odd-dated ones five to fifteen times. So the
number is an
expiry's: each listed expiry has its own liquidity, and the market implies it.
The model reads no volume; the order its numbers put the expiries in is the
order of their open interest in the feed (the monthlies 0.7 to 1.3 million
contracts, the weeklies 30 to 100 thousand, the odd-dated two thousand).
And out of the money the market's spreads are flatter across strikes than
any risk, which falls away in the wings: every contract pays a floor of about
a tick besides (the owner on ticks: "the smallest possible tick having
gigantic consequences for the wings"). With a floor for the name and a number
for each expiry, closures 1 and 3 leave the model's spreads within a factor
of 1.3 of the market's for the middle half of the out-of-the-money contracts,
and cannot be told apart; closure 2 does worse, a few days' risk being more
peaked at the money than the market's spreads are. In the money the market's
spreads are ten to thirty times wider than any closure's: those quotes are not made by
this risk.

Besides the closure's numbers there is the reading that needs none: **the
implied days to get out** of a contract, the `h` at which
`sqrt(U_0 - U_h)` plus the floor and the hedge's cost equals half its market
spread, as an implied volatility is read off a price. In that unit a spread
in the money and one at the money are comparable, and no formula of prices
stands between them (the owner: "a space that is more symmetric but not
parametric").

**Calibration.** The model's ask is the short book's middle plus the charge
of the nearest closure, its bid the long book's middle less it. The
generator's loss is, over today's contracts, the distance of that bid and that
ask outside the market's band, zero inside (decision 16), in units of that
quote's own width, squared up to one width and linear beyond. The hedger's
loss is the sum of the books' deviations; it has no quote in it (decisions 7,
15). The closure's numbers are found at each report from the law's and the
hedger's risks and the market's spreads, and held until the next: the law
feels the spreads through the charge, not through a gradient of it. A quote a
tick wide is not taken at its word: a contract's market spread counts as at
least three ticks.

**The generator's gradient needs no derivative of the hedger** where the loss
is the hedger's own; here the loss is the quotes' and the hedger makes
deviations small, so holding positions fixed is an approximation: the
positions move a middle only through the hedge's costs. It is measured
(the README).

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
| `c` | what a stock trade costs | the stock's own market |
| the floor, in ticks | the least any contract of the name costs to deal in | implied by today's spreads |
| an expiry's number: `k`, or `h` in days | what a day's risk costs in that expiry, or how long its holder is in before he is out | implied by today's spreads |
| the clock | one decision a day, traded at that day's close and held to the next | the trader's situation |

The hedger's network is not among them: it is the solver, judged by the risk
it leaves.

**What a trader reads off a fitted model.** For every contract: what
replicating it costs on average on either side, how much of the risk the
hedge leaves, and how many days of that risk its market spread pays for. A
contract whose spread pays for more days than its neighbours' is expensive to
trade against the others; one whose spread pays for less than a day is priced
as if its holder were out by tomorrow. And as before (neil, 10-23: "it should
be clear if some contracts are worth buying on average since the hedged PL of
those contracts to expiry gives a good terminal PL distribution"): a trade at
the market's price, hedged, has its result on every path.

## 5. The conflicts, as decided on 2026-11-17

Each was taken back to the owner's last and most specific words; the tasks
(`tatr ls :dh`) hold the quotations on every side.

1. **What the spread is.** Decided again by the owner on 2026-11-17 (task
   dh-30), against the Expected Shortfall this document took from decision 24:
   the hedger replicates with a loss that has no side, and the spread is "how
   much you risk loosing before you're able to close out the position, and how
   much that would cost", implied by today's quotes. What closes that loop is
   open (section 4). Of
   the earlier positions it gives up "there are no parameters in this models
   except for the genrator" (sig-mmd, 07-07), as the owner did on 10-23.
2. **Historical returns.** Decided (decisions 1 and 25, task dh-13): none; the
   law's memory is a property with its own parameters.
3. **Drift.** Decided as far as the owner spoke (task dh-09): the forward
   emerges, no rate, nothing corrected in the generator. That the hedge is
   carried at the law's own mean move (section 3) is this document's, for the
   owner to confirm (task dh-15): without it a hedger that minimizes `rho` is
   paid for holding a drift and the generator supplies one, measured.
4. **Option prices along a path.** Settled by the owner on 2026-11-17, against
   decision 13 as it was read here: "there is no such thing as a \"pathwise
   rule\"". On every day of a path the stock's price with its spread and every
   option's quote are known that day, "induced backwards from yesterday
   *somehow*", and a book may buy protection at them. How a day's quotes are
   made from the next day's is open (task dh-06).
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
the only hedge instrument** (against decision 28), and with the closures'
numbers read off at each report, not fitted by a gradient. The stock alone
is the first experiment the owner asked for
when the idea was new ("Try this with stock only hedge", sig-mmd, 07-06) and
not the model of decision 12.

Not implemented, in the order the theory needs them:

1. Options as hedge instruments at the model's own quotes, with dropout
   (decisions 12, 19). It is where `braut` measured most of the spread to come
   from (an agent's claim: 6.27 of 6.36 bp), and what AAPL's tight quotes at
   the money point to.
2. Event dates as inputs of the law (decision 18).
3. The stock's cost read from the stock's own market, and growing with size
   and with the path's own turbulence ("the spreads increase/decrease with
   vol, they should definitely increase during e.g. COVID", fable, 06-28).
4. An illiquid name (conflict 5); the realized backtest (decision 22).

## 8. Exposure to volatility in the model's terms, and the backtest (2026-11-18)

Sources: the owner's (decisions 32, 33); the lay-off rule and the measurements are this work's
(tasks dh-38, dh-39; `work/research/deep-hedger-2026-11-18.md` outside the tree).

**What an exposure is.** The model has no vega. A book has a residual on every path of the law:
what its payoff costs less what its stock hedge made. The residual's mean is the book's value;
its movement across the paths is everything the stock cannot hedge, which is the book's exposure
to how the law's days come out: quiet or wild (the volatility state), and with what tails (each
interval's law, which is where the quotes' implied moments are). Two books share an exposure as
far as their residuals move together under the law.

**What hedging it is.** Holdings in other listed contracts, bought at their asks and sold at
their bids, that make the deviation of the whole book's residual small, net of what their spreads
cost: one number, the price at which a deviation is worth paying a spread for, sets how far to
go. This is decision 28 with the options bought today and held; trading them on later days
needs the model's later-day quotes, which are not built.

**Why other dealers' quotes close the model.** If every dealer asks its mean replication cost
plus a price times its residual's deviation, no dealer gains by passing part of a position to
another at that dealer's quote, because the deviation of a sum is at most the sum of the
deviations. So that rule is consistent with "everything is other dealers giving prices"; a rule
on a variance is not.

**What was measured** (AAPL, weekly trade days 2020-09 to 2022-12, each day's model fitted from
that day's chain alone and scored on the real closes after it; two seeds; task dh-39 has the
table and the commands, and what the same period gave under the fill lag decision 9 had before):

- A short straddle hedged this way left 44 to 90 bp of deviation in its realised P&L, by
  expiry; a Black delta alone 130 to 188; a Black vega hedge in the next expiry's straddle 108
  to 200. The option hedge's spreads cost 4 to 10 bp. The model may use many contracts where
  the vega hedge uses one.
- The hedger's stock hedge leaves 27% of the unhedged deviation of an out-of-the-money trade,
  a Black delta at the entry's implied volatility 26%. The hedger is no better than the delta.
- Where the law fits (within 1.5 deviations of the forward) the best deal the model sees at the
  market's quotes made nothing (+0.24 and -0.18 bp a trade, t 0.2). Beyond 1.5 deviations the
  law prices under the market, the model sells those wings, and that paid in this period (+1.4
  to +1.5 bp a trade at a deviation of 4 to 5, both seeds, half of it gone a day late): the
  premium of far options, which a law too thin there cannot tell from a mispricing.

**2023-01 to 2025-11, scored once with the rules fixed on the first period** (118 days, both
seeds; task dh-39): the model does not find statistical arbitrage that holds up (decision 32).

- Within 1.5 deviations its best deal lost (-1.8 and -2.1 bp a trade). The sale of wings paid
  for one seed (+1.6 bp, t 3.0) and not for the other (-0.1), and lost 75 to 86 bp on the trade
  entered before the fall of April 2025: a premium with a tail, and a result that depends on the
  seed is not one (decision 20).
- The hedger's stock hedge left 8% more deviation than a Black delta at the entry's implied
  volatility (82 against 76 bp over all out-of-the-money trades; 177 unhedged).
- The straddle's option hedge held: 41 to 100 bp of deviation by expiry, against 149 to 204 with
  a Black delta and 123 to 140 with a Black vega hedge, for 3 to 8 bp of spreads. This is the
  one thing the model does better than the classical hedge on real data, in both periods and on
  both seeds, and what task dh-40 builds on.
