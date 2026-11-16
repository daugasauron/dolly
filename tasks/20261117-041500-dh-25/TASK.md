# Deep hedger, done: the fit on AAPL's chain, measured

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: dh,demo,gpu

Owner (2026-11-16): "the best attempt you can make at taking my ideas during the project to fit
a model to those prices." And of what counts: "If the seed has impact on the runs the models
havent converged" (fable, 2026-06-16); a start that is no loaded checkpoint (braut, 2026-08-11).

## Closed 2026-11-17

`dh-fit` of commit `357d52eb6` on the RTX 5070 in Chrome 156; AAPL's chain of 2026-11-13 as
dh-gui wrote it on 2026-11-17 (208 contracts, 8 expiries of 3 to 45 business days), 1,024
paths, stock cost 0.25 bp, risk price 0.01, from equal kernel weights and a random hedger. Logs
in `build/dh-evidence/` (this machine). What the numbers mean: `demos/deep-hedger/README.md`.

- **900 iterations, 287 s** (`dh-fit CHAIN 1024 1 900`): loss 4.7 at iteration 200, 1.8 at 500,
  1.37 at 900; 69.7% of the model's bids and asks inside the market's bands; the law's forwards
  1.0002, 1.0006, 0.9998, 0.9999, 1.0009, 1.0008, 1.0001, 1.0005 of the quotes' own, with no
  constraint; a day's deviation 1.17% to 1.57%; the hedged books' deviation 0.0271 of the
  forward against 0.0592 unhedged; the model's mean spread 0.000345 against the market's 0.00362.
- **2,400 iterations, 765 s**: loss between 1.17 and 1.53 from iteration 1,000; 75% in band;
  0.0260 against 0.0597.
- **Another seed** (`... 2 900`): loss 1.357, 70.0% in band, each interval's daily deviation
  within 2% of the first run's, bids and asks 0.0000456 apart on average over the 208
  contracts, an eighth of the model's own spread. The same seed twice: the same loss to sixteen
  digits; Chrome and Firefox: the same.
- **What the hedger holds** (the Hedge tab at iteration 400): 0.8 of a share against the 20-day
  call 15% in the money; at the forward, from 0.3 toward 0.6 to 0.8 on paths that end in the
  money and to nothing on those that end out; under 0.1 against the call 13% out.

What the fit shows that is not good is open: the law's jumps (task dh-18), the spreads' shape
(task dh-19).
