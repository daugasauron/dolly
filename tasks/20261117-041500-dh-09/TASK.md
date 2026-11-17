# Deep hedger, for the owner: drift

- STATUS: CLOSED
- PRIORITY: 60
- TAGS: dh,owner

Conflict 3 of `demos/deep-hedger/THEORY.md` (section 5). The owner's words on each side:

- **Undecided, the forward should emerge.** "Regarding 0 drift, I'm not sure, this relates to P
  and Q as well, but there is an implied forward price in the option chains that I sort of hope
  will" emerge (boom, 2026-07-22).
- **Take it out.** "Why don't you just remove the drift from the generator paths to make them Q
  paths?" (fable, 2026-06-29).
- **No rates, and no correction inside the generator.** "Drop ALL carry stuff. There are no
  rates in this model." (braut, 2026-08-12); the martingale correction an agent put into the
  kernels on 2026-07-25 was refused with "NO HIDDEN VOL DYNAMICS".

`~/dev/neil/THESIS.md` 4.5 (an agent's) proposes a constraint on the law's mean.

## State 2026-11-17

Waits for the owner. What the demo does meanwhile, and what happens without it, is task dh-15.

## Decided 2026-11-17

The three statements do not conflict once read in order; the demo does all three. The forward
emerges: the law's mean is free and each expiry's forward is fitted from its calls and puts
("there is an implied forward price in the option chains that I sort of hope will" emerge). No
rate enters ("Drop ALL carry stuff. There are no rates in this model.", the last word,
2026-08-12): prices are in forward units. Nothing in the generator is corrected ("NO HIDDEN VOL
DYNAMICS"): the hedge, not the law, is carried at the law's own mean move (task dh-15, which
stays for the owner to confirm, being the one piece of this the owner never spoke about).
