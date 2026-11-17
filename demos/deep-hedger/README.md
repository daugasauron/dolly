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
until stopped, on fresh paths every iteration.

- **Volatility** and **Price**: for each expiry its calls and its puts. A
  market quote is a bar from bid to ask; the model's bid and ask are lines.
  The volatility is Black's at the forward the quotes imply; the model has
  none. Under the pointer, the nearest contract's numbers; a click shows the
  plot's expiry alone, another all again.
- **Law**: the density of a day's shock in each interval between expiries;
  paths, 28 as they come and the batch's ten lowest and ten highest; those
  paths' scale by day; what the volatility state does; and the batch's days
  by interval: deviation, skewness, excess kurtosis, and how a day's size
  goes with the day before's.
- **Hedge**: what the hedger does, the part of the model no quote shows, for
  three calls of the middle expiry (its lowest strike, the one nearest the
  forward, its highest). Above, the stock it holds from each day, short one,
  along twelve of the Law tab's paths. Below, as histograms over the last
  batch's paths, what selling the call at the market's bid, or buying it at
  the market's ask, and hedging to expiry came to: the mean says whether the
  trade is worth doing on average, the worst twentieth what that risks.
- **Quotes**: every contract's bid and ask, the market's and the model's, in
  currency; and for a trade at the market's price, hedged, its mean result
  and what the model would pay for it after its charge for risk (THEORY.md,
  section 4), gains in colour.
- **Fit**: by expiry, the forward the quotes imply and the model's, how many
  model bids and asks are inside the market's band, the market's mean spread
  and the model's, how much of the model's is hedging cost, the risk the
  hedger leaves as a share of not hedging; and by iteration the loss and the
  share in band.

The line under the buttons is the fit's state: the iteration, the share of
the model's bids and asks inside the market's bands, the loss and whether it
still falls, and the confidence the fit has reached.

**stock cost** is what a stock trade pays, in basis points of its value: it is
typed, the feed having no quote of the stock. **hedger's confidence** is the
hedger's risk preference: it hedges to make the mean of all but its best that
share of outcomes small. **paths** is the batch. Changing
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
numbers, the hedger's network (7 inputs, 16 and 16 units, one position: 417
numbers) and the quotes' confidence. A fit starts from a normal law at each expiry's
own at-the-money volatility, a random hedger and a confidence of 0.12, never
from stored ones. Everything else of an iteration is these kernels:

| Kernel | A thread is | It makes |
| --- | --- | --- |
| `simulate` | a path | each day's shock, the day's law at a hashed uniform number, times the path's scale; the scale's next state; the day's mean move at that scale; paths in antithetic pairs |
| `roll` | a path and an eighth of the books | each book hedged day by day to its expiry: its residual and its costs |
| `quote` | a contract | the Expected Shortfall of its two books' residuals, at the quotes' confidence and at the hedger's: the model's bid and ask, the generator's loss, the confidence's loss, the hedger's funding |
| `adjoint` | as `roll` | backward through every day's position and the position it was decided from: the hedger's gradient; the loss's derivative by the path's levels and by each day's mean move |
| `sum_gradient`, `return_adjoint`, `law_gradient` | a parameter, a path, a kernel weight | a path's backward pass through its days and its state; the gradients, summed in a fixed order |

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
3 to 45 business days), 1,024 paths, stock cost 0.25 bp, the hedger's
confidence 0.5.

- **The ledger and the gradients** (`dh-fit check CHAIN 256 300`). For a hedger
  that holds one constant position, the kernels' bids and asks and the host's
  own Expected Shortfall of the kernels' paths agree to six digits; every
  gradient agrees with its central difference: the hedger's and the
  generator's logits to 1.5%, the state's three numbers to 5%, the
  confidence's to 0.1%. After 300 iterations of fitting, where holding
  positions fixed is an approximation (THEORY.md, section 4), the generator's
  gradient and the difference agree to a sixth at the logits and the state's
  numbers sampled, but for one logit where both are near zero.
- **Speed.** An iteration is 0.38 s: the forward kernels 0.08 s, `adjoint`
  0.27 s, the sums 0.03 s. With `dh-gui` drawing beside it, two iterations a
  second, in Firefox 159 as in Chrome. With 4,096 paths an iteration is
  1.15 s.
- **The fit**, from a normal law and a random hedger, 900 iterations in 337 s
  (`dh-fit CHAIN 1024 1 900`): 54% of the model's bids and asks are inside the
  market's bands at iteration 180, 68% at 360, 77% at 900, the loss between
  1.2 and 1.8 band widths squared from iteration 360. The hedger leaves 37%
  of the risk of not hedging. The law's forward at each expiry is within 0.3%
  of the one its quotes imply, which no constraint holds there. Left to run,
  to 2,400 iterations (891 s): from iteration 1,000 the loss stays between 0.9
  and 1.6 with 73% to 79% in band, and the state where it was (0.91, 0.21,
  -0.12).
- **The days it finds.** A day's return has a deviation of 1.0% to 1.6% in
  the eight intervals, a skewness of -0.7 to +0.5 and an excess kurtosis of 1
  to 8, and a day's size goes with the day before's at 0.23 to 0.37 (two
  seeds). The state keeps 0.90 of itself a day; a shock of two units down
  raises the next day's scale by two thirds, two up by 3% (swing 0.23, lean
  -0.12). Fitted with independent days, as this demo first was, the same chain
  needed days of an excess kurtosis of 22 to 70: "almost all returns are close
  to 0 and then there are soem sudden jumps [...] it's not a realistic path
  law" (the owner, of `braut`, 2026-07-25).
- **The confidence the quotes imply is under 0.002**: 0.0016 at iteration
  900, 0.0012 at 2,400. The model's price is then next to the plain mean, and its
  mean spread 0.08 (currency), of which hedge cost 0.02, against the market's
  1.29. The tight quotes decide it: at the money, where a daily stock hedge
  leaves the most risk, AAPL's bands are cents wide; the market's mean is
  made by in-the-money closing quotes dollars wide, where that hedge leaves
  the least. One price of risk does not give this chain's spreads their
  shape.
- **One confidence for the hedger and the quotes did not work.** Hedging at
  the quotes' confidence, as it fell the hedger stopped hedging: it left 48%
  of the risk where it now leaves 37%, 95% of it on a call 4% out of the
  money, and held a quarter of a share against a call worth three cents. So
  the hedger has its own (THEORY.md, section 4).
- **Two seeds.** Another seed gives another first hedger and other paths.
  After 900 iterations each (`dh-fit CHAIN 1024 2 900`): 76.7% and 76.4% in
  band, the quotes' confidence 0.00158 and 0.00157, the state 0.900, 0.228,
  -0.123 and 0.914, 0.228, -0.112, 37% of the risk left in both; the two
  runs' bids differ by 0.00005 of the forward on average, a fifth of the
  model's own mean spread. The loss is 1.35 and 0.91: it moves that much from
  report to report. The forwards differ by up to 0.4%, at the last expiry
  (1.0026 and 0.9986): inside the bands the loss does not hold them.
- **A second implementation agrees.** A PyTorch reference of the model on
  the CPU (not in the repository), the same chain, 512 paths, 900 iterations:
  the state 0.91, 0.16, -0.11 against the kernels' 0.90, 0.23, -0.12; the
  quotes' confidence 0.003 against 0.002; 69% in band against 77%; 36% of the
  risk left against 37%; a day's deviation 1.1% to 1.6%, an excess kurtosis of
  1 to 8 and a day's size with the day before's at 0.29, as the kernels' days
  have them. Its swing, negative at first in both, turned positive at
  iteration 500; the kernels' with 256 paths by iteration 200.
- **The hedger against the delta.** On a PyTorch reference of the model on
  the CPU (not in the repository), a lognormal 25% chain, 256 paths, 600
  iterations: the hedger leaves 0.47, 0.34, 0.25 and 0.18 of the unhedged
  deviation at 5, 10, 21 and 42 days, and so does the Black-Scholes delta at
  25%, decided a day before as the hedger's positions are. What is left is
  the day's lag: a book's first day is not hedged at all (decision 9). The
  first version's hedger was behind the delta at the longest expiry (0.35
  against 0.27).
- **Without the forward in the ledger the fit did not settle** (the first
  version's reference, on a driftless 25% chain): the hedger held stock for
  the law's drift, the forwards stayed 0.6% off and its books carried more
  risk than unhedged ones. With it: forwards 1.0000.

The test ([`test/`](test)) drives the image as a user does, the service's
answer being a lognormal chain of its own: Load quotes, Fit, Stop, Fit again,
200 s of fitting, then `dh-fit check` in the shell. It passes in Chrome 156 and
in Firefox 159: 640 and 680 iterations in the 200 s, the loss from 11.97 to
0.21 and 0.22, 27% of the unhedged risk left, forward and daily deviation the
chain's, every gradient at its difference. The page composites a frame at
every refresh while it runs: on a still page Firefox left one `dh-fit` in five
waiting for a readback (`tasks/20261117-090000-dh-34`). Software adapters
cannot run the test: headless Chrome's SwiftShader takes 25 s for what the GPU
does in 0.05 s, and its GPU process ends creating `adjoint`'s pipeline. So it
needs a GPU window: `DISPLAY=:N node demos/deep-hedger/test/deep-hedger-browser.mjs`.

## Key files

- [`THEORY.md`](THEORY.md): the problem, the owner's decisions with their sources, assumptions, theory, the conflicts as decided.
- [`dh-fit.mojo`](dh-fit.mojo): the kernels, the host loop, the gradient check.
- [`dh-gui.cpp`](dh-gui.cpp): the chain's selection and carry, and the plots.
- [`test/`](test): the image in a browser.
