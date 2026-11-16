# Deep hedger: one risk price does not give AAPL's spreads their shape

- STATUS: OPEN
- PRIORITY: 120
- TAGS: dh,demo

A finding of the demo about its own theory (`demos/deep-hedger/THEORY.md`, section 4: the
spread is hedge cost plus `lambda` times the risk left). The owner: "With some imagination you
couldn then say that a certain confidence level is implied by the market?" (braut, 2026-08-17).

## State 2026-11-17

Measured in the image on AAPL's chain of 2026-11-13 (last session's closing quotes), stock cost
0.25 bp, risk price 0.01 (the Fit tab at iteration 520):

- the market's mean spread is 1.29, the model's 0.135, of which hedge cost 0.023;
- the risk price at which this hedger's costs and risks would add up to the market's spreads is
  0.117 over all contracts, and by expiry 0.171, 0.094, 0.208, 0.152, 0.128, 0.090, 0.130 and
  0.025;
- the market's bands run from one cent to 3.88 dollars, the wide ones in the money; 66% to 75%
  of the model's bids and asks are inside them, and on the last expiry, whose bands are tight,
  33%.

So in this name the spreads are not one price of the risk daily stock hedging leaves: they are
tight where the flow is and wide where nobody trades. What would tell more: live quotes in
place of closing ones (a token, task dh-20); options as hedge instruments, which is where
`braut` measured most of the spread (task dh-06); a name with wide spreads (task dh-11); another
`rho` (task dh-08).
