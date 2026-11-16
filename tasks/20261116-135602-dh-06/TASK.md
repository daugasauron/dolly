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

Not started. What it takes, from what the stock-only build measured:

1. **The recursive market.** Every listed option priced at every day of every path by the same
   hedger, backward from the last expiry, each book trading the others at those prices
   (`~/dev/braut/mojo/src/gpu_market.mojo` is the newest earlier implementation: TileTensor, warp
   sums and Float64, none of which Dolly's Mojo kernels have). A book's day then costs one policy
   evaluation over all instruments, and a path's sheet is contracts x days books: about 200 x 45
   books a path where the demo has 400.
2. **Kernels.** A thread's working state has to live in storage buffers: an array of 401 floats
   local to a thread made the adjoint kernel forty times slower on the NVIDIA driver
   (task dh-03). A kernel binds at most ten buffers and its WGSL is at most 128 KiB.
3. **Weights conditioned on the path's own past returns** (never on observed ones) and on event
   dates: the law's table becomes a function evaluated in `simulate`, and `law_gradient` its
   backward pass.
4. Conflict 4 of THEORY.md (pathwise against state-conditional fill prices) is then measurable.
