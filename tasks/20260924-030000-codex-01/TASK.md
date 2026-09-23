# Keep Northline transferring cargo after a tilted pickup

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: game,physics,controller

The 1800-second seed-42 population trial kept every object alive but Northline
stopped transferring cargo. Its controller remained in lowering phase 3 from
558.67 s through 1800 s, holding crate 27. The magnet ended 1.827 m above the
ridge; release requires a fixed height below 1.65 m. The crate is tilted
(uprightness 0.808). Surviving is not sufficient evidence of continued activity.

Replay `build/blockwalker-air-traffic-long-42/10-blockwalker-world.json` with
the in-Dolly probe `build/blockwalker-northline.{c,mjs}`. Measure piston position,
rate, magnet load and the crate's actual support before changing the controller.
Preserve the mechanism and physical pickup; do not snap the crate into position.

Completion requires the stuck saved state to release and resume transfers,
plus a fresh run across repeated pickups and save/reload. Retain the user's
learned world and verify within the existing 4 GiB/no-swap browser limit.

The 120-second replay measured piston extension fixed at 1.16 m, magnet height
1.827 m, and 15.01–15.75 N of ground support under the tilted crate. The old
controller never released. The candidate uses `magnets[].targetSupportForce`
and piston rate instead of its fixed height threshold: release at 1800.417 s,
nine set-downs, 5.802 m traversal range, all 45 objects retained. CSVs, saved
worlds and comparison are in `build/blockwalker-northline-proof/`; logs are
`build/blockwalker-northline-{baseline,candidate1}.log` (both exit 0).

The support reading is derived from actual Box3D contacts in C, uses the existing
last-substep force convention, and excludes the target's own assembly. It lives
only in live physics sensors; transient contact data is not added to world saves.
The fresh 600-second regression completed 40 set-downs across a restart, with
3357 airborne and 469 supported samples. Driving, Eyes, tilted turntable, cargo
scoring and courier-clearance checks also passed in
`build/blockwalker-gantry-driver2.log` (exit 0).

The embedded fixture uses ballast cargo within the magnet's lifting capacity:
6.456 N of support while captured on the floor, zero during lift, cargo raised to
1.992 m and released to 0.485 m. A light crate already hovers slightly after
capture and cannot prove grounded support. Final embedded contact-force,
buoyancy, controller-containment and exact pre-tick restore checks passed in
`build/blockwalker-gantry-integration2.log` (exit 0).

Packaged locally in 23.6 s using the unchanged runtime:
232123849 bytes, SHA-256
`428c9b2e84af3213bd10df32616684d5409f6792214babe4a8b592c0b6dd2160`.
The 9099 preview serves the matching metadata. The original learned session is
unchanged; updating a catalog program does not overwrite existing saved programs.
