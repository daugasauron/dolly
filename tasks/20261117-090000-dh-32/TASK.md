# Deep hedger, done: dh-gui after the owner's first look

- STATUS: CLOSED
- PRIORITY: 140
- TAGS: dh,demo

The owner (2026-11-17): "this is exactly the kind of GUI I want, but I think both the model
assumptions and the GUI can improve." Its kind is kept. What the owner said of such GUIs and
plots in the earlier projects, and what `dh-gui.cpp` does about each now:

- "I want the market quote to be a vertical bar, and then model bid/ask to be a solid line"; "I
  don't want the y axis to change during the training"; "I wnat to see all the tenors at once";
  "NOT show only OTM. I want to show all." (braut, 2026-08-07 to 08-12): as before.
- "in the IV plots, I want the x axis to be the same across all plots" (sig-mmd, 2026-07-08): one
  x axis for all, and now its ends written under every plot, with three levels across each.
- "Make all the plots bigger" (braut, 2026-07-25): a click on a plot shows its expiry alone,
  calls and puts filling the window; another click, all again.
- "Actual option market bid asks compared with the replication error (hedger price) for all
  contracts (table)" (sig-mmd, 2026-07-08): the Quotes tab; under the pointer on a plot, the
  nearest contract's market and model numbers, its hedge cost and the risk the hedger leaves.
- "I want the distribution plot to be a histogram" and "~10 randomly drawn paths, the 10
  \"worst\" paths and the 10 \"best\" paths" (braut, 2026-08-12): the Law tab's paths as
  before; now beside them the same paths' volatility state by day, and under them the batch's
  days by interval (deviation, skewness, excess kurtosis, how a day's size goes with the day
  before's), the metrics the owner asked a realistic law to be judged by ("acf is a good one,
  kurtosis", cher-sim, 2026-06-04).
- "it should be clear if some contracts are worth buying on average since the hedged PL of
  those contracts to expiry gives a good terminal PL distribution" (neil, 2026-10-23): the
  Hedge tab's histograms, the result at expiry of selling at the market's bid and of buying at
  the market's ask, hedged, over the batch's paths, with mean and worst twentieth; the Quotes
  tab's columns of the same mean for every contract.
- "remove all the useless changing text after that in the \"header\"" (braut, 2026-08-11): the
  line under the buttons is the fit's verdict and nothing else: iteration, the share of the
  model's bids and asks in the market's bands, the loss and whether it still falls, the
  confidence reached. The Fit tab plots the loss and that share by iteration.

## Closed 2026-11-17

The browser test passes on the image of commit 6a66b57b0 in Chrome 156 and in Firefox 159 (`build/dh-evidence/batch8-test.log`): Load quotes, Fit, Stop, Fit again, 660 and 680 iterations in 200 s, then `dh-fit check`.
Looked at in both: `build/dh-evidence/shots/` (every tab, a plot under the pointer, an expiry
alone, in Chrome and in Firefox).
