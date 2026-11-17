# Deep hedger: options as hedge instruments

- STATUS: OPEN
- PRIORITY: 150
- TAGS: dh,demo

The demo's hedger trades the stock only (`demos/deep-hedger/THEORY.md`, section 7, item 1). The
owner's model does not stop there (decision 12): "Why would it make sense that the intermediate
prices are the prices of hedging with stock only? Other people can hedge with options as well.
This is a core idea and I want to try harder to make that work." (braut, 2026-07-22); "it is
crucial that the options have transaction cost" (braut, 2026-08-13). The stock-only stage is
what the owner asked for first, when the idea was new: "Try this with stock only hedge"
(sig-mmd, 2026-07-06).

The law with memory, which this task also held, is task dh-17.

## State 2026-11-17

Not started in the demo. What it takes, from what the stock-only build measured:

1. **The recursive market.** Every listed option priced at every day of every path by the same
   hedger, backward from the last expiry, each book trading the others at those prices
   (`~/dev/braut/mojo/src/gpu_market.mojo` is the newest earlier implementation: TileTensor, warp
   sums and Float64, none of which Dolly's Mojo kernels have). A book's day then costs one policy
   evaluation over all instruments, and a path's sheet is contracts x days books: about 200 x 45
   books a path where the demo has 400. Dropout over the instruments (decision 19).
2. **Kernels.** A block's threads have to take the same books and the same branches (task
   dh-23: 14 times slower otherwise). A kernel binds at most ten buffers and its WGSL is at
   most 128 KiB; the demo's `adjoint` is at 99 kB and nine buffers.
3. Conflict 4 (pathwise against state-conditional fill prices, task dh-10) is decided first: by
   the ledger a pathwise-priced option is a stock strategy (task dh-35). With prices of the day
   `braut`'s claim that most of the spread enters through option trades (6.27 of 6.36 bp, an
   agent's) can be checked against the demo's finding on spreads (task dh-19).
4. A step between, proposed here and not tried: let a book also trade the other contracts once,
   on day 0, at the model's own day-0 bids and asks, and hold them to their expiries. The ledger
   needs their payoffs on the path and no price of theirs in between, so conflict 4 does not
   arise. Each contract's quotes then depend on the others', and since a book may hold its own
   contract, the spreads need something that holds them open: the owner's question of
   2026-07-23, "why isn't the spread shrinking?".
   Expected, not measured (2026-11-17): a contract is then made the cheapest way, by the stock
   or by a neighbour plus the difference, and at least one contract an expiry is still made by
   the stock alone. That links neighbours' quotes; it does not by itself give bands of a cent
   at the money (task dh-19).

## The owner, 2026-11-17 evening, second answer

The owner's picture of it, which replaces decision 13's pathwise prices: on every day of a path
the stock's price with its spread and every option's quote are known, "induced backwards from
yesterday *somehow*", and the hedger may buy protection at those quotes: "Hedging that with
stock only would cause very large losses in a large one day move." The aim is "to replicate the
original payoff with as small \"variance\" as possible", costs of stock and options inside.
