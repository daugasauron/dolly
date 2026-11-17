# Deep hedger: the fitted law is made of jumps

- STATUS: CLOSED
- PRIORITY: 130
- TAGS: dh,demo

The owner saw it in `braut`, of a generator that cheats: "almost all returns are close to
0 and then there are soem sudden jumps. I think it makes sense but it's not a realistic path
law, something to iterate on." (2026-07-25). And no fix by hand: "these kind of jumps should be
something that emerges from the fundamental model and not something that is hard coded"
(cher-sim, 2026-06-02).

## State 2026-11-17

Measured in the image on AAPL's chain of 2026-11-13 (the Law tab at iteration 520): a day's
return has a skewness of -1.9 to -5.8 and an excess kurtosis of 22 to 70 in the eight
intervals, a deviation of 1.2% to 1.6%; the batch's lowest and highest paths move 10% to 15% in
a day. The PyTorch reference agrees (30 to 71 after 800 iterations, largest moves -19% and
+17%).

Cause (`demos/deep-hedger/THEORY.md`, section 7, item 2): with independent days an expiry's
skew can only be made of rare daily jumps. The theory's answer is a law with memory (task
dh-17), whose one trial had calmer days and a worse fit. Done when a fit of the chain has days
a trader accepts on the Law tab, at a fit no worse.

## Closed 2026-11-17

With the volatility state (task dh-17) the same chain is fitted as well by days a trader
accepts: at iteration 2,400 a day's return has an excess kurtosis of 4.0 to 6.6 in the eight
intervals where independent days had 22 to 70, a skewness of -0.73 to +0.50 where they had -1.9
to -5.8, and a deviation of 1.07% to 1.69% (`build/dh-evidence/batch7-run.log`, the `DH forward`
lines: mean, deviation, skewness, excess kurtosis). The Law tab shows these numbers of the last
batch's days, and the paths' scale by day. The owner's question of 2026-06-24, "shouldn't vol
of vol give a lot of kurtosis?", is answered yes: the weeks' fat tails now come from days that
cluster.
