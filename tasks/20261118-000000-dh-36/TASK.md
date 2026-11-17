# Deep hedger, done: the hedger replicates, and the spreads imply their own charge

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: dh,demo,gpu,mojo

The owner's conversation of 2026-11-17 (tasks dh-30, dh-31, dh-35, dh-06 hold its words): the
hedger replicates with a loss that has no side; the price of risk is "how much you risk loosing
before you're able to close out the position, and how much that would cost"; "the model bid/ask
matches the market bid/ask meaning that hte \"risk/time to get out/etc\" is what is implied in
the market". The model written from it: `demos/deep-hedger/THEORY.md`, section 4.

## Closed 2026-11-18

In `dh-fit.mojo`: the hedger's loss is the sum of the books' deviations (`adjoint`'s seed); a
book's middle is its residual's mean (`quote`); `roll` keeps what each hedge had gained before
ten check days and `carry` measures, at each report, the variance each book's cost-to-go from
those days still has given the day's stock and volatility state; the host reads from it, for
each of three closures, a floor for the name and a number for each expiry, each contract's
days paid for and its charge; the generator's loss is the charged bid and ask against the
market's band. In `dh-gui.cpp`: the charged quotes on every plot and table, a Spreads tab.

Measured on AAPL's chain of 2026-11-13, 1,024 paths (`build/dh-evidence/batch13-n5-run.log`,
`batch13-t2-run.log`, this machine; the README has them in full):

- `dh-fit check`, 256 paths: the hedger's gradient within 0.3% of central differences, the
  generator's within 0.2% at a constant position.
- 900 iterations: 79% and 82% of the middles in band; of the charged quotes 63% to 67% (bids
  54% to 62%, asks 65% to 76%); 35% of the unhedged risk left.
- The price of a day's deviation by expiry, over a floor of a tick: 0.002 to 0.003 in the three
  monthly expiries, 0.004 to 0.008 in the three weekly ones, 0.03 in the two odd-dated ones.
  The miss 0.45 to 0.53 in log units, the same for the whole residual's deviation; 0.8 for a
  holder out after some days; 1.2 to 1.4 for one number for the name.
- Two seeds, 900 iterations each: the same 65% of the charged quotes in band, the state 0.902, 0.210, -0.116 and 0.902, 0.215, -0.120, the expiries' prices of a day's deviation within 15% of each other but for the 5-day expiry's (0.0017 and 0.0025).
- A PyTorch reference of the model on the CPU (`work/dh-evidence/proto5.py`, 256 paths, 400
  iterations, no floor) gives the same order of the expiries and the same sizes: the price of
  the whole residual's deviation 0.019, 0.009, 0.106, 0.019, 0.020, 0.014, 0.088 and 0.015.
- The browser test passes on this image in Chrome 156 and in Firefox 159 with the same numbers (`build/dh-evidence/batch8-test.log`, 23:27): 660 iterations in 200 s, the loss from 2.07 to 0.17.

Simplified that night, each said where it is: the stock is the only hedge instrument (task
dh-06); the closure's numbers move the law through the charge, not through a gradient; a day's
middle is a line in the volatility state over the 64 paths nearest in the stock.
