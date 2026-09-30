# Investigate rope and winch links between character parts

- STATUS: CLOSED
- PRIORITY: 180
- TAGS: game,physics,builder

Follow up the rope idea from the cargo launcher discussion. Define editable
endpoints and length, render the rope, and save/restore its state. Box3D distance
joints can enforce an upper distance limit with slack below it; verify that the
rope pulls but never pushes. Consider a motor-limited winch controlled by normal
character keys. Test suspended loads, reaction forces, slack and restoration.

The first cargo slinger uses ordinary turntables and a magnet, so it does not
depend on this investigation. Keep any rope behavior generic, with no special
case for a named machine.

The standalone C prototype now compiles and passes inside Dolly. Slack and
payout apply no force in zero gravity. A hanging 0.864 N load stays at
5.600029 m with 5.599998 m paid out. A 0.2 N motor gains only 0.0000062 m
in ten seconds; a 4 N motor lifts 2.103 m in four seconds. Brake/recreated
length holds, and two free endpoints conserve linear momentum. Evidence:
`build/slopyard-compound-regressions-chrome-rope/rope/regression.log`;
source `build/slopyard-rope/trial.c`. This proves the center-anchor physics
only, not an editable/rendered/saved game block. Next: block-local endpoints,
finite-force controls, visible cable/slack and full persistence, then a working
suspended-magnet machine. Salvaging missed light cargo from water would give
this a real job in the world.

The unbundled game-block prototype also passes inside Dolly. A 2 N motor cannot
lift a 7.301 N endpoint assembly; 24 N reels 1.561 m in three seconds. Off-center
pull rotates a free chassis while conserving linear momentum. Loaded world
persistence exposes paidOut/tension sensors and retains magnetic cargo through
twenty reopens: 10.952 N suspended tension, 1.157 m lift and 1.587 m payout.
Seven malformed cable-state imports leave the current world intact. Slack
length and a winch disabled by a rigid neighboring bridge round-trip correctly.
Evidence: `build/slopyard-compound-regressions-chrome-winch-{engine,state}/`.
Rendering, builder controls and a real salvage workload remain before promotion;
canonical source and served image remain at checkpoint 33.

The complete block now passes Chrome and Firefox: the ordinary lower/capture/
hoist program lifts its crate over 2 m, and payout leaves visible cable slack
above a grounded load. Builder placement, R/F binding, force/capacity changes
and exact design export/import pass. `build/slopyard-winch-view-{chrome,
firefox}/proof.json` records that workload; Firefox also passes bearing physics
and twenty reopens of the previously crashing 97-object save. The canonical
combined browser check includes these winch tests and passes in
`build/slopyard-image35-canonical-proof/`. Salvage boats are tracked separately
in `20260925-052300-codex-01`; this block does not collide or wrap its cable
around terrain.

Verified and bundled in local image 35. Chrome and Firefox verify all 93
bundled designs and restore both the 125-object format-2 world and original
51-object format-1 save. `build/slopyard-image35-preview{,-firefox}/proof.json`.
Protected files and twelve other images remain unchanged. Source SHA-256:
`42a882d7abe466aec3ab476e012d64bbcced33cba1422a018f716571fabcc94c`.
