# Deep hedger, for the owner: American exercise

- STATUS: OPEN
- PRIORITY: 50
- TAGS: dh,owner

Conflict 6 of `demos/deep-hedger/THEORY.md` (section 5). The owner's messages do not mention
early exercise anywhere in the 2,193 extracted; no project addressed it. Every project fitted
American single-name options (AAPL, Dubach's data) with a payoff at expiry.

## State 2026-11-17

Measured on AAPL's chain of 2026-11-13, 45-day expiry, in forward units: an in-the-money put's
bid is 0.0042 to 0.0046 above the payoff's value at the strikes 1.14 to 1.25, where a call of
the same strike is worth 0.0002; the calls agree with put-call parity (0.1944 against 0.1921 +
0.0024 at 0.81). With those puts in the fit, a PyTorch reference of the model put the 20- to
45-day forwards 0.4% to 0.5% low.

The choices: leave such puts out (what the demo does, task dh-16); price exercise in the model,
which makes the hedger decide it; or fit a European chain (SPX; task dh-20).

## Decided 2026-11-17

Looked for again on 2026-11-17: nothing in the owner's words on early exercise, American
options or dividends as a modelling question. It stays the owner's. What each answer changes:
leaving such puts out (now, task dh-16) loses the in-the-money puts of the longer expiries and
nothing else; pricing exercise makes the holder's decision part of the long book and the
writer's risk part of the short one, a second policy and a stopping time in the kernels; a
European chain (an index) removes the question and is not the single name the owner wants.
