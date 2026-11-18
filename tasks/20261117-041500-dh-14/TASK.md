# Deep hedger, to confirm: funding is mean plus lambda times deviation

- STATUS: CLOSED
- PRIORITY: 80
- TAGS: dh,owner

A choice of the reconciliation, not the owner's decision (`demos/deep-hedger/THEORY.md`,
section 4). It answers conflict 1 (task dh-08) so that the demo could be built.

A book's price is `rho(L) = mean(L) + lambda * deviation(L)` of what its hedge leaves, and the
hedger minimizes `rho` itself. Then `ask - bid` is the two hedges' cost plus `lambda` times the
two deviations: the owner's two frictions (sig-mmd, 2026-07-08: "1: transaction costs and 2:
discrete time hedging").

Why this and not a squared error (section 4): centered, a squared error ignores cost; the
uncentered one the owner wrote on 2026-08-12 ("The hedger should minimize (Y-W)^2") penalizes
cost on one side and rewards it on the other.

What it gives up: "there are no parameters in this models except for the genrator" (sig-mmd,
2026-07-07). What it is not: Expected Shortfall, the owner's own proposal of 2026-08-17, which
is monotone where the deviation is not and needs a sort for every book on the GPU.

## State 2026-11-17

In `dh-fit.mojo` (`quote`, `adjoint`); the GUI's "risk price". Measured with it: tasks dh-25 and
dh-19. Waits for the owner's yes, or for another `rho`.

## Closed 2026-11-17

Not confirmed: replaced. The owner's last word on the price of risk names Expected Shortfall
("like es confidence intterval or whatever", neil, 2026-10-23; task dh-08), so the deviation and
its `lambda` are out of `dh-fit.mojo` and of the theory. What took their place and what it
measured: task dh-28.
