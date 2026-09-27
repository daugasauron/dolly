# Carry Harbor Atlas output from the dock to the island

- STATUS: OPEN
- PRIORITY: 265
- TAGS: game,physics,controllers

The mature world has four Atlas crates near (106, 0.485, 10), while Kawasemi
waits beyond pickup range at home (218, 6). Moving it to (112, 8, 8) exposes a
second bug: coarse traffic avoidance holds it above the entire crane for
594.6 s instead of descending for the unheld dock cargo.

The verified controller accepts eligible unheld dock cargo, keeps teammates'
magnetic loads alone, selects its own island, and checks the projected aircraft
footprint against actual nearby body bounds. It waits for obstructing crane
parts rather than treating the crane's whole radius as an overhead obstacle.
Motors, forces, Atlas, tug and cargo designs are unchanged.

Exact retained regression: `test/fixtures/blockwalker-dock-courier.c`.
Dolly proof: `build/overnight-20260928/team-audit/dock/clearance-v1/`.
Supported Atlas setdown 18.367 s → actual courier grip 30.200 s → supported
island release 87.417 s → engine delivery 88.417 s. Both releases require
measured external support exceeding half the cargo's weight within 0.2 s.
All originals survive, with zero controller faults. The unchanged tug also
hands a second real crate to Atlas during this same run.

Source and exact fixture are verified. Remaining checkpoint integration: move
catalog entry 22 to (112, 8, 8). No other catalog move is required. Close after
that placement is included in the checkpoint.
