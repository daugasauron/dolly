# Brake airborne cargo before landing

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: game,content,bug

The team courier could descend faster than7m/s and strike its load against the
landing area. Contact replay shows no projectile hit before the first upset.
Restoration changes later contact outcomes: one run wrecks, another eventually
drops cargo outside the depot. This is a fragile landing controller, not a
claim that every original landing fails.

Both team couriers now use a bounded vertical-speed target before acceleration,
with their existing one-way thrusters, forces and horizontal attitude control.
Exact210→450s replay changes only59: baseline also delivers, but reaches9.519m/s
downward; candidate maximum descent2.576m/s, minimumup.979090 and two deliveries
(101/80). Original actors/other programs and blueprints stay. Evidence:
`build/slopyard-compound-regressions-chrome-courier-descent/salvage/`.

Fresh1500s combined run ends with both couriers upright; East makes6 deliveries,
West3, and both slingshots fire5 times. West subsequently waits above an occupied
pickup; that existing traffic-wait behavior is tracked separately in195200.

Packaged in image37. Chrome/Firefox match all98 catalog programs/blueprints
and restore old plus loaded worlds; see `docs/crash-handoff.md` for evidence.
