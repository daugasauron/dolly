# Give the biped cleaner foot clearance and a quicker stride

- STATUS: OPEN
- PRIORITY: 200
- TAGS: game,agent,physics

Sidelight II advances 7.208 m in 300 s with 18 alternating ground-clear
placements, but its opposite feet sometimes rub during swing. Actual Box3D
pair/impulse measurements are in build/blockwalker-contact/proof.json.
Keep that verified design and the original. Use actual Astra/xhigh Pi, real
physics feedback and a few timed GPU frames to improve foot separation and
weight-transfer speed. Save each experiment before replacing it.

Verify repeated forward placements with the other foot supporting the body,
clearance between opposite legs, bounded stance slip and at least 300 s in the
populated world before promoting another successor. Preserve gravity, collisions,
all creations and complete native history. Faster displacement from sliding or
falling does not count. Larger bodies and arm counterweights are possible
experiments, not requirements or hidden support.
