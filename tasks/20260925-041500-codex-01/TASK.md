# Investigate rope and winch links between character parts

- STATUS: OPEN
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
`build/blockwalker-compound-regressions-chrome-rope/rope/regression.log`;
source `build/blockwalker-rope/trial.c`. This proves the center-anchor physics
only, not an editable/rendered/saved game block. Next: block-local endpoints,
finite-force controls, visible cable/slack and full persistence, then a working
suspended-magnet machine. Salvaging missed light cargo from water would give
this a real job in the world.
