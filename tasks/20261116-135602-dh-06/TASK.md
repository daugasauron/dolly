# Deep hedger: options as hedge instruments, and a law with memory

- STATUS: OPEN
- PRIORITY: 150
- TAGS: dh,demo

The demo's hedger trades the stock only and its law has independent daily returns
(`demos/deep-hedger/THEORY.md` section 7). The owner's model has neither limit:

- "Why would it make sense that the intermediate prices are the prices of hedging with stock only?
  Other people can hedge with options as well. This is a core idea" (braut, 2026-07-22).
- "The only thing I'd like to choose is how many of the kernels are used" (boom, 2026-07-22), with
  volatility clustering wanted "as parametric properties" (braut, 2026-07-25) and event dates
  given (braut, 2026-08-05).

## State 2026-11-17

Not started in the demo. What it takes, from what the stock-only build measured:

1. **The recursive market.** Every listed option priced at every day of every path by the same
   hedger, backward from the last expiry, each book trading the others at those prices
   (`~/dev/braut/mojo/src/gpu_market.mojo` is the newest earlier implementation: TileTensor, warp
   sums and Float64, none of which Dolly's Mojo kernels have). A book's day then costs one policy
   evaluation over all instruments, and a path's sheet is contracts x days books: about 200 x 45
   books a path where the demo has 400.
2. **Kernels.** A block's threads have to take the same books and the same branches (task
   dh-03: 14 times slower otherwise). A kernel binds at most ten buffers and its WGSL is at
   most 128 KiB; the demo's `adjoint` is at 99 kB and nine buffers.
3. **Weights conditioned on the path's own past returns** (never on observed ones) and on event
   dates: the law's table becomes a function evaluated in `simulate`, its backward pass a
   recursion over the days of a path, and the day's mean move a number of each path.
   One trial, on a PyTorch reference of the demo's model (`work/dh-evidence/proto2.py`, this
   machine): the day's logits as base + f1 * a + f1^2 * b with f1 = tanh(previous return / 2%).
   On AAPL's chain of 2026-11-13, 256 paths, the same rates: at a risk price of 0.05 its loss
   after 460 iterations was 5.31 against 5.43 without memory; at 0.01 after 800 iterations it
   was 9.4 against 3.2, with two forwards 6% and 2% off and 43% against 65% of the quotes in
   band. Its days were calmer where it fitted (excess kurtosis 2 to 28 against 30 to 70), which
   is what memory is for, but in this form and at these rates it fits worse, so it was not
   ported. Independent returns reach the chain's forwards and levels in about 700 iterations.
4. Conflict 4 of THEORY.md (pathwise against state-conditional fill prices) is then measurable.
