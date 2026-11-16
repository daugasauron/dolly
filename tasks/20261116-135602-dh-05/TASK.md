# Deep hedger: the open conflicts are the owner's to decide

- STATUS: OPEN
- PRIORITY: 50
- TAGS: dh,owner

`demos/deep-hedger/THEORY.md` section 5 lists six conflicts in the owner's own words across the
projects. The demo took a position on each so that it could be built; none is the owner's
decision yet. In the order they change the model:

## State 2026-11-17

1. **What the spread is.** The demo: `price = mean + lambda * deviation` of the residual, one
   `lambda`, the hedger minimizing that same quantity. It keeps the owner's later statements
   (spread from cost and from what daily hedging leaves, a risk parameter "like es confidence
   intterval or whatever") and gives up "there are no parameters in this models except for the
   genrator" (2026-07-07). Alternatives the record holds: Expected Shortfall with a confidence
   level (2026-08-17), which is monotone where the deviation is not and needs a sort per book on
   the GPU; friction alone, `lambda = 0` with a cost-aware hedger, which has no parameter-free
   objective (THEORY.md section 4).
2. **Drift.** The law's mean is free, so the forward is fitted from the quotes, and the hedger
   buys the stock forward at the law's own mean move, so no drift can be earned. Without that the
   fit did not settle on a driftless chain (task dh-03). The alternative is a constraint on the
   law's mean, which the owner refused in another form on 2026-07-25.
3. **Historical returns**: none, by the owner's latest word (2026-09-07).
4. **Pathwise option prices against state-conditional ones**: arises with task dh-06.
5. **An illiquid name**: the thesis's own test, never run in any project.
6. **American exercise**: not modelled; in-the-money puts that early exercise prices are left
   out of the fit. SPX would avoid it; it needs a data source (task dh-02).

Waits for the owner.
