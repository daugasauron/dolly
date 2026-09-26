# Recover fallen walkers with a flying magnetic winch

- STATUS: OPEN
- PRIORITY: 280
- TAGS: game,controllers,physics

Both bipeds fall during ordinary play. Add a flying recovery machine with a
magnet suspended on a rope. It should find fallen friendly/neutral walkers,
approach safely, attach physically, use thrust/winch forces to raise/right them,
lower onto supported feet and release. Coordinate with the walker recovery
controller so a rescue can lead to resumed supported walking.

Use editable generic Lua and ordinary blocks/forces. Do not move bodies, weaken
gravity or label a grip/brief upright pose as a successful rescue. Replay real
fallen Sidelight and Hibari saves and verify stable release plus new supported
steps, then autonomous rescue in a populated world. Preserve save/reload and
Chrome/Firefox rendering. Related gait issue: 20260915-110000-codex-01.
Requested September 27; work deadline 12:00 JST (03:00 UTC). Evidence root:
`build/mechanics-20260927/`. Preserve the 07:45 checkpoint while iterating.

Checkpoint evidence: `rescue-friendly` runs a 300 s continuation of the real
fallen-walker save. The flying winch physically grips Sidelight for 90.1 s and
raises its root to y9.45; no controller faults occur. It does not achieve a
supported release or resumed walking. The hook attaches the root-body eyes,
but the folded legs remain under the ordinary recovery program. Holding position
also drifts because the flight target follows an offset attachment point.
Next: hold a fixed hover position after pickup and coordinate ordinary hinge
commands while suspended, then verify actual supported release and new steps.
Prototype: `rescue-flight.lua`; fixture: `rescue-audit.c`; save:
`rescue-before.lua`, all under the evidence root. Nothing is packaged yet.
