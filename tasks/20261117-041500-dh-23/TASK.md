# Deep hedger, done: the backward kernel made 14 times faster

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: dh,demo,gpu,mojo

Owner: "I want the implementation to be in GPU kernels, speed is essential" (sig-mmd,
2026-07-08); of `braut`'s 14 s an iteration, "I feel like ~1s should be possible" (2026-08-11).

## Closed 2026-11-17

Commit `115371eef`. `dh-fit time CHAIN 1024` on the RTX 5070 in Chrome 156, AAPL's chain of
2026-11-13 (416 books, 45 days):

- `adjoint` took 3.43 s, 66 times the forward kernels. Not the cause: a thread's gradient in a
  local array of 401 floats (the same time as sums into a storage buffer), nor where a block's
  threads store.
- The cause: a block's threads took different books, so their loops had different lengths, and
  the backward pass branched on each path's own values. With neighbouring threads on
  neighbouring paths of the same books and factors in place of those branches: 0.25 s.
- An iteration is then 0.32 s (forward 0.05, `adjoint` 0.25, sums 0.02, reading 0.001); 0.97 s
  with 4,096 paths; 2.6 iterations a second with dh-gui drawing beside it. Firefox 159 on the
  same card: 0.39 s.
- Variants timed: without the sums into the gradient 0.244 s; without the second evaluation of
  the policy 0.19 s; the forward half alone 0.055 s; one thread a path 1.78 s; 32 groups 0.195 s.

What stays slow is task dh-07 (software adapters).
