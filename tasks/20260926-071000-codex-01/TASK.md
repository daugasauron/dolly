# Contest air retrieval with a physical tether interceptor

- STATUS: OPEN
- PRIORITY: 270
- TAGS: game,combat,physics

Projectile contacts have not forced courier payload release in measured trials.
Prototype an anchored winch tower whose tethered thruster head can magnetically
catch an opposing aircraft and reel it toward the tower. Use ordinary blocks,
existing forces and a generic embedded controller. Opponents keep their normal
programs and physical capabilities; captures must allow escape and teammate rescue.

Inputs: `build/blockwalker-tether/{interceptor.js,generate.py,catalog.json,hover.c}`.
First verify the articulated head can fly using observed part positions, then
test actual interception against unmodified couriers in the populated world.
The existing winch is a distance constraint; it does not wrap around obstacles.

Completion requires stable flight, an actual magnetic enemy capture and winch
pull, no friendly captures/controller errors/lost actors, saved attachment
restoration and Chrome/Firefox rendering. Compare cargo throughput and capture
durations against a matched baseline before deciding where it belongs in the world.
Keep the prototype out of the local image until these results support it.

First populated90s flight fails: the4.335kg articulated head oscillates while
trying to move6m forward, flips and settles upside down; no target was selected.
Final position error9.53m, minimum up−1, sampled self-contact50.825N, no controller
errors/lost actors/deaths. The base was also on the12m quarry ridge rather than
the intended lower road. Evidence: `...-chrome-tether-hover/salvage/`.
A45s hover-only revision increases attitude damping and compensates lift for
tilt; unchanged geometry/forces. Next placement should be the open approach
near(86,−27), subject to physical verification.

Damped45s hover passes with unchanged bodies and forces. The head moves6m to its
goal and settles with final error below0.001m, minimum up0.928808, zero sampled
self-contact/controller errors/missing actors/deaths. Evidence:
`...-chrome-tether-damped/salvage/`. A paired fresh360s comparison is running at
(86,−27), with all111 existing programs/blueprints unchanged. Baseline hovers;
candidate may intercept nearby airborne opponents using terrain clearance and
winch reach. The initial comparison fixture had a C symbol-name conflict with
world.c and never ran; after renaming that helper it compiles inside Dolly.

The low-tower360s comparison completes with123 objects and11 deliveries in both
branches, zero captures/friendly grabs/controller errors/losses/deaths. Candidate
minimum up0.748102 versus baseline0.928813. It does not contest air retrieval.
The normal courier cruises at32m, above most of this placement's winch reach.
`ridge-catalog.json` moves the same tower to(88,−55) atop the existing12m ridge;
prepared, unrun. Full trace: `...-chrome-tether-intercept/salvage/`. Work now
prioritizes the user's reported frame-rate regression (task073000).
