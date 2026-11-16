# Deep hedger: the model fitted in Mojo kernels on WebGPU

- STATUS: OPEN
- PRIORITY: 190
- TAGS: dh,demo,gpu,mojo

Owner (2026-11-16): "The implementation should be in mojo GPU kernels (through WebGPU)." Earlier:
"The goal was to do the backprop in mojo without pytorch... same as the original cher/cher-sim
setup" (braut, 2026-08-11); "I want the implementation to be in GPU kernels, speed is essential"
(sig-mmd, 2026-07-08).

`demos/deep-hedger/dh-fit.mojo`: seven kernels (the README's table), forward and backward written
by hand, the host keeping the parameters and Adam. Compiled by `mojo build` in the image's build.

## State 2026-11-17

Measured on the RTX 5070 in Chrome 138 (Vulkan), AAPL's chain of 2026-11-13 as dh-gui wrote it
(208 contracts, 416 books, 8 expiries to 45 business days), 1,024 paths, unless said otherwise.
Logs: `build/dh-evidence/` (this machine).

- **The ledger is the theory's** (`dh-fit check CHAIN 256`): for a hedger holding one constant
  position, three contracts' bids and asks from the kernels and from the host's own sum over the
  kernels' paths agree to six digits (0.106107034 and 0.10610781, 0.11694382 and 0.11694435, ...).
- **Both gradients match central differences**: the hedger's seven sampled parameters (1.7147
  and 1.7157, 1.02856 and 1.02848, the small ones to 2% to 9%), the generator's seven logits to
  0.01% to 0.3% with that constant-position hedger, where holding positions fixed is exact.
- **Speed.** An iteration is 0.33 s: forward kernels 0.054 s, `adjoint` 0.25 s, the three sums
  0.027 s, reading the result 0.001 s (`dh-fit time`). 4,096 paths: 0.15, 0.74, 0.08 s.
- **What made `adjoint` slow was threads out of step.** It took 3.43 s at first, 66 times the
  forward kernels. Not the cause: a thread's gradient kept in a local array of 401 floats (the
  same time as sums into a storage buffer), nor where a block's threads store (side by side or
  401 words apart). The cause: a block's threads took different books, so their loops had
  different lengths, and the backward pass branched on each path's own values (a unit on or
  off). With neighbouring threads on neighbouring paths of the same books, and factors in place
  of those branches, it is 0.25 s. Then the sums into the gradient cost nothing (0.244 s without
  them), the second evaluation of the policy 0.06 s, and the forward half 0.055 s. One thread a
  path (no groups): 1.78 s; 32 groups: 0.195 s.

Left: the fit's convergence on the chain, in the image, in both browsers.

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
