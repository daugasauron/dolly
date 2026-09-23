# Build a larger living world with water, boats and machines

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: game,agent,gpu

The original development window ended 2026-09-15 22:00 JST. The user requested
a stable checkpoint on September 23. The living-world checkpoint is verified,
with the learned world and complete Pi history preserved. Work is on
`work/gpu-shaders`, branch `codex/blockwalker-20260914`; no push, deployment or
merge is authorized. Feature work and autonomous Pi are paused.

## Requirement audit — September 23

| Requirement | Implementation and evidence |
| --- | --- |
| Bigger, varied moving population | Fresh image: 53 objects, 1461 parts, walkers, rovers, cranes, boats and aircraft. `src/blockwalker/designs.json` retains the exact learned controllers. Packaged browser integration verifies movement, zero initial removals and zero model requests. |
| Larger structures and opening bridges | Tidegate has 72 parts; Tidelock has 63. Moving bridge, lift, rotating beacon and separate cargo bodies are exercised by `test/blockwalker-agent-browser.mjs`. |
| Camera travel and a larger world | 512 m sea, islands, docks, towers and a stepped basalt basin. The editor test verifies horizontal/vertical travel, orbit, zoom, named places, saved cameras and under-floor placement. |
| Terrain and shaders | Shared terrain geometry drives collisions, height queries and GPU rendering. Basin resting heights and entrance passage are checked by the C physics checks. `scene.wgsl` implements matte rock, crystal, water and space sky. |
| Space theme and customizable blocks | Dark UI, colored panel/glow/stripe finishes, adjustable materials and anchoring. Editor export/import checks preserve these choices; actual GPU captures are under `build/blockwalker-checkpoint-gallery/`. |
| Visible thrust and more flying things | Thruster commands render animated exhaust. The flyer capture shows Skybarge airborne with exhaust; the integration test verifies hover. The unchanged lander designs have measured takeoff, return and touchdown evidence in `build/blockwalker-landers/proof.json`. |
| Randomness and movement | Seeded route variation exists in the released controllers. Landers selected three measured route offsets each; boats propel and return, and walking bodies advance under ordinary physics. |
| A real two-legged walker | Exact library #62 is bundled as Sidelight IV. Its independent 600.05 s populated-world test verified 41 alternating physical placements, six reversals, zero falls and at most .018311 m stance-centroid motion. `build/blockwalker-patrol-clear-world/` includes poses, contact samples, images and video. |
| C, Box3D and GPU rendering | The one Dollyfile compiles the C game inside Dolly, using fully 3D Box3D physics, raylib UI and WebGPU rendering. Kernel and browser authority are unchanged in this checkpoint. |
| Direct Pi playground and preservation | Embedded Astra/xhigh uses direct game tools and at most three timed GPU images per trial. The recovered 387804845-byte native conversation has 3717 valid entries and retains the complete earlier 385650233-byte prefix. All 78 saved designs survive. |

The packaged image rebuilt inside Dolly in 20.7 s, reusing dependencies.
Image size 231958423 bytes, SHA256
`65e99be9e04e3a0e1741230f1707372ffc381bbcaa7529085ed5ae8851a15735`.
Source tar SHA256
`d3976c3f8c2300fedc8ecbe2d11893fd24b62be5edbbb88657dc44813831f7d3`.
All 15 game source files match the packaged bytes. Executable size 2393894,
SHA256 `af6f4a8bda96cef89773c15c420db860607ab9a85afb6282f450ac8ece20bca7`.
Kernel remains `d39a823c5863d0b1c8508f0d78e61cfe2408144a9ddaa6ecd57919e320718d72`.

Packaged integration and editor suites passed in Chrome 151 on NVIDIA WebGPU,
each under a 4 GiB/no-swap limit: handles 65383 and 80464, terminal 0.
Logs: `build/blockwalker-september-{integration,editor}.log`.
The controller-size and magnetic-load fixes are complete in tasks
[170500](../20260915-170500-codex-01/TASK.md) and
[172000](../20260915-172000-codex-01/TASK.md).
The gallery initially compared decimal JSON against C floats exactly; its
comparison now explicitly uses float32 representation. No game tuning changed.
Final gallery verification passed (41880 terminal 0): all 53 catalog bodies,
controllers and placements matched; all seven views retained 53 objects / 1461
parts with zero removals and no model requests. Simulation ran at real time;
the short shared-host captures measured approximately 40–46 FPS, not an isolated
GPU benchmark. Biped and airborne-thruster captures were visually inspected.
Evidence: `build/blockwalker-checkpoint-gallery/proof.json` and
`build/blockwalker-september-gallery-final.log`.

## Learned state and remaining experiments

The last September 15 save has 51 surviving objects / 1352 parts, 78 designs
and 16 total deaths. Pistonboot #8 and Strideglass #29 fell naturally after the
earlier 53-object checkpoint; their designs and saved removal records remain.
Do not rewind those deaths or silently replace the creatures.

Unchanged patrol #67 remains upright at age 53590.3 simulation seconds (14.9 h).
Its controller records 3713 scored steps, 485 reversals, two aborted transfers
and maximum stance drift .052154 m. These counters do not independently verify
every later step; the 600 s geometry/contact audit remains the stronger walking
measurement. Contact samples are approximately .1 s apart, not every tick.

[Articulated arms and magnetic hands](../20260915-160000-codex-01/TASK.md)
remain a separate experimental extension. #78 fell at 185.1 s and was never
released. All arm variants remain saved. The bounded-patrol/contact and late-fall
investigations retain their original evidence and limits; do not claim general
collision robustness.

## Recovery and local preview

Fresh image: http://127.0.0.1:9099/blockwalker/ (World opens the population).
Owned preview PID 104549 and relay PID 17316 were confirmed running on September
23; recheck before stopping either. Browser PID 440769 was gone and CDP 9231
refused connections. Stale monitor 581575 was stopped after confirming it only
reported a closed browser and retained 2.3 GiB.

Read-only recovery from the owned browser profile preserved the original
`blockwalker-forces` IndexedDB save. Exported files, hashes and USTAR chunks are
under `build/blockwalker-recovery-20260923/`; native history SHA256 is
`42877acd66e131a97f868bcaa959a6ee4b4488ef46f08cefdfebb38f6485a287`.
The full 923-character continuation prompt is present in native history after
the slower resend. Earlier forces/patrol/biped archives remain in
`build/blockwalker-walking/`. Archives exclude credentials.

Recovered session `blockwalker-checkpoint` now opens on the rebuilt image, with
Pi paused. The normal session importer accepted the migrated file; every
archived state hash matches except the intentional `enabled=false` config
change. Actual GPU execution preserved all 51 bodies/controllers, all 78 designs
and removals; patrol #67 advanced to 53592.8 s with up .995721. No HTTP requests
were made. `restored-session-proof.json` and `running-proof.json` in the recovery
directory record this check (73516 terminal 0). The named session belongs to the
owned browser profile, not other browsers visiting the same URL.

Migration used the normal session-file exporter/importer, with an offline
filesystem comparison: all 9586 other paths matched exactly; five build metadata
files changed only verified source/module/recipe hashes. Full session envelopes
containing credentials remain private outside the served tree; their directory
is recorded in `private-migration-directory.txt`. The original
`blockwalker-forces` IndexedDB record remains untouched.

Ordinary upload restoration also passed exact pre-tick world comparison, but
saving that large imported session exceeded 4 GiB, including with explicit
garbage collection and without compression. This remains an OPEN
[memory issue](../20260923-200000-codex-01/TASK.md); successful offline migration
does not fix production save memory usage.

Keep C compilation inside Dolly and one test browser at a time under 4 GiB/no
swap. Never deep-assert binary Buffers; use `.equals()`. Do not inspect terminal
text during GPU mode because that helper synthesizes pointer input.
Read [the crash handoff](../../docs/crash-handoff.md) before browser work.
