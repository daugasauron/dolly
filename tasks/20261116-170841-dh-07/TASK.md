# Mojo kernels on a software adapter: a thousand times slower, and a large one ends SwiftShader's GPU process

- STATUS: OPEN
- PRIORITY: 90
- TAGS: dh,mojo,gpu

Found while building `demos/deep-hedger`. It decides where a Mojo program with real kernels can be
tested: the demo's test needs a GPU window, so `npm run test:demos` skips it.

## State 2026-11-17

Reproduction, headless Chrome 138 (`--disable-gpu --enable-unsafe-webgpu`, adapter "google
swiftshader"), the `mojo-gpu` image, `demos/deep-hedger/dh-fit.mojo` built there with `mojo build`:

- `./dh-fit time CHAIN 64` on a 56-contract chain ends with `enqueue_function: gpu@0: I/O error`
  after about 30 s; the page reports `GPU device lost: A valid external Instance reference no
  longer exists` at `record 1 (opcode 16)`, the creation of the `adjoint` kernel's pipeline, and
  Chrome's log has `GPU process exited unexpectedly: exit_code=139`.
- The kernel's WGSL is 99 kB: one loop around a switch of 48 blocks, 1,084 function-scope
  variables. With the second inlined evaluation of the policy taken out of its backward loop the
  pipeline is created.
- What does run is slow: `roll` (6 kB, 7 blocks) took 25 s for 64 paths and 56 contracts, and the
  reduced `adjoint` 230 s; the RTX 5070 takes 0.05 s and 0.25 s for 1,024 paths and 208
  contracts. A guess at the cause, not measured: a software adapter runs several invocations in
  one SIMD group and has to evaluate every block of the state machine under a mask each turn.
- On the GPU the same form costs nothing while a block's threads take the same branches, and 14
  times as much when they do not (task dh-03).

Not tried: Mesa's lavapipe as the adapter with the pipeline that SwiftShader takes (one attempt
with `VK_ICD_FILENAMES` set ended like SwiftShader, on the full kernel); structured control flow
in the WGSL the backend prints, which is where a fix would be (`demos/mojo/target/patches`).
