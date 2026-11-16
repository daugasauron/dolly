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
  expiries, its moments, and paths.
- **Fit**: by expiry, the forward the quotes imply and the model's, how many
  model bids and asks are inside the market's band, the market's mean spread
  and the model's, how much of the model's is hedging cost, and the risk price
  at which this hedger's costs and risks would add up to the market's
  spreads; and the loss by report.

**stock cost** is what a stock trade pays, in basis points of its value;
**risk price** is `lambda` of the theory; **paths** is the batch. Changing one
takes effect at the next **Fit**.

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
cents.

## The fit

`dh-fit` keeps two parameter vectors on the host, the generator's kernel
weights (49 an interval) and the hedger's network (401), with their Adam
moments. Everything else of an iteration is these kernels:

| Kernel | A thread is | It makes |
| --- | --- | --- |
| `simulate` | a path | each day's return, the day's law at a hashed uniform number; paths in antithetic pairs |
| `roll` | a path and an eighth of the books | each book hedged day by day to its expiry: its residual and its costs |
| `quote` | a contract | mean and deviation of its two books' residuals: the model's bid and ask, the loss |
| `adjoint` | as `roll` | backward through every day's position and the position it was decided from: the hedger's gradient; the loss's derivative by the path |
| `sum_gradient`, `return_adjoint`, `law_gradient` | a parameter, a path, a kernel weight | the two gradients, summed in a fixed order |

The backward pass is written by hand, as the forward is; nothing is
differentiated automatically.

## Key files

- [`THEORY.md`](THEORY.md): the problem, the owner's decisions with their sources, assumptions, theory, open conflicts.
- [`dh-fit.mojo`](dh-fit.mojo): the kernels, the host loop, the gradient check.
- [`dh-gui.cpp`](dh-gui.cpp): the chain's selection and carry, and the plots.
- [`test/`](test): the image in a browser.
