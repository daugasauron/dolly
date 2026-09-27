# Contest neutral mine cargo at sea

- STATUS: CLOSED
- PRIORITY: 190
- TAGS: game,physics,controllers

Make mine extraction and loading neutral. A physical crane loads a neutral
shuttle; rival crane boats take cargo off its deck, carry it home and unload.
Use ordinary buoyancy, motors, hoists, contact support and magnets, with editable
Lua observing cargo and actuators rather than actor names or catalog IDs.

Completion: prove the same generated mine pallet through Oreki, shore crane,
neutral boat, team boat, receiving crane and scored delivery for both islands;
exercise contested pickup, recovery, and save/restore. Verify the integrated
populated world and packaged image before closing.

Implemented: neutral Mogura/Oreki/sump facility, Kishi pier loader, Shio shuttle,
and Akane/Aoba crane boats. The 10.952 kg flat mine pallet rests physically on a
forward transport deck while sailing. A normal 1 m vertical piston raises the
crane only at the harbor; its structure plus pallet require 89.44 N of its
100 N rating. The hull retains at least 0.6 m planned berth clearance. Both
receiving cranes use 3 m horizontal telescope travel. Geometry has 213/209 boat
parts. Programs and catalog mutations remain generic and editable.

Browser evidence under `build/combat-20260927/`:

- `sea-mine-v9` (fresh, both rivals, 1,200 s): first generated pallet 9 passed
  Oreki 31.267 s → Kishi 211.200 → Shio 258.117 → Blue boat 651.100 → shore
  release 928.617 → receiving crane 1029.367 → depot release 1058.317. Actual
  scoring at 1059.317 awarded 8 points. Measured 204.300 s of moving support
  from real boat/cargo contact impulses. The losing rival returned to its
  waiting position. All 11 actors restored and continued for another 2 s.
- `sea-mine-red-v1` (fresh, Red opportunity, 1,300 s): same production/controller
  and geometry, with Blue omitted. First pallet 8 passed the complete chain;
  Red boat grip 639.217, shore release 1007.217, receiver grip 1119.583,
  depot release 1143.867, score 1144.867 (8 points). Measured 297.317 s of real
  moving deck support. All 10 actors restored and continued for another 2 s.
- `sea-harbor-blue-final` and `sea-harbor-red-final` replay each actual pre-harbor
  checkpoint with only the final sea Lua source updated. Poses, velocities,
  IDs, controller memory, grips and winch lengths are restored normally.
  Empty booms now retract immediately after shore release. Both same-pallet
  receiving/delivery assertions pass without faults/removals. Blue still
  takes about 96 s to align its receiving crane; do not claim its pickup was
  accelerated. Red receiver pickup follows shore release in about 28 s.

All C compilation occurred inside Dolly. No forced attachment, cargo movement,
force-limit change, payload weakening or deletion was used. Failed probes are
retained: early runs exposed workshop/route interference, lightweight winch
bodies, and unstable high loads. The low fixed crane then caught the 2 m island
lip, confirmed by actual contact boxes in `sea-harbor-contact`; a tall fixed
mast destabilized pickup. Deck support plus the telescoping mast resolved both.

Final fragments/fixtures: `build/action-front-20260927/sea/`.
Source-v19 SHA256: `c39aeaa78b62332c390b09a6ee3a89f84f7aa7385c9840a4716f171e7f8d0965`.
Integrated verification: `build/action-front-20260927/full-v6/sea-chain.txt`
traces pallet 141 through porter 34 → pier 132 → neutral boat 131 → Blue boat
134 → receiver 30 → island score at 1064.633 s. All 156 resumed actors remain;
no faults/removals. The focused Red proof above establishes its complete route.
Actual local Firefox/Chrome, old-world restore and package/preservation gates
pass in the same parent evidence directory.
