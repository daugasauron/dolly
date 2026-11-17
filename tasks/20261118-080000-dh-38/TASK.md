# Deep hedger, research mode: what a spread is

- STATUS: OPEN
- PRIORITY: 150
- TAGS: dh,owner

The owner, 2026-11-18, on task dh-37's reading: "there is no model decided yet, this is still
in experimentation phase where we are trying to use assumptions to deriva a model that makes
sense. Feel free to try different things. I think my idea is that somehow the spread would be an
output of the neural net, or even that the bids/asks are the output directly. [...] it's time to
go into research mode."

The document: `work/research/deep-hedger-2026-11-18.md` in the main checkout's `work/` (not in
git: it quotes the owner's sessions). Seven candidate formulations, each with its source (the
owner's earlier projects, the literature, this work), and three experiments.

## Measured 2026-11-18, AAPL (this machine, `work/dh-evidence/exp-*.py`, `build/dh-evidence/exp-*.log`)

- The PyTorch reference of the tree's model on the GPU (`exp-base.py`, 1024 paths, 900
  iterations): 81% of the middles in band, 35% of the risk left, one price of risk 0.018 of the
  whole residual's deviation; as `dh-fit`.
- Laying risk off in the other contracts at the market's quotes (`exp-layoff.py`, out of the
  money, medians): a fifth of the own half spread spent leaves 0.67 of the stock hedge's risk,
  58% leaves 0.41, 89% leaves 0.28, 142% leaves 0.22. What the market maker keeps per deviation
  of what is left is 0.019, 0.020 and 0.018 for nothing, 18% and 58% spent, and negative
  beyond. With the others at the model's own spreads (a price times each one's deviation) no
  hedge is used: that rule is a fixed point of passing risk on, by the triangle inequality.
- The half spread as a network of the contract's place (`exp-spread.py`): miss 0.07 on the
  chain it is fitted on, 5.5 on an expiry left out, 1.9 on the next close's chain; one constant
  spread 1.19, 1.41 and 2.25; a constant in volatility points 1.81.
- The same contract's quoted spread on the closes of 11-13 and 11-16 (`exp-persist.py`): out of
  the money 39% of 454 within a factor of 1.5 (miss 1.30); in the money 88% of 646 (miss 0.27).

## Recommended, put to the owner

The tree's model, with an expiry's price of risk an implied number, and a quote on a later day
of a path the same rule on that day (the fair value there, less or plus the price times the
deviation still to come), which gives the hedger options to trade. Not built.

## Open

- The owner's answers to the document's three questions.
- Seeds: the experiments ran on one seed of the law.
- Quotes from inside the session, against the closes' noise.
