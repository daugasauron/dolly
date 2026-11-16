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
  none.
- **Law**: the density of a day's log return in each interval between
  expiries, its moments, and paths: 28 as they come, and the batch's ten
  lowest and ten highest.
- **Hedge**: what the hedger does, the part of the model no quote shows: the
  stock it holds from each day, short one call of the middle expiry at its
  lowest strike, at the strike nearest the forward and at its highest, along
  twelve of the Law tab's paths.
- **Quotes**: every contract's bid and ask, the market's and the model's, in
  currency; and where the market's ask is under the model's bid, or its bid
  over the model's ask, by how much: what the model says the contract is
  worth buying, or selling, and hedging (THEORY.md, section 4).
- **Fit**: by expiry, the forward the quotes imply and the model's, how many
  model bids and asks are inside the market's band, the market's mean spread
  and the model's, how much of the model's is hedging cost, the risk the
  hedger leaves as a share of not hedging, and the risk price at which this
  hedger's costs and risks would add up to the market's spreads; and the loss
  by report.

**stock cost** is what a stock trade pays, in basis points of its value: it is
typed, the feed having no quote of the stock. **risk price** is `lambda` of
the theory; **paths** is the batch. Changing one takes effect at the next
**Fit**, which starts again from nothing, with another seed.

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

`dh-fit` keeps two parameter vectors on the host, the generator's kernel
weights (49 an interval) and the hedger's network (6 inputs, 16 and 16 units,
one position: 401 numbers), with their Adam moments. A fit starts from equal
weights and a random hedger, never from a stored one. Everything else of an
iteration is these kernels:

| Kernel | A thread is | It makes |
| --- | --- | --- |
| `simulate` | a path | each day's return, the day's law at a hashed uniform number; paths in antithetic pairs |
| `roll` | a path and an eighth of the books | each book hedged day by day to its expiry: its residual and its costs |
| `quote` | a contract | mean and deviation of its two books' residuals: the model's bid and ask, the loss |
| `adjoint` | as `roll` | backward through every day's position and the position it was decided from: the hedger's gradient; the loss's derivative by the path's levels and by each day's mean move |
| `sum_gradient`, `return_adjoint`, `law_gradient` | a parameter, a path, a kernel weight | the two gradients, summed in a fixed order |

The backward pass is written by hand, as the forward is; nothing is
differentiated automatically. `dh-fit` also runs alone, on a chain as `dh-gui`
writes it (`/tmp/dh/chain.txt`; the format is in `dh-fit.mojo`):

```sh
dh-fit /tmp/dh/chain.txt 1024 1          # fit: reports on stdout every 20 iterations, until killed
dh-fit check /tmp/dh/chain.txt 256 200   # the ledger beside the host's, both gradients beside differences
dh-fit time /tmp/dh/chain.txt 1024       # seconds of an iteration's parts
```

## What was measured

On an RTX 5070 in Chrome 156 (Vulkan), AAPL's chain of 2026-11-13 as loaded on
2026-11-17 (the last session's closing quotes: 208 contracts, 8 expiries from
3 to 45 business days), 1,024 paths, stock cost 0.25 bp, risk price 0.01.

- **The ledger and the gradients** (`dh-fit check CHAIN 256 300`). For a hedger
  that holds one constant position, the kernels' bids and asks and the host's
  own sum over the kernels' paths agree to six digits; the hedger's gradient
  and the generator's agree with central differences (the generator's to 0.3%
  where holding positions fixed is exact). After 300 iterations of fitting,
  where it is an approximation, the generator's gradient and the difference
  have the same sign at the seven logits sampled and differ by up to two
  thirds in size.
- **Speed.** An iteration is 0.32 s: the forward kernels 0.05 s, `adjoint`
  0.25 s, the sums 0.02 s. With `dh-gui` drawing beside it, 2.6 iterations a
  second. With 4,096 paths an iteration is 0.97 s. Firefox 159 takes 0.39 s
  (0.06, 0.30, 0.02) and gives the same numbers to the last digit.
- **The fit**, from equal weights and a random hedger, 900 iterations in
  287 s (`dh-fit CHAIN 1024 1 900`): the loss fell from over 300 to 1.4 band
  widths squared; 70% of the model's bids and asks are inside the market's
  bands; the law's forward at each expiry is within 0.1% of the one its
  quotes imply, which no constraint holds there; the hedger leaves 46% of the
  risk of not hedging. Left to run, to 2,400 iterations: the loss stays
  between 1.2 and 1.5 from iteration 1,000, 75% in band, 43% of the risk
  left. The model's mean spread is 0.12 (currency) against the market's
  1.29, which wide closing quotes in the money make: the risk price at which
  this hedger's spreads would add up to the market's is 0.12 over all
  contracts and 0.03 on the last expiry, where the market's bands are tight.
  One risk price does not give this chain's spreads their shape.
- **Two seeds, one answer.** Another seed gives another first hedger and
  other paths. After 900 iterations each (`dh-fit CHAIN 1024 2 900`): loss
  1.371 and 1.357, 69.7% and 70.0% in band, a day's deviation by interval
  within 2% of each other, and the two runs' bids and asks differ by 0.00005
  of the forward on average, an eighth of the model's own mean spread. The
  same seed gives the same numbers to the last digit.
- **The law it finds is made of jumps.** A day's return has a skewness of -2
  to -6 and an excess kurtosis of 20 to 70 in every interval, and the lowest
  and highest paths move 10% in a day: with independent days that is the
  only way to a 45-day skew. The owner saw the same in `braut`: "almost all
  returns are close to 0 and then there are soem sudden jumps [...] it's not
  a realistic path law" (2026-07-25). A law with memory is the theory's
  answer (THEORY.md, section 7).
- **A second implementation agrees.** A PyTorch reference of the model on the
  CPU (not in the repository), 800 iterations of 256 paths on the same chain:
  the hedged books' deviation 0.0273 of the forward against the kernels'
  0.0271, unhedged 0.0597 against 0.0592, the model's mean spread 0.00036
  against 0.00034.
- **What the hedger holds** (the Hedge tab, iteration 400 of a fit in the
  image): short the 20-day call 15% in the money, 0.8 of a share on every
  path from the second day; at the forward, 0.3 at first, then toward 0.6 to
  0.8 on the paths that end in the money and to nothing on those that end
  out of it; 13% out of the money, under 0.1 throughout.
- **The hedger against the delta.** On that reference, a lognormal 25% chain,
  600 iterations: the hedger leaves 0.64, 0.51, 0.41 and 0.35 of the unhedged
  risk at 5, 10, 21 and 42 days; the Black-Scholes delta at the true
  volatility, decided a day before as the hedger's positions are, leaves 0.65,
  0.50, 0.38 and 0.27. The day's lag is most of what is left; at the longest
  expiry the hedger is still behind.
- **Without the forward in the ledger the fit did not settle** (that
  reference, on a driftless 25% chain): the hedger held
  stock for the law's drift, the forwards stayed 0.6% off and its books
  carried more risk than unhedged ones. With it: forwards 1.0000, 38% of the
  unhedged risk left, 24.6% to 25.1% a year.

The test ([`test/`](test)) drives the image as a user does, the service's
answer being a lognormal chain of its own, and then runs `dh-fit check` and a
fit of 600 iterations: it passes in Chrome 156 and in Firefox 159 with the
same numbers to the last digit (loss 248.469 to 0.773, 37% of the unhedged
risk left, forward and daily deviation the chain's). Software adapters cannot
run it: headless Chrome's SwiftShader takes 25 s for what the GPU does in
0.05 s, and its GPU process ends creating `adjoint`'s pipeline. So it needs a
GPU window: `DISPLAY=:N node demos/deep-hedger/test/deep-hedger-browser.mjs`.

## Key files

- [`THEORY.md`](THEORY.md): the problem, the owner's decisions with their sources, assumptions, theory, open conflicts.
- [`dh-fit.mojo`](dh-fit.mojo): the kernels, the host loop, the gradient check.
- [`dh-gui.cpp`](dh-gui.cpp): the chain's selection and carry, and the plots.
- [`test/`](test): the image in a browser.
