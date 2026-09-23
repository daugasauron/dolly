# Keep Skybarge clear of raised terrain during roaming

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: bug,game,physics

The 49-object seed-42 population survives its first 600 simulation seconds,
including three tug/crane handoffs. Continuing that exact saved world for 900 s
with reloads every 180 s removes Skybarge at 987.6167 s: root tipped over,
up -0.8146, position (62.029, 9.605, 55.014). The other 48 objects survive to
1500 s; all eight delivery credits remain.

Evidence: `build/blockwalker-tug-population-long-42.log` and its directory's
saved world, `tug-trace.csv` and `tug-memory.jsonl`. Replay starts from
`build/blockwalker-tug-cargo-avoidance-42/blockwalker-world.json` using
`build/blockwalker-tug-long.mjs population-long-42 --resume 900`, compiled in
Dolly and run within the 4 GiB/no-swap browser limit.

The original altitude target used the floor directly beneath the aircraft plus
six metres. Investigation retained physics, contact rules and failure detection.

The 960 s checkpoint reproduces the exact removal. Contact starts at 980.50 s
between lower-frame part 19 and the four-metre ledge centered at (58,2,54), then
continues against the eight-metre box centered at (65,4,58). No other creature
contacts occur. Baseline evidence: `build/blockwalker-skybarge-baseline/` and
matching log. A first candidate using all 16 ground samples survives to 1050 s,
but climbs into Obsidian Kite and spends too long in contact with it. It is not
promoted.

Using the eight existing six-metre ground samples clears the exact replay:
all 49 survive to 1050 s, minimum aircraft up 0.96839, peak altitude 14.704 m,
and zero terrain or other-creature contact records. Evidence:
`build/blockwalker-skybarge-nearby/` and matching log. The source catalog now
contains this controller change; no geometry, forces or collision rules changed.

The short isolated quarry approach also distinguishes the behavior. The old
controller remains pressed against the ledge and reaches only z=50.677; the
candidate crosses to z=81.777, with minimum up 0.97376, peak altitude 15.497 m
and no raised-terrain contacts. Both use the real catalog body and controller,
with only the initial navigation destination set for the approach. Evidence:
`build/blockwalker-skybarge-regression3.log` (exit 0). The passing physical check
is added to `test/fixtures/blockwalker-playground.c`.

The fresh seed-42 population passed 1200 s and six reloads: all 49 objects,
zero removals and eight deliveries. Skybarge travelled 1505.16 m from 12000
physical samples, with minimum up 0.96868, peak altitude 14.493 m and 68 waypoint
arrivals. Evidence: `build/blockwalker-skybarge-fresh-42.log` and
`build/blockwalker-tug-skybarge-fresh-42/result.json`. The terminal-text capture
for this long run was empty; the downloaded world and sampled physical trace
provide the measurements. The focused driving/physics suite passed with the
new regression (`build/blockwalker-skybarge-driver1.log`, exit 0), including
10.89 m of keyboard driving, 73 Eyes samples and actual pickup.

Rebuilt image: 232138135 bytes, SHA-256
`00bc3963154a3d2eae5f85f224134dd3a13717498c83077dd9f8e4acdbf69048`;
source SHA-256 `867a6cc23d58c0a9678150a6a9b2167fc069082caab6f7f76e2cf7916066adf1`.
Build time was 23.2 s with the unchanged runtime
(`build/blockwalker-playground-image14.log`).

The actual 9099 preview passed a fresh-catalog/source comparison and the normal
world import, follow and Eyes controls. All 49 objects remained alive at 1052.6 s;
Skybarge was at (68.61,13.49,51.96), up 0.99999, with no browser errors.
Both camera screenshots were inspected. Evidence:
`build/blockwalker-skybarge-preview1.log` and
`build/blockwalker-skybarge-preview/{result.json,quarry-follow.png,quarry-eyes.png}`.
The original replay, short physical regression, fresh population and served
image checks are complete.
