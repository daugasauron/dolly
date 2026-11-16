# Deep hedger: a law with memory

- STATUS: OPEN
- PRIORITY: 140
- TAGS: dh,demo

The demo's law has independent daily returns, one set of kernel weights an interval between
expiries (`demos/deep-hedger/THEORY.md`, section 7, item 2). The owner's generator is
conditional: "there are *some* things that we can learn from the past, like volatility
clustering etc." (braut, 2026-07-25); "the only information I want to give it is the actual
date of events" (braut, 2026-08-05). Conditioning is on the path's own past, never on observed
returns (task dh-13).

## State 2026-11-17

Not in the demo. One trial on a PyTorch reference of the demo's model
(`work/dh-evidence/proto2.py`, this machine): the day's logits as base + f1 * a + f1^2 * b with
f1 = tanh(previous return / 2%). On AAPL's chain of 2026-11-13, 256 paths, the demo's rates: at
a risk price of 0.05 its loss after 460 iterations was 5.31 against 5.43 without memory; at 0.01
after 800 iterations it was 9.4 against 3.2, with two forwards 6% and 2% off and 43% against 65%
of the quotes in band. Its days were calmer where it fitted (excess kurtosis 2 to 28 against 30
to 70; task dh-18). In this form and at these rates it fits worse, so it was not ported.

What a port takes: the law's table becomes a function evaluated in `simulate`; its backward
pass a recursion over the days of a path (one kernel in place of `return_adjoint` and
`law_gradient`); the day's mean move a number of each path (task dh-15); event dates as inputs.
