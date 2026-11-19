# Deep hedger

An option-pricing model in which a contract's bid and ask are what hedging its
two sides costs, fitted to a live option chain in Mojo kernels on WebGPU. The
model, its assumptions and where they come from: [THEORY.md](THEORY.md).

## Images

- `deep-hedger`: a shell with `dh-gui` in front of it: load a chain, fit, watch the model's bids and asks against the market's. Requires WebGPU.
- `deep-hedger-build`: the package that holds the build of `dh-fit` and `dh-gui`.

## Using it

Open `/deep-hedger/`. **Load quotes** fetches AAPL's chain; **Fit** starts
`dh-fit` on it and **Stop** ends it. A fit has no last iteration: it runs
until stopped, on fresh paths every iteration. **Quit** leaves the shell.

- **Volatility** and **Price**: for each expiry its calls and its puts. A
  market quote is a bar from bid to ask; the model's bid and ask are lines:
  what replicating the contract costs on average, less or plus the charge of
  the Spreads tab's nearest closure. The volatility is Black's at the forward
  the quotes imply; the model has none. Under the pointer, the nearest
  contract's numbers; a click shows the plot's expiry alone, another all
  again.
- **Spreads**: what the market's spreads imply (THEORY.md, section 4). Above,
  for each expiry, half the market's spread of every contract and the
  model's under each of the three closures, each with the floor every
  contract pays and its one number for the expiry. Below, the days of the
  hedged book's risk each market spread pays for: the unit in which a spread
  in the money and one at the money are comparable.
- **Law**: the density of a day's shock in each interval between expiries;
  paths, 28 as they come and the batch's ten lowest and ten highest; those
  paths' scale by day; what the volatility state does; and the batch's days
  by interval: deviation, skewness, excess kurtosis, and how a day's size
  goes with the day before's.
- **Hedge**: what the hedger does, the part of the model no quote shows, for
  the contracts whose rows were clicked in the Quotes tab, three at most, or
  else three calls of the middle expiry (its lowest strike, the one nearest
  the forward, its highest). Above, the stock it holds from each day, short one,
  along twelve of the Law tab's paths. Below, as histograms over the last
  batch's paths, what selling the contract at the market's bid, or buying it at
  the market's ask, and hedging to expiry came to: the mean says whether the
  trade is worth doing on average, the worst twentieth what that risks.
- **Quotes**: every contract's bid and ask, the market's and the model's, in
  currency; the days its spread pays for; and for a trade at the market's
  price, hedged, its mean result over the paths, a gain in colour, and the
  mean of its worst twentieth.
- **Fit**: by expiry, the forward the quotes imply and the model's, how many
  model bids and asks are inside the market's band, the market's mean spread
  and the model's, how much of the model's is hedging cost, the risk the
  hedger leaves as a share of not hedging, the days its spreads pay for and
  its number under the nearest closure; and by iteration the loss and the
  share of the middles in band.
- **Network**: what the fit holds at its last report, a cell a number, blue
  below zero and orange above: the hedger's weights and offsets by layer,
  the law's weights by interval and kernel (as the probabilities its logits
  give, an interval's summing to one: the logits themselves are large and
  negative away from the middle, and a grid of them is one colour; the logit
  is under the pointer), and the volatility state's three numbers; and beside each value Adam's mean of its gradient, the root of
  Adam's mean of the gradient's square, and their ratio, which times the
  learning rate is the step Adam takes. Each grid has its own scale, shown
  under it; the number of a cell is under the pointer. `dh-fit` writes these
  numbers with each report (three `DH net` lines for each of the three).
- **Picks**: the trades the model would pick on the loaded chain (an
  out-of-the-money contract whose bid is over what manufacturing it costs on
  average, or whose ask is under what holding it recovers), with the mean
  gain, the deviation the hedge leaves and whether the strike is within 1.5
  deviations of the forward; and under it what such picks did on AAPL's
  history, [`backtest.tsv`](backtest.tsv), which the image carries.

The line under the buttons is the fit's state: the iteration, the share of
the model's bids and asks inside the market's bands, the loss and whether it
still falls, and the closure the spreads are nearest to.

**stock cost** is what a stock trade pays, in basis points of its value: it is
typed, the feed having no quote of the stock. **paths** is the batch. Changing
one takes effect at the next **Fit**, which starts again, with another seed.

## Data

`api.marketdata.app/v1/options/chain/SYMBOL/`, one request for the contracts
of the next 100 days, fetched by `curl` through the HTTP broker: the service
answers any origin (`access-control-allow-origin: *`). Without a token it
serves AAPL alone, with the last session's quotes; a token typed into the GUI
is sent as the request's `Authorization` header to that host and kept nowhere.
Yahoo, Cboe and Nasdaq serve chains too, without that header, so a page
cannot read them.

Of the chain `dh-gui` keeps expiries 2 to 64 business days out (weekdays: it
has no holiday calendar), at most 8 of them, strikes within a band around the
forward that widens with the square root of time, at most 13 calls and 13
puts an expiry, in the money as well, and no quote with a bid under three
cents. An in-the-money put is left out when early exercise, which the model
does not price, can be worth more than half its band (THEORY.md, conflict 6).

## The fit

`dh-fit` keeps the parameters on the host with their Adam moments: the
generator's kernel weights (49 an interval) and its volatility state's three
numbers, and the hedger's network (7 inputs, 16 and 16 units, one position:
417 numbers). A fit starts from a normal law at each expiry's own
at-the-money volatility and a random hedger, never from stored ones.
Everything else of an iteration is these kernels:

| Kernel | A thread is | It makes |
| --- | --- | --- |
| `simulate` | a path | each day's shock, the day's law at a hashed uniform number, times the path's scale; the scale's next state; the day's mean move at that scale; paths in antithetic pairs |
| `roll` | a path and an eighth of the books | each book hedged day by day to its expiry: its residual, its costs, and what the hedge had gained before each of ten check days |
| `quote` | a contract | the mean and the deviation of its two books' residuals: the two middles, the generator's loss, the hedger's |
| `adjoint` | as `roll` | backward through every day's position and the position it was decided from: the hedger's gradient; the loss's derivative by the path's levels and by each day's mean move |
| `sum_gradient`, `return_adjoint`, `law_gradient` | a parameter, a path, a kernel weight | a path's backward pass through its days and its state; the gradients, summed in a fixed order |
| `carry` | a book and a check day, at each report | the variance the book's cost-to-go from that day still has, given the day's stock and volatility state |

From `carry`'s numbers the host reads, at each report, what the market's
spreads imply under each closure.

The backward pass is written by hand, as the forward is; nothing is
differentiated automatically. `dh-fit` also runs alone, on a chain as `dh-gui`
writes it (`/tmp/dh/chain.txt`; the format is in `dh-fit.mojo`):

```sh
dh-fit /tmp/dh/chain.txt 1024 1          # fit: reports on stdout every 20 iterations, until killed
dh-fit check /tmp/dh/chain.txt 256 200   # the ledger beside the host's, every gradient beside its difference
dh-fit time /tmp/dh/chain.txt 1024       # seconds of an iteration's parts
```

## What was measured

**The code** (an RTX 5070, Chrome 156 and Firefox 159; the browser test below).
`dh-fit check`: for a hedger that holds one constant position the kernels'
values and the host's own mean over the kernels' paths agree to 2e-5, and
every gradient agrees with its central difference to a few percent of its
section's largest. An iteration of 1,024 paths on 208 contracts takes about a
third of a second, two a second with `dh-gui` drawing beside it. The Network
tab's lines cost 1.75 ms a report, 0.03% of the fit.

**The model on AAPL's history** (THEORY.md, section 8, and
`tasks/20261118-140000-dh-39` have the tables, the commands and what was
checked for errors of the harness). Each fifth trading day from 2020-09 to
2025-10, a PyTorch reference of this model (not in the repository) was fitted
from that day's chain alone, on two seeds; its trades were entered at that
day's real bid or ask and carried to expiry on the closes that followed, the
stock hedged at half a basis point a trade. The rules were chosen on 2020-09
to 2022-12 (96 days) and 2023-01 to 2025-10 (118 days) was scored once.

- **The fit.** The model's value of a contract lies inside the market's band
  for 75% of the contracts in the first period and 66% in the second (62% and
  50% out of the money). It fits within 1.5 deviations of the forward and
  prices under the market beyond.
- **Picks did not hold up.** Among contracts within 1.5 deviations the best
  deal the model saw made nothing in the first period (+0.2 and -0.2 bp a
  trade on the two seeds) and lost in the second (-1.8 and -2.1). Among all
  out-of-the-money contracts it is the sale of far options: +1.5 and +1.4 bp
  in the first period, +1.6 and -0.1 in the second, with a loss of 31 and 75
  bp on the trade entered before the fall of April 2025.
- **The stock hedge is no better than a Black-Scholes delta** at the entry's
  implied volatility: it left 59 bp of deviation against the delta's 57 in the
  first period (216 unhedged), 82 against 76 in the second (177).
- **Hedging with other contracts did better than Black-Scholes.** A short
  straddle, hedged with holdings in the chain's other contracts chosen under
  the fitted law, bought at the ask and sold at the bid and held: 44 to 90 bp
  of deviation by expiry in the first period and 41 to 100 in the second,
  against 108 to 200 and 123 to 140 with a Black-Scholes vega hedge in the next
  expiry's straddle, and 130 to 204 with a delta alone. The model may use many
  contracts where the vega hedge uses one.

What a single chain's spreads imply under the closures of THEORY.md, section
4, was measured before the fill lag was removed (decision 9) and is in
`tasks/20261118-000000-dh-36`; it has not been measured again.

The test ([`test/`](test)) drives the image as a user does, the service's
answer being a lognormal chain of its own: Load quotes, Fit, Stop, Fit again,
a row of the Quotes tab clicked, 200 s of fitting, Ctrl+C with the fit
running, then the fit's numbers and `dh-fit check` in the shell. It passes in
Chrome 156 and in Firefox 159: 700 and 680 iterations in the 200 s, the loss
from 2.01 to 0.09 and 0.08, the clicked row's contract the one the fit's
reports hedge from then on, 9% of the unhedged risk left, the Network tab's
lines of their sizes, the Picks tab's table in the image, forward and daily
deviation the chain's, every gradient at its difference. Software adapters
cannot run the test: headless Chrome's SwiftShader takes 25 s for what the GPU
does in 0.05 s, and its GPU process ends creating `adjoint`'s pipeline. So it
needs a GPU window: `DISPLAY=:N node demos/deep-hedger/test/deep-hedger-browser.mjs`.

## Key files

- [`THEORY.md`](THEORY.md): the problem, the owner's decisions with their sources, assumptions, theory, the conflicts as decided.
- [`dh-fit.mojo`](dh-fit.mojo): the kernels, the host loop, the gradient check.
- [`dh-gui.cpp`](dh-gui.cpp): the chain's selection and carry, and the plots.
- [`backtest.tsv`](backtest.tsv): the backtest's table, as the Picks tab shows it.
- [`test/`](test): the image in a browser.
