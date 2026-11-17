# Deep hedger: a law with memory

- STATUS: CLOSED
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

## Closed 2026-11-17

In the demo as a volatility state, the form the owner gave for what the past teaches ("express
everything that comes from historical paths as parametric properties (vol clustering), not add
the returns directly", braut, 2026-07-25): a day's return is a shock from the interval's law
times the path's scale, and the scale's logarithm keeps a share of itself a day and moves with
the size and the sign of the day's shock (`demos/deep-hedger/THEORY.md`, section 3). Three
numbers, fitted with the weights; the hedger sees the state of the last day it has seen; the
day's mean move, at which the hedge is carried, is a number of each path's day (task dh-15).

In the kernels: `simulate` (state, mean move and its slope), `return_adjoint` (a path's backward
pass through its state), `law_gradient`. `dh-fit check` on AAPL's chain of 2026-11-13, 256
paths, a hedger of one constant position: the state's three derivatives -1.185, 15.67 and 12.91
against central differences -1.157, 15.94 and 12.37.

Measured on that chain, 1,024 paths (`build/dh-evidence/batch7-run.log`): after 900 iterations
two seeds give keep 0.891 and 0.902, swing 0.235 and 0.240, lean -0.122 and -0.111; a day's size
goes with the day before's at 0.31 to 0.40 in the eight intervals. The fit is no worse than with
independent days (loss 1.2 to 1.4 and 75% in band at 2,400 iterations, as before) and reaches
it sooner: 59% in band at iteration 200, 69% at 400. The earlier trial on the reference, which
fitted worse, had the weights themselves depend on the last return.

Left, moved: event dates as inputs of the law (task dh-29).
