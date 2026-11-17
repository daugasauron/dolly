# Deep hedger: one price of risk does not give AAPL's spreads their shape

- STATUS: OPEN
- PRIORITY: 120
- TAGS: dh,demo

A finding of the demo about its own theory (`demos/deep-hedger/THEORY.md`, section 4: the
spread is hedge cost plus `lambda` times the risk left). The owner: "With some imagination you
couldn then say that a certain confidence level is implied by the market?" (braut, 2026-08-17).

## State 2026-11-17

Measured again with the price of risk an Expected Shortfall whose confidence is fitted (task
dh-28), AAPL's chain of 2026-11-13, 900 iterations (`build/dh-evidence/batch9-run.log`):

- the confidence the quotes imply is 0.002 (two seeds: 0.00158 and 0.00157 at iteration 900):
  the model's price is the mean of all but the best fifth of a percent of the paths, next to
  the plain mean;
- the model's mean spread is then 0.08 (currency) against the market's 1.29, of which hedge
  cost 0.02; 77% of the model's bids and asks are inside the market's bands.

Why so low: the confidence's loss is in band widths, as the generator's is, so the tight quotes
decide it, and at the money, where a daily stock hedge leaves the most risk, AAPL's bands are
cents wide. The market's mean spread is made by the in-the-money closing quotes, dollars wide,
where that hedge leaves the least. So in this name the spreads are not a price of the risk
daily stock hedging leaves: they are tight where the flow is and wide where nobody trades.

What would tell more: options as hedge instruments, which is where `braut` measured most of
the spread (task dh-06); live quotes in place of closing ones (a token, task dh-20); a name
with wide spreads (task dh-11); for the owner, which quotes the confidence should answer to
(task dh-30).
