# Blockwalker handoff

Work only in `/home/daug/dev/dolly/work/gpu-shaders`, branch
`codex/blockwalker-playground-20260923`. Do not modify the parent worktree or
other agents' previews. The latest user requested a stable checkpoint and local
launch; feature development is stopped. No push or deployment is authorized.

The [September 25 checkpoint](../tasks/20260925-064800-codex-01/TASK.md) packages
91 placements: the original 70, red/blue rival and guard vehicles, warehouse
handlers, a quarry runner and two cores, and two cargo-slinger crews. Cargo and
fallen machines remain physical. All behavior is visible ordinary character
programs using common sensors, actuator keys and radio. No per-character engine
motion helpers. Physics stays at 60 Hz; the later experimental controller rates
and observation caches are excluded.

Image 28 is served at `http://127.0.0.1:9099/blockwalker/` by user service
`dolly-blockwalker-preview-20260924.service`. The owned relay listens on 9010.
The image is 232579323 bytes, SHA-256
`7e751b852bf0b121c4f0ad57f7a6d9206177a44a32f38078bb56b483704a7f58`.
Its source archive SHA-256 is
`175799137f2a148854b34fc739fa5e6b69a3a6e2e264f5a01778a8ec70bb146a`.
The checkpoint task records browser launch/save-restore verification. Existing
saved worlds retain their own programs and terrain; loading a save does not
silently replace them with the fresh catalog.

The fresh 2400 s `build/blockwalker-rivalry-checkpoint42/` run retains 122
objects with 33 unique deliveries and no controller errors. Both quarry cores
complete runner-to-courier handoffs, and raiders tip and recover. Its final
warehouse assertion fails (East 1 / West 2), so do not call it a full pass.
`checkpoint-proof.json` records retention, credit and physical cargo-owner chains.

The final warehouse programs steer using the actual magnet pole, try alternate
pickup routes and avoid previously stored pallets. Kawasemi's flight gains
settle its pickup. A replay of the exact failed world stores all four delivered
heavy loads and delivers Kawasemi's waiting crate:
`build/blockwalker-forklift-pole-pickup/`.
The ore hauler now powers its magnet within sensed cargo bounds, using the
unchanged physical capture query, and rejects the wrong attached target.
`build/blockwalker-forklift-foundry-contact/` continues to 2760 simulated seconds,
125 objects and 37 deliveries. The fifth heavy load reaches the quay; all four
previous heavy deliveries remain stored. All four corrected programs are in the
packaged catalog. This proves saved-failure recovery, not fresh endurance.

Chrome and Firefox builder/world controls pass, including one-way jets,
blocked-nozzle edits, camera shortcuts, following, source export and hiding UI.
Evidence: `build/blockwalker-thruster-ui-{chrome,firefox}/` and
`build/blockwalker-world-ui-{chrome,firefox}/`.
One-way migration preserves original poses, programs, memory and magnets and
backs up the old world; see the [thruster task](../tasks/20260925-035000-codex-01/TASK.md).
The [cargo slinger](../tasks/20260925-032000-codex-01/TASK.md) physically reloads
and hits moving aircraft with ordinary light crates. Aircraft can recover, and
loads can slip; there is no guaranteed shootdown. Existing bearings suffice.
[Rope/winch links](../tasks/20260925-041500-codex-01/TASK.md) remain separate.

Outstanding work:

- Repeat a fresh uninterrupted cargo run with the final programs. The
  [warehouse](../tasks/20260924-220500-codex-01/TASK.md) and
  [freight](../tasks/20260924-144000-codex-01/TASK.md) issues stay open.
- [Crowded Firefox performance](../tasks/20260925-010000-codex-01/TASK.md) remains
  below target: 14.66 warm FPS with 125 objects; Chrome views reach 22.65–26.48.
  CPU simulation dominates, with GPU work about 0.35 ms/frame. A transport-rate
  experiment reaches 24.51 warm FPS but lacks complete cargo/flight validation
  and is not bundled. Do not quote older 103-object results for this population.
- Lua/YAML migration, ropes, existing walker limitations and the large-session
  refresh issue are separate tasks, not completed by this checkpoint.

The [overnight issue](../tasks/20260924-211600-codex-01/TASK.md) links feature
and verification tasks. Local experiment artifacts under `build/` are not the
packaged catalog automatically. To rebuild, use `node scripts/prepare-blockwalker.mjs`
and `npm run image -- blockwalker`; restart only the owned preview service.

Preserve `.cache/blockwalker-browser-20260915` and
`build/blockwalker-recovery-20260923/`. The complete native Pi history must not
be truncated. `build/blockwalker-checkpoint-preservation.mjs` checks all six
protected files (392379755 bytes) and the other twelve image entries. The
[large-session task](../tasks/20260923-200000-codex-01/TASK.md) records the
remaining same-tab refresh problem. Recheck ownership before stopping processes.

Compile C inside Dolly. Run one disposable browser tree at a time under
`systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0`, with a bounded
`timeout`. Use `DISPLAY=:1` for Firefox and Xvfb for Chrome. Scripts under the
symlinked `build/` directory need Node's `--preserve-symlinks-main`. Upload USTAR
archives. Never request terminal screenshots while the game owns the GPU.
Do not deep-assert large buffers; use `assert.ok(actual.equals(expected))`.
Animated water invalidates whole-frame equality for camera checks.
