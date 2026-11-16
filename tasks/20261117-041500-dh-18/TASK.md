# Deep hedger: the fitted law is made of jumps

- STATUS: OPEN
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
