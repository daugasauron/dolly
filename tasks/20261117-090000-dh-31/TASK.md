# Deep hedger, to confirm: where a fit starts, and the volatility state's form

- STATUS: OPEN
- PRIORITY: 60
- TAGS: dh,owner

Choices of 2026-11-17, not the owner's decisions (`demos/deep-hedger/THEORY.md`, section 3).

## State 2026-11-17

In `dh-fit.mojo` (`Model.__init__`, `simulate`):

- **A fit starts from a normal law** at each expiry's own at-the-money volatility, read off the
  call nearest the forward, where it started from equal kernel weights. Measured on a PyTorch
  reference of the model (`work/dh-evidence/proto3.py`, this machine), AAPL's chain, independent
  days: loss 7.3 against 12.9 at iteration 220. The owner distrusted a good start once ("it's
  VERY suspicious how good the "starting point" is", braut, 2026-08-07); that one was a stored
  fit. This one is one number an expiry, taken from the chain on the screen.
- **The state**: `log s' = keep * log s + swing * (|e| - 0.798) + lean * e`, bounded at
  -1.5 and 1.5, `e` the shock over that starting deviation; it starts at 1 on every path, with
  keep 0.9, swing 0.1, lean 0. One state for all intervals.

Waits for the owner's yes, or for another form.
