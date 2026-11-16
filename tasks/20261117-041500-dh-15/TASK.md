# Deep hedger, to confirm: the stock is bought forward at the law's own mean move

- STATUS: OPEN
- PRIORITY: 80
- TAGS: dh,owner

A choice of the reconciliation, not the owner's decision (`demos/deep-hedger/THEORY.md`,
section 3, "Carry of the hedge"). It answers conflict 3 (task dh-09).

The law's mean is left free, so each expiry's forward is fitted from its calls and puts and not
set. A position earns the day's move less the law's own mean move of that day, so holding stock
is a fair game under any law and the hedger cannot be paid for a drift. Nothing in the
generator is corrected; no rate enters.

## State 2026-11-17

In `dh-fit.mojo` (`roll`, `adjoint`, `Model.growth`).

Why it is there, measured on a PyTorch reference of the model (`work/dh-evidence/proto.py`,
this machine), a driftless 25% chain, 256 paths: without it, after 360 iterations, the forwards
were 0.994 in one run and 1.006 in another, the hedged books carried 0.10 to 0.13 of deviation
against 0.077 unhedged, and the loss stood at 4 to 5. With it: forwards 1.0000, 0.029 against
0.078. On AAPL in the kernels the law's forwards end within 0.1% of the quotes' (task dh-25).

Waits for the owner's yes. With a law that has memory the mean move is a number of each path
(task dh-17).
