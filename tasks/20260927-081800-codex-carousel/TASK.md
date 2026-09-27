# Make the cargo carousel visibly useful and reliable

- STATUS: OPEN
- PRIORITY: 260
- TAGS: game,controllers,cargo

The user sees the carousel stationary and cannot tell what it is for. Inspect
Kaiten and its real cargo supply, reach, grips, phases and receiver. Distinguish
intentional waiting from a broken physical handoff. Give it a useful role in the
cargo chain and readable interaction rather than decorative rotation.

Complete after fresh and previously stalled scenes show repeated physical
pickup→rotation→supported release→downstream collection using its visible Lua
program. Keep ordinary actuators, all unrelated actors, 20 Hz control, save/
restore, real browser rendering and measured populated performance.
Requested September 27; work deadline 12:00 JST (03:00 UTC). Evidence root:
`build/mechanics-20260927/`. Preserve the 07:45 checkpoint while iterating.

Implemented: Nekote discovers a carousel from its observed turntable and
magnet geometry, chooses an inlet away from the depot-facing outlet and seeks
it only while loaded. Neutral transport no longer evades both teams. Mochi
brakes while carried, releases wrong pickups and avoids obstacles en route.
The four-wheel loader retains its counterweight and uses a real steering hinge.

Verified in Dolly wasm64:

- The original carousel stops after its three starter crates because it has
  no continuing supply; it is not a dead controller.
- `mature-v5`: 1,200 s of the actual populated save, 158 objects at end, nine
  additional deliveries, no controller errors/deaths. Nekote grips outside
  crate69 at 8158.150 / releases 8361.883 s; Kaiten grips 8373.550 / releases 8418.783;
  Mochi delivers 8482.200 s. Carousel handoffs 5, feeder jobs 5, porter trips 9.
  This run preserves the old loader chassis and proves the restored chain.
- `porter-supported`: a physical flying rescue rights the actual fallen Mochi;
  it resumes and delivers carousel crate70 at 7694.233 s.
- `loader-yard-4` versus `loader-yard-6`: same controller, five-object clear
  yard, 600 s. Six wheels make no pickup. Four wheels grip 131.317 / release 213.217;
  carousel grips 230.383 / releases 278.367. No increased forces.

Still OPEN: the fresh articulated feeder stalls on crowded pickup routes and
has not completed the full continuing chain. A clear-yard handoff and an older
saved-world chain do not satisfy that criterion. Loaded-bay issue
20260927-074100-codex-loaded-bays remains relevant.

Packaged verification: `build-image-v3.log` passes the image's physical checks.
Chrome and Firefox load the actual 9097 preview with 85 canonical embedded
programs, no errors and clean exit (`local-preview-{chrome,firefox}/proof.json`).
Fresh/restored real-time rendering also passes; other 56 runtime/image assets
and six protected save files are unchanged. See `docs/crash-handoff.md`.

Final packaged-source run `checkpoint-fresh` reaches 2,400 s with 15 world
deliveries and no faults/deaths, but Nekote still has zero placements and Kaiten
only its three starter handoffs. This confirms that the fresh continuing-supply
criterion remains unsatisfied despite the successful restored/clear-yard cases.
Reproduce with `checkpoint-fresh/after.lua`, imported through the game's UI.

Follow-up reproduction `pickup-timeout` keeps the checkpoint image unchanged
and substitutes only Nekote's embedded program in the saved world. Abandoning
an ungripped job after 120 s with a 300 s retry delay changes its target from 73
to 74 to 72 over 300 s, but produces no pickup. No faults/deaths. A deadline alone
is insufficient; routing/approach geometry remains the next problem to solve.
The experimental source is in `pickup-timeout-before.lua`; it is not canonical.
