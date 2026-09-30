# Contest air retrieval with a physical tether interceptor

- STATUS: CLOSED
- PRIORITY: 270
- TAGS: game,combat,physics

Projectile contacts have not forced courier payload release in measured trials.
Prototype an anchored winch tower whose tethered thruster head can magnetically
catch an opposing aircraft and reel it toward the tower. Use ordinary blocks,
existing forces and a generic embedded controller. Opponents keep their normal
programs and physical capabilities; captures must allow escape and teammate rescue.

Inputs: `build/slopyard-tether/{interceptor.js,generate.py,catalog.json,hover.c}`.
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

September26 Lua implementation: the short36-part tower at(88,-45) uses ordinary
winch, magnets and eight opposed thrusters. Its head flies by observed part
positions; target selection uses team, terrain clearance and physical cable
reach. `build/living-world-20260926/tether-matched-{on,off}` resumes the identical
240s populated save for600s, changing only the tower's enemy predicate. Both
finish with98 actors, no faults/losses/deaths. Active tower captures31 at308.533s
and holds it531.483s; no friendly grips. Courier travel149.98m versus905.24m,
new deliveries0 versus1 (with another cargo being carried in the inactive run).
Total deliveries13 versus14. This is one matched trial, not a general balance claim.

`capture-reload-final` preserves the actual captured aircraft and cable length
through ten reopens and ten subsequent simulation seconds. The existing focused
crawler rescue `ridge-window-focused` frees the courier, which then flies701m;
full traffic exposes a harder grounded capture and remains under active repair.
Final Chrome/Firefox rendering and packaged-image confirmation remain due.

## Completion

Final September 27 checkpoint packages Shishi as object 82. The 7,200 s
`long-fresh` run captures opposing courier 31 at 228.183 s and releases at
233.683 s, with no friendly tower grips, controller errors or missing originals.
The aircraft subsequently needs ground assistance; the new ground-recovery issue
tracks that limitation. The matched throughput/capture trial above and successful
focused release/rescue remain the basis for including this interceptor.

`final-chrome` and `final-firefox` pass actual packaged rendering of fresh and
captured-run saved worlds, save/export, real-time simulation and clean shell
recovery. `multi-magnet-winch-v2` also verifies reordered holders and independent
release after reload. Source/served-image hashes are in
`build/living-world-20260926/package-proof.json`. Close the physical interception
feature; do not infer universal rescue or competitive balance. The unproven
ridge crawler is withheld and tracked separately in
`20260927-071800-codex-ridge-rescuer`.
