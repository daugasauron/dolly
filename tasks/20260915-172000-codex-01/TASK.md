# Restore magnetic load feedback with the saved attachment

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: game,physics,persistence

A live-world reload preserved every pose, controller, attachment and power,
but reset three saved magnet loads to zero: Dockhand 6.15865 N, Loadrunner
4.91307 N and Postbird 4.05871 N. Their next controller call runs before the
next physics update, so it receives a false unloaded reading.

Restore finite load feedback along with a valid saved attachment, bounded by
the magnet's powered force limit. Older saves without load should remain valid.
Verify the exact pre-reload world and include load equality in the browser
save/reopen regression. Evidence: `build/blockwalker-walking/source-limit-`
`{before-world,after-world,world-differences}.json`.

Implemented and compiled inside the owned sandbox. Restoring the exact original
save and reopening now preserves the complete world with all three load values.
The permanent `test/fixtures/blockwalker-reopen.mjs` passed against all 53 live
objects and 78 designs (54029 terminal 0); it compares every saved creature,
design, removal and installed controller before any physics tick. The normal
agent browser suite now runs that same regression before continuing its crane
simulation. Named-session backup also preserves the modified executable and
complete Pi history; see `source-limit-build.json`.

Full browser integration with the current C and permanent restart fixture
passed (47864 terminal 0, 4 GiB/no swap). It exercised magnetic cargo, buoyancy,
hover feedback, controller timeout and exact pre-tick restoration.

Packaged and reverified on 2026-09-23 in image SHA256
`65e99be9e04e3a0e1741230f1707372ffc381bbcaa7529085ed5ae8851a15735`.
The fresh packaged browser suite passed exact pre-tick world restoration and
then continued carrying the saved crane load. Log:
`build/blockwalker-september-integration.log`, handle 65383 terminal 0.
