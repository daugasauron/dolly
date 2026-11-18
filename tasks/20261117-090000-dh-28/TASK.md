# Deep hedger, done: the price of risk is an Expected Shortfall, its confidence fitted

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: dh,demo,gpu,mojo

The owner's decision (task dh-08; `demos/deep-hedger/THEORY.md`, decision 24 and section 4):
"Use Expected shortfall with some parameter as the risk preference, this should make the spread
a function of the confidence level? With some imagination you couldn then say that a certain
confidence level is implied by the market?" (braut, 2026-08-17); "as few parameters as possible
(I do think there has to be some in the end, like es confidence intterval or whatever)" (neil,
2026-10-23).

## Closed 2026-11-17

In `dh-fit.mojo`: `quote` finds each book's quantile by halving and prices it at
`q + mean(max(L - q, 0)) / (1 - a)`; `adjoint` seeds the hedger's gradient with the paths above
the quantile. The confidence `a` has a loss of its own, the model's bid from the market's bid
and its ask from the market's ask, in band widths. It needs one: the generator's loss is zero
inside a band (the owner, the same message: "I don't want model prices that falls within the
market bid/ask to generate any loss for the generator"), which leaves the spread's width free,
and fitted by that loss alone the confidence fell without end (0.007 and falling at iteration
500, `build/dh-evidence/batch5-cl-run.log`).

`dh-fit check` on AAPL's chain of 2026-11-13, 256 paths: the kernels' bids and asks and the
host's own Expected Shortfall of the kernels' paths agree to six digits (0.089821756 and
0.0898210566); the confidence's gradient 25.58 against a central difference of 25.59, and 0.19
against 0.17 after 300 iterations of fitting; the hedger's seven sampled gradients within 2% of
their differences. An iteration of 1,024 paths is 0.35 s, as before (0.07 forward, 0.26
`adjoint`, 0.03 sums).

**The hedger has a preference of its own.** Hedging at the quotes' confidence, the hedger
stopped hedging as that confidence fell: at 0.002 an Expected Shortfall is next to the mean, and
the mean of a book does not depend on its position, the stock being a fair game. Seen in the
image at iteration 380 (`build/dh-evidence/shots/firefox-enlarged.png`: "the hedger leaves 95% of
the risk" of a call 4% out of the money; `chromium-hedge.png`: a quarter of a share held against
a call worth three cents). So `quote` and `adjoint` take two confidences: the hedger's, given
(0.5), and the quotes', fitted. With it, on the same chain, 900 iterations, two seeds
(`build/dh-evidence/batch9-run.log`): the hedger leaves 37% of the unhedged deviation where it
left 48%. `dh-fit check`, 256 paths: the hedger's seven sampled gradients within 1.5% of their
differences; with the hedger of 300 iterations the generator's within a sixth of theirs, where
holding positions fixed is now an approximation twice over (THEORY.md, section 4).

What it measured is task dh-19; that the tight quotes decide the quotes' confidence, and that
the hedger's is another, is for the owner (task dh-30).
