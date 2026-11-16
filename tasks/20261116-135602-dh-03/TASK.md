# Deep hedger: the model fitted in Mojo kernels on WebGPU

- STATUS: CLOSED
- PRIORITY: 190
- TAGS: dh,demo,gpu,mojo

Owner (2026-11-16): "The implementation should be in mojo GPU kernels (through WebGPU)." Earlier:
"The goal was to do the backprop in mojo without pytorch... same as the original cher/cher-sim
setup" (braut, 2026-08-11); "I want the implementation to be in GPU kernels, speed is essential"
(sig-mmd, 2026-07-08).

`demos/deep-hedger/dh-fit.mojo`: seven kernels (the README's table), forward and backward written
by hand, the host keeping the parameters and Adam. Compiled by `mojo build` in the image's build.

## Closed 2026-11-17

Measured on the RTX 5070 in Chrome 156 (Vulkan), AAPL's chain of 2026-11-13 as dh-gui wrote it
(208 contracts, 416 books, 8 expiries to 45 business days), 1,024 paths, unless said otherwise.
Logs: `build/dh-evidence/` (this machine).

- **The ledger is the theory's** (`dh-fit check CHAIN 256`): for a hedger holding one constant
  position, three contracts' bids and asks from the kernels and from the host's own sum over the
  kernels' paths agree to six digits (0.106107034 and 0.10610781, 0.11694382 and 0.11694435, ...).
- **Both gradients match central differences**: the hedger's seven sampled parameters (1.7147
  and 1.7157, 1.02856 and 1.02848, the small ones to 2% to 9%), the generator's seven logits to
  0.01% to 0.3% with that constant-position hedger, where holding positions fixed is exact.
- **Speed.** An iteration is 0.33 s: forward kernels 0.054 s, `adjoint` 0.25 s, the three sums
  0.027 s, reading the result 0.001 s (`dh-fit time`). 4,096 paths: 0.15, 0.74, 0.08 s. Firefox
  159 on the same card: 0.064, 0.30, 0.023 s, and the same numbers to the last digit (loss
  15.671573899424828 at iteration 80 in both).
- **What made `adjoint` slow was threads out of step.** It took 3.43 s at first, 66 times the
  forward kernels. Not the cause: a thread's gradient kept in a local array of 401 floats (the
  same time as sums into a storage buffer), nor where a block's threads store (side by side or
  401 words apart). The cause: a block's threads took different books, so their loops had
  different lengths, and the backward pass branched on each path's own values (a unit on or
  off). With neighbouring threads on neighbouring paths of the same books, and factors in place
  of those branches, it is 0.25 s. Then the sums into the gradient cost nothing (0.244 s without
  them), the second evaluation of the policy 0.06 s, and the forward half 0.055 s. One thread a
  path (no groups): 1.78 s; 32 groups: 0.195 s.

- **The fit converges on the chain** (`dh-fit CHAIN 1024 1 900`, stock cost 0.25 bp, risk price
  0.01): 900 iterations in 287 s, loss 4.7 at iteration 200, 1.8 at 500, 1.4 at 900; 70% of
  the model's bids and asks inside the market's bands; forwards 1.0002, 1.0007, 1.0004, 1.0004,
  1.0015, 0.9993, 0.9983, 1.0002 of the quotes' own; a day's deviation 1.2% to 1.6%; the hedger
  leaves 46% of the unhedged risk. In the image with dh-gui beside it: 2.6 iterations a second.
- **Two seeds** (`dh-fit CHAIN 1024 1 900` and `... 2 900`): loss 1.3708 and 1.3567, in band
  69.7% and 70.0%, the hedged books' deviation 0.0271 and 0.0277, each interval's daily
  deviation within 2% of the other run's, bids and asks 0.0000456 of the forward apart on
  average over the 208 contracts (the model's mean spread is 0.000345). Seed 1 run twice: the
  same loss to sixteen digits.
- **The generator's gradient at a fitted hedger** (`dh-fit check CHAIN 256 300`): against
  central differences that let the hedger respond, same sign at all seven logits, sizes -0.052
  and -0.038, 0.056 and 0.039, 0.013 and 0.009, 0.010 and 0.007, -0.066 and -0.090, 0.0165 and
  0.0165, 0.029 and 0.018. Holding positions fixed is an approximation there, as THEORY.md says.
- **The hedger against the delta** (the reference, `proto.py ... 0.25`, a lognormal 25% chain,
  512 paths, 600 iterations, risk price 0.01, 0.25 bp): the hedger leaves 0.64, 0.51, 0.41 and
  0.35 of the unhedged deviation at 5, 10, 21 and 42 days; the Black-Scholes delta at 25%, with
  the same day's lag and costs, 0.65, 0.50, 0.38 and 0.27. With a day's lag nothing hedges a
  five-day option well.
- **The forward has to be in the ledger.** A PyTorch reference of the same model
  (`work/dh-evidence/proto.py`, CPU, this machine) on a driftless 25% chain, positions earning
  the day's whole move: after 360 iterations the forwards were 0.994 in one run and 1.006 in
  another, the hedged books carried 0.10 to 0.13 of deviation against 0.077 unhedged, and the
  loss stood at 4 to 5. With the day's mean move taken out of what a position earns: forwards
  1.0000, 0.029 against 0.078, 24.6% to 25.1% a year.
- **Settings tried on the reference**: hedger rate 0.005 against 0.002 (47% against 54% of the
  unhedged risk left at 140 and 200 iterations); 8 hidden units against 16 (56% against 47% at
  160 and 140); generator rate 0.1 against 0.03 (the deviation reaches the chain's by
  iteration 100 instead of 160). dh-fit has 0.005, 16 and 0.05.

The image's test passes in Chrome 156 and Firefox 159 (task dh-04; commit 209e8819c is the
image it ran on). What the model still lacks is task dh-06; what the kernels cannot do on a
software adapter is task dh-07.

Ending dh-gui with Ctrl+C ends its dh-fit: the fit's output stopped growing and a timing run
afterwards had the card to itself (Chrome).

Findings about Mojo kernels in Dolly:

- **A kernel is a state machine**: its WGSL is one loop around a switch over basic blocks, every
  value a function-scope variable. `adjoint` is 99 kB of WGSL, 48 blocks, 1,084 variables (the
  limit is 128 KiB); `roll` is 6 kB and 7 blocks. On a GPU that costs nothing while a block's
  threads take the same branches.
- **Software adapters cannot run the fit.** Headless Chrome's SwiftShader ran `roll` for 64 paths
  and 56 contracts in 25 s (the GPU: 1,024 paths and 208 contracts in 0.05 s), and creating
  `adjoint`'s pipeline ended its GPU process with a segmentation fault after 30 s (`GPU process
  exited unexpectedly: exit_code=139`). Without the second evaluation of the policy in the
  backward loop the pipeline is created and takes 230 s for 64 paths. So the image's test needs
  a hardware adapter.
- A loop over a constant count is unrolled by the compiler; with the count passed as an argument
  (`hidden`) it is not.
- `mojo build` of the 1,070-line program takes 12 to 36 s in the session.
