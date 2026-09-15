# Build a larger living world with water, boats and machines

- STATUS: OPEN
- PRIORITY: 300
- TAGS: game,agent,gpu

Continue development until 2026-09-15 22:00 JST. Extend the existing embedded
Pi playground on `codex/blockwalker-20260914`; preserve its learned controllers,
conversation and saved world. Keep the game in C, built inside its one Dollyfile.

Add camera travel, larger terrain, water and physically floating boats. Support
anchored constructions such as cranes and opening bridges alongside larger
walkers, wheeled machines and flying creatures. Give the world a space theme,
dark GUI, visible thrust flames and customizable block designs/effects. Populate
it with varied, moving creations, including randomized feedback controllers.
Use the actual Astra/xhigh Pi agent and timed GPU framebuffer observations.

Verify real browser controls, physics and persistence. Measure boat floatation,
propulsion and steering; anchored mechanisms; controlled flight; and performance
with a populated world. Record evidence here before closing.

## Current checkpoint — 2026-09-15 16:56 JST

Work only in `/home/daug/dev/dolly/work/gpu-shaders`, branch
`codex/blockwalker-20260914`. Continue until22:00 JST (13:00 UTC).
No push/deploy/merge authorization. The latest priority is a real two-legged
walker; next work adds articulated arms, then magnetic hands.

The packaged image retains all53 catalog objects/1461 parts, including exact
Pi library#62 as **Sidelight IV - patrolling biped**. It now adds verified
`supportForce` and `selfContactForce` controller sensors. These estimate normal
forces in the final1/480 s solver substep, not a full-tick average. See the
[closed sensor issue](../20260915-163200-codex-01/TASK.md) for semantics, weight
checks, overhead and source. No physics parameters or browser authority changed.
The matched sensor benchmark produced byte-identical complete saved worlds;
added cost was .1207 ms across all53 characters at the same physics state.

C compiled inside Dolly; the image build reused dependencies and took20.7 s.
Snapshot231956389 bytes, SHA
`d43f7c3247c94951db7295ec558255feb9108cf1e142a4110b9bd9efeb08b3a3`;
source tar597504 bytes, SHA
`0caf048a0f61d33c36bdc5cd1c6493a4f3a06f33b74d465cdcad9d8703c32721`.
Kernel unchanged:
`d39a823c5863d0b1c8508f0d78e61cfe2408144a9ddaa6ecd57919e320718d72`.
Fresh packaged checks preserved53 objects, all bundled sources, the exact biped,
zero removals and zero model requests; all force checks passed again.
Evidence: `build/blockwalker-forces-packaged/`. Build80400, focused force
check10704, matched benchmark72984 and packaged check61037 are terminal0.
No ephemeral test/build browser remains.

### Walking and arm experiments

Verified#62 completed600.05 s in the populated world:41 alternating physical
placements, six reversals, no aborts/deaths, minimum up .985948 and maximum
support-centroid movement .018311 m. Every placement had signed airborne
advance above .4125 m with opposite-foot support. Root Z range[-1.9644,2.0762] m.
Evidence: `build/blockwalker-patrol-clear-world/`, including three GPU frames
and30 s video `patrol-world.webm`. Contacts were sampled about .1 s, not every
tick. Its raw Box3D `totalNormalImpulse` values establish contact but are solver
accumulators, not net momentum change; the force investigation clarified this.

The unchanged live#67, spawned at(55,-85), seed6701, reached4452.4 s (74.2 min)
at the migration checkpoint: upright,308 controller-scored steps,41 reversals,
zero aborts. These later counters are not an independent audit of every step.
All52 older live objects,76 saved designs and14 removal records remain.

The [arms task](../20260915-160000-codex-01/TASK.md) is OPEN. Hanging-arm#72
survived300 s but slipped excessively; a90 s independent C diagnostic confirmed
hand/hip interference. Raised/staggered#73 fell at131.517 s. Symmetric shoulder
spacers gave37 parts/16 joints: standing#74 passed, walking#75 fell at230.35 s,
and supporting-hip attitude feedback#76 fell at81.25 s. Every body/source/result
is saved under `build/blockwalker-arms-*`; none has been released or promoted.
Actual Pi resumed the planned quiet-arm comparison based on#75, with passive
force and geometric diagnostics. Continue that experiment and then tune balance.

The prepared300 s independent helpers `blockwalker-arms-{browser,check,reopen}.mjs`
and `blockwalker-arms-analysis.py` have NOT run. They require an exact normalized
successful seed in `blockwalker-arms-current-seed.json` (parts must be an array).
Original foot indices10..15/23..28 must remain for this analysis. Their staging
source was updated to the new force-enabled C build plus contact diagnostics:
`build/blockwalker-arms-source.tar`,601088 bytes,
SHA`ed44664bcd221a6089e36a54a88dc4f3dc48d076fb7e7f35ab12393e48e55610`.
Do not use the old reserved-source tar for controllers that read new sensors.
Inspect each candidate's source/body and diagnostics before using this harness.

The [bounds/contact issue](../20260915-153500-codex-01/TASK.md) remains OPEN:
library#64 privately passed300 s but exceeded the requested bound at+1.6307 m
in600 s;#65 and reshaped-foot#69 were worse. The independent#64 run had41
placements/seven reversals and no falls; its failure was not waived.
Straight live#64/#65/#66 fell naturally after144.07/77.54/32.34 min. #64 reached
the sea; the initiating causes for#65/#66 remain unknown. Keep their designs and
removal records; see the [late-fall issue](../20260915-110000-codex-01/TASK.md).

### Live session and recovery

The live session is now **blockwalker-forces**, at
`http://127.0.0.1:9099/session/blockwalker-forces`. The ordinary fresh image is
`http://127.0.0.1:9099/blockwalker/`. Named sessions are browser-profile local;
another browser cannot load one just from its URL. Older blockwalker-patrol and
blockwalker-bipeds sessions remain. Restore75530 and verifier87245 are terminal0:
every archived workspace hash, new packaged C/agent/catalog source and session
compatibility matched. Real Astra/xhigh requests resumed at07:53:38 UTC.
Pi received the948-character `forces-continuation-prompt.txt` through the normal
prompt box. Use the new forces continuation verifier, not older prompt checks.
`forces-continuation-proof.json` verifies the entire384715559-byte prefix in
the384966544-byte post-resume history, all53 creatures/76 designs, real
Astra/xhigh requests and the complete prompt. At the07:57 export live#67 was
upright at4692.517 s,325 scored steps,43 reversals and no aborts.

Recheck PIDs before stopping anything; other previews/worktrees belong to others.
Preview104549: `node scripts/serve-gpu.mjs 9099 blockwalker`.
Relay17316: port9010; allows origins9099 and19199.
Owned browser440769: CDP9231, DISPLAY=:1, persistent profile
`.cache/blockwalker-browser-20260915`. Runner `build/blockwalker-bipeds-live.mjs`
now uses blockwalker-forces in BOTH its restart URL and expected session name.
Monitor561617: `blockwalker-forces-monitor.mjs --watch`, exec90281 intentionally
active. Prior monitors519049/497976 are stopped. It exports full native history
in8 MiB chunks and immutable five-minute world snapshots under `world-snapshots/`.
Stop the watch monitor before a manual export; both use the same scratch buffer.

Latest full archive: `build/blockwalker-walking/forces-state.tar`,388003840 bytes;
gzip285593240 bytes, six48 MiB `forces-state-XX.part` files. It contains53 live
objects/1390 parts,76 designs and14 removals at world54155.383337297826, plus
384715559 bytes/2155 entries of native Pi history. Entire pre-pause prefix matched:
SHA`c4b82504ce037eea7e334f8a62eabd899bc63418d9d181513f73209e555a54cd`.
Manifest `forces-restore-proof.json`; helpers `blockwalker-forces-*.mjs/.py`.
Archives exclude models/auth. Private relay file remains
`/tmp/dolly-codex-relay-Bez6Lp/models.json`; never print or commit it.
Reassemble through normal Dolly uploads:
`cat /tmp/PARTS... | gzip -dc - | tar -xf - -C /workspace`.
Use explicit gzip stdin `-`; never truncate history or bypass uploads.

Mirrors, progress and screenshots: `build/blockwalker-walking/`.
Status: `python3 build/blockwalker-biped-status.py`. Older patrol-state,
bipeds-state, biped-checkpoint-state and endurance-state archives remain.
Old image files are in `build/blockwalker-pre-forces-package/` and
`build/blockwalker-pre-patrol-package/`.

Scripts importing relatives through build need
`node --preserve-symlinks-main build/NAME.mjs`. Resume only after GPU is active
AND frames pass the pre-start counter. Pi may take minutes to read the complete
native history. Ensure its panel is visibly open before typing. Never add a
global download handler alongside explicit consumers; that previously killed
this browser. Save the named session before downloading verification files.

One ephemeral browser at a time, entire process tree under4 GiB/no swap:
`systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0 timeout --signal=TERM --kill-after=5s 180s xvfb-run -a node test/blockwalker-browser.mjs`.
Do not call visibleTerminalText during GPU mode: it synthesizes pointer events.
Use screenshots. Never deep-assert image/binary Buffers; use `.equals()` boolean.
Keep60 Hz physics;120 Hz regressed boats. No host C compilation or new authority.
Read [crash handoff](../../docs/crash-handoff.md). An earlier desktop-freeze
interval was lost; later migrations preserve all provided history. No GPU/driver
fault was established. Older narratives remain in repository history.
