# Launch magnetic tether rounds from the slingshots

- STATUS: OPEN
- PRIORITY: 290
- TAGS: game,combat,physics

The user intended a magnetic projectile fired by an existing slingshot, with a
rope that ground vehicles can grasp and pull to drag down an enemy aircraft.
The overnight hovering tower is the wrong interaction and reportedly caught a
friendly aircraft. Replace that default approach; verify actual teams and
incidental contacts instead of trusting the target predicate.

Build the chain from ordinary editable parts and generic Lua programs: supply
and load a tether round, sling it, physically attach its magnet to an enemy,
let a ground machine acquire/pull the trailing end, and show the aircraft being
restrained or pulled down. No hidden forces, target-ID exceptions, teleports or
weakened enemies. Preserve friendly release, reload/reuse, save/restore and real
cable forces; explain what each machine is doing visibly in the game.

Complete with actual slingshot→projectile→enemy and ground-grip→rope→aircraft
force evidence in focused and populated runs, repeated operation, no sustained
friendly captures, Chrome/Firefox rendering and a packaged local preview.
Requested September 27; work deadline 12:00 JST (03:00 UTC). Evidence root:
`build/mechanics-20260927/`. Preserve the 07:45 checkpoint while iterating.

Checkpoint evidence: `tether-first` exposes loader alignment against the whole
flexible payload center of mass. `tether-root` aligns the projectile body and
completes the shuttle handoff, but the unbalanced head falls off the receiving
platform; the slingshot fires no shot. Neither trial completes interception.
A balanced five-part head is prepared in `tether-balanced-source.tar` and has
not been run. Resume with `prepare-tether.mjs` and `tether-round.lua`; all files
are under the evidence root. A ground puller is still missing. Source-only
changes add observed part poses, explicit programmable cargo ownership and
96 m winch travel; their compatibility/range/save tests remain due.
