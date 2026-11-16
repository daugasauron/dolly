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

Measured on the RTX 5070 in Chrome (Vulkan), AAPL's chain of 2026-11-13 (208 contracts, 416
books, 45 business days) unless said otherwise.

- **Both gradients match central differences** of what they differentiate (`dh-fit check CHAIN
  256`): the hedger's seven sampled parameters to 0.1% to 5% (the largest ones to 0.1%), the
  generator's seven logits to 0.05% to 0.2% with a constant-position hedger, where holding
  positions fixed is exact.
- **What made the backward kernel slow, and did not.** The first `adjoint` took 0.9 s for 1,024
  paths on a 56-contract chain against 0.02 s for the forward kernels. A thread's gradient kept in
  an array of its own (401 floats) and the same sums made into a storage buffer took the same
  time; so did a layout in which a block's threads store side by side.

Left: the timing after the block's threads were made to run in step, and the fit's convergence
on the chain.

Findings about Mojo kernels in Dolly:

- **A kernel is a state machine**: its WGSL is one loop around a switch over basic blocks, every
  value a function-scope variable. `adjoint` is 99 kB of WGSL, 48 blocks, 1,084 variables (the
  limit is 128 KiB); `roll` is 6 kB and 7 blocks.
- **Software adapters cannot run the fit.** Headless Chrome's SwiftShader ran `roll` for 64 paths
  and 56 contracts in 25 s (the GPU: 1,024 paths in 0.02 s), and creating `adjoint`'s pipeline
  ended its GPU process with a segmentation fault after 30 s (`GPU process exited unexpectedly:
  exit_code=139`). Without the second evaluation of the policy in the backward loop the pipeline
  is created and takes 230 s for 64 paths. So the image's test needs a hardware adapter.
- A loop over a constant count is unrolled by the compiler; with the count passed as an argument
  (`hidden`) it is not.
- `mojo build` of the 950-line program takes 12 to 25 s in the session.
