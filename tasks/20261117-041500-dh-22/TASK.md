# Deep hedger, done: the kernels' ledger and gradients are checked

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: dh,demo,gpu,mojo

The history's lesson (`demos/deep-hedger/THEORY.md`, section 6): results were repeatedly the
harness or an accounting bug. So `dh-fit check CHAIN PATHS [ITERATIONS]` exists.

## Closed 2026-11-17

Commit `9a7b28816` (the check), run on the RTX 5070 in Chrome 156 on AAPL's chain of 2026-11-13,
256 paths; the image's test runs it in Chrome and Firefox on its own chain (task dh-24).

- **Ledger.** For a hedger holding one constant position, three contracts' bids and asks from
  the kernels and from the host's own sum over the kernels' paths, by the formula of THEORY.md
  section 4: 0.106107034 and 0.10610781, 0.11694382 and 0.11694435; 0.22474726 and 0.22474732,
  0.25334036 and 0.25334052; 0.27499735 and 0.27499677, 0.31556073 and 0.31556040.
- **Hedger's gradient** against central differences: 1.7147 and 1.7157, 1.02856 and 1.02848,
  -0.14685 and -0.14695, 0.0265 and 0.0270, 0.0271 and 0.0248, -0.0177 and -0.0173.
- **Generator's gradient**, constant positions, where holding them fixed is exact: -1.5309 and
  -1.5261, -2.6944 and -2.6946, -2.5675 and -2.5675, -2.5288 and -2.5285, -1.8143 and -1.8133,
  9.8021 and 9.7918, -0.9490 and -0.9498.
- **Generator's gradient at a hedger of 300 iterations**, where it is an approximation
  (section 4, last paragraph): same sign at all seven logits, sizes within two thirds (-0.052
  and -0.038, 0.056 and 0.039, 0.013 and 0.009, 0.010 and 0.007, -0.066 and -0.090, 0.0165 and
  0.0165, 0.029 and 0.018).
