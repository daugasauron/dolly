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

On an RTX 5070 in Chrome 156 (Vulkan), AAPL's chain of 2026-11-13 as loaded on
2026-11-17 (the last session's closing quotes: 208 contracts, 8 expiries from
3 to 45 business days), 1,024 paths, stock cost 0.25 bp, a tick of a cent.

- **The ledger and the gradients** (`dh-fit check CHAIN 256 100`). For a hedger
  that holds one constant position, the kernels' middles and the host's own
  mean over the kernels' paths agree to four digits; the hedger's gradient
  agrees with its central difference to 0.3%, the generator's logits to 0.2%,
  the state's three numbers to 1%. After 100 iterations of fitting, where
  holding positions fixed is an approximation (THEORY.md, section 4), the
  generator's gradient and the difference agree to a sixth at the logits and
  the state's numbers sampled, but for one logit where both are small.
- **Speed.** An iteration is 0.37 s: the forward kernels 0.06 s, `adjoint`
  0.27 s, the sums 0.03 s. With `dh-gui` drawing beside it, two iterations a
  second.
- **The fit**, from a normal law and a random hedger, 900 iterations
  (`dh-fit CHAIN 1024 1 900`). The middles, what replication costs on average:
  79% of the long books' and 82% of the short books' are inside the market's
  bands. The model's bids and asks, the nearest closure's charge on them: 63%
  to 67% inside from iteration 100 on (bids 54% to 62%, asks 65% to 76%), the
  loss between 0.9 and 1.4 band widths squared. The hedger leaves 35% of the
  risk of not hedging. The law's forward at each expiry is within 0.2% of the
  one its quotes imply.
- **What the spreads imply** (THEORY.md, section 4; the Spreads tab). Under
  the chain of dealers, over a floor of a tick, the price of a day's
  deviation is by expiry 0.0064, 0.0023, 0.035, 0.0044, 0.0036, 0.0021, 0.014
  and 0.0017: the three monthly expiries (5, 25 and 45 days) 0.002, the three
  weekly ones 0.004 to 0.006, and Nov 25 and Dec 31, which are neither, 0.035
  and 0.014. Held to expiry, over half a tick, the price of the whole
  residual's deviation is 0.017, 0.008, 0.100, 0.015, 0.017, 0.011, 0.078 and
  0.012. Either leaves the model's half spreads within a factor of 1.3 of the
  market's for the middle half of the out-of-the-money contracts (the miss
  0.48 and 0.49 in log units); out after some days, 0.9. With one number for
  the name the miss is 1.2 held to expiry.
- **The days a spread pays for**, at one deviation over the floor: at the
  money a hundredth of a day or less in every expiry; in the wings of the
  20-day expiry a day; in the money a sixth of a day. In the money the
  market's half spreads are 0.85 to 1.90 (currency) where the closures give
  0.05 to 0.09.
- **Two seeds.** Another seed gives another first hedger and other paths.
  After 900 iterations each: the same 65% of the charged quotes in band (bids
  54%, asks 76%), 79% and 82% of the middles, 35% of the risk left, the state
  0.902, 0.210, -0.116 and 0.902, 0.215, -0.120; the expiries' prices of a
  day's deviation within a tenth of each other from the 10-day expiry on, the
  two shortest expiries' moving by a third from report to report; the
  forwards within 0.35% of each other, at the last expiry.
- **A second implementation and the open interest agree.** A PyTorch
  reference of the model on the CPU (not in the repository; 256 paths, 400
  iterations, no floor) puts the expiries in the same order at the same
  sizes: its price of the whole residual's deviation is 0.019, 0.009, 0.106,
  0.019, 0.020, 0.014, 0.088 and 0.015. That order is the order of the
  expiries' open interest in the feed, which the model does not read: 36,
  739, 2, 99, 32, 805, 1.5 and 1,342 thousand contracts.
- **The days it finds** are as before the night's change: a deviation of 1.0%
  to 1.6% in the eight intervals, an excess kurtosis of 1 to 6, a day's size
  with the day before's at 0.21 to 0.34; the state 0.90, 0.21, -0.12.
- **The hedger against the delta**, measured on the version of the afternoon,
  on a PyTorch reference of it, a lognormal 25% chain: the hedger and the
  Black-Scholes delta at 25%, decided a day before, both left 0.47, 0.34, 0.25
  and 0.18 of the unhedged deviation at 5, 10, 21 and 42 days. What is left is
  the day's lag: a book's first day is not hedged at all (decision 9).

The test ([`test/`](test)) drives the image as a user does, the service's
answer being a lognormal chain of its own: Load quotes, Fit, Stop, Fit again,
a row of the Quotes tab clicked, 200 s of fitting, Stop, Quit, then the fit's
numbers and `dh-fit check` in the shell. It passes in Chrome 156 and in
Firefox 159: 680 and 660 iterations in the 200 s, the loss from 2.07 to 0.20
and 0.17, the
clicked row's contract the one the fit's reports hedge from then on, 27% of
the unhedged risk left, forward and daily deviation the chain's, every
gradient at its difference. Three things in the test are for Firefox
(`tasks/20261117-090000-dh-34`): the page composites a frame at every refresh,
a still page having left one `dh-fit` in five waiting for a readback;
`dh-gui` is left by Quit, not by Ctrl+C; and the fit's output is read by one
process a question, without pipes. Software adapters cannot run the test:
headless Chrome's SwiftShader takes 25 s for what the GPU does in 0.05 s, and
its GPU process ends creating `adjoint`'s pipeline. So it needs a GPU window:
`DISPLAY=:N node demos/deep-hedger/test/deep-hedger-browser.mjs`.

## Key files

- [`THEORY.md`](THEORY.md): the problem, the owner's decisions with their sources, assumptions, theory, the conflicts as decided.
- [`dh-fit.mojo`](dh-fit.mojo): the kernels, the host loop, the gradient check.
- [`dh-gui.cpp`](dh-gui.cpp): the chain's selection and carry, and the plots.
- [`test/`](test): the image in a browser.
