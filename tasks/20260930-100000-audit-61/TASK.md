# Tracker priorities and duplicates

- STATUS: CLOSED
- PRIORITY: 100
- TAGS: tests,cleanup

All 22 open Slopyard tasks outrank the infrastructure tasks (P25-50), contradicting "rank
measured iteration costs ahead". Duplicates/overlaps: artillery-resupply vs
logistics-continuity; artillery-effects vs catapult hits (20260926-044300); aircraft-recovery vs
ridge-rescuer; aerial-rescue vs biped falls/patrol; mature-frame-rate vs the Lua task's 60 FPS
target. 20260923-211500 (Lua migration) is effectively done except harness reconciliation.
`tasks/README.md` described obsolete worktrees (fixed with this filing).

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Priorities follow the core-first direction; duplicates merged.

## Done when

- Demo tasks re-prioritized below core work; duplicates closed with links.

## Resolution (2026-09-30)

Done: demo gameplay tasks now rank below core work (2e353f6).
