# Deep hedger, done: a second implementation agrees, and what it was used to try

- STATUS: CLOSED
- PRIORITY: 120
- TAGS: dh,demo

While the GPU was taken, the model was written a second time in PyTorch for the CPU
(`work/dh-evidence/proto.py`, 150 lines, this machine, not in git; run with the Python of
`~/dev/braut/.venv`, read-only): the same law, hedger inputs, ledger, funding and losses as
`dh-fit.mojo`, with automatic differentiation where the kernels' backward pass is by hand.

## Closed 2026-11-17

- **It agrees with the kernels** on AAPL's chain of 2026-11-13 (800 iterations of 256 paths
  against the kernels' 900 of 1,024): the hedged books' deviation 0.0273 against 0.0271,
  unhedged 0.0597 against 0.0592, the model's mean spread 0.00036 against 0.00034.
- **The forward has to be in the ledger**: task dh-15 has the numbers.
- **In-the-money puts drag the forward**: task dh-12.
- **The hedger against the delta**, a lognormal 25% chain, 512 paths, 600 iterations: the
  hedger leaves 0.64, 0.51, 0.41 and 0.35 of the unhedged deviation at 5, 10, 21 and 42 days;
  the Black-Scholes delta at 25%, with the same day's lag and costs, 0.65, 0.50, 0.38 and 0.27.
- **Settings**: hedger rate 0.005 against 0.002 (47% against 54% of the unhedged risk left at
  140 and 200 iterations); 8 hidden units against 16 (56% against 47%); hedger rates 0.01 and
  0.02, tried after the kernels' measurements and not taken (0.32 and 0.34 at 42 days where
  0.005 leaves 0.35).
- **A law with one day's memory** fitted worse: task dh-17.
