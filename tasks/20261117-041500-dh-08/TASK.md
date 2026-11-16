# Deep hedger, for the owner: what the spread is

- STATUS: OPEN
- PRIORITY: 60
- TAGS: dh,owner

Conflict 1 of `demos/deep-hedger/THEORY.md` (section 5; the theory around it is section 4). The
owner's words, in order, on each side:

- **It emerges from execution alone, no parameter.** "I feel like the spread should come in
  naturally somehow, if it doesn't I'm not sure the model is right." (braut, 2026-07-22);
  "Hedging 1 and -1 should be fundamentally different things and there are no mids in this
  approach" (sig-mmd, 2026-07-07); "Why do you keep talking about lambda? In my mind there are
  no parameters in this models except for the genrator." (sig-mmd, 2026-07-07).
- **The mean alone gives none.** "The bid=ask=E[Y] is a fundamental problem. I somehow imagined
  that the spread would emerge from the replication error" (braut, 2026-08-13).
- **Mid and replication error.** "how about going back to using mid prices and then the spread
  is the average replication error?" (braut, 2026-08-13).
- **Expected Shortfall.** "Use Expected shortfall with some parameter as the risk preference,
  this should make the spread a function of the confidence level?" (braut, 2026-08-17); the
  same day, of the standard error as the spread: "It feels okay but I can't convince myself why
  it makes sense".
- **Not that either.** "You are focusing way too much on ES and missing the big picture. The
  spread should emerge" and "I do think there has to be some in the end, like es confidence
  intterval or whatever" (neil, 2026-10-23).

## State 2026-11-17

Waits for the owner. What the demo does meanwhile is task dh-14; what it measured about the
shape of the spreads that follow is task dh-19.
