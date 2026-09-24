# Return an empty mine porter to the tunnel

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: bug,game,physics

The 70-object, 1800 s run kept every machine alive but Oreki stopped searching
at (-73.9,-29.3) after losing its pickup job at 700.733 s. The next mine core at
(-73,-78) was outside its 48 m observation radius. Search brakes the vehicle,
so no future supply could restart it. Exact world and controller memory:
`build/blockwalker-mine-continuous-final0/segment-1800/blockwalker-world.json`.

When no job is visible away from home, follow the existing return waypoints
back into the mine. Preserve cargo, physics and controller memory when replaying
the saved stall. Verify resumed pickup and haulage, then another full population
run with continued late mine activity. The phase trace shows a returning porter
selected its own previous handoff in the dispatch yard, then lost that job to an
aircraft. Restrict pickup jobs to cores inside the tunnel as well as returning
home when an outside pickup disappears. The permanent regression includes both
an out-of-range mine core and an already staged dispatch core.

`build/blockwalker-porter-resume-fixed/` replays the exact 1800 s save, preserving
physics and memory. The old controller moves 0.003 m in 30 s and remains at three
pickups. The return fix travels 185.716 m in 300 s, reaches z=-72.854, makes two
more pickups and hauls a core outside. Minimum up 0.99742, zero removals.
The tunnel-only pickup restriction and its two-core regression pass in
`build/blockwalker-mine-continuous-final42/`: 1200 s without reloads or removals,
seven pickups, six handoffs, five scored mine cores and 641 m travelled. The
porter covers 49 m in the final quarter and is carrying another core at the end.
