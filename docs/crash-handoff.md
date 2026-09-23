# Host freeze handoff — 2026-09-15

Work in `/home/daug/dev/dolly/work/gpu-shaders`, on
`codex/blockwalker-playground-20260923`; the earlier `codex/blockwalker-retro-20260923`
and `codex/blockwalker-20260914` checkpoints remain preserved. The ongoing
[playground task](../tasks/20260923-213000-codex-01/TASK.md) records driving, Eyes,
turntables, cargo deliveries and social navigation. The [retro reconciliation](../tasks/20260923-211500-codex-02/TASK.md)
records the current image and checks. Preserve the live world and full Pi conversation.
Current work, recovery archives and owned service processes are recorded in
[tasks/20260914-blockwalker-space-world/TASK.md](../tasks/20260914-blockwalker-space-world/TASK.md).
Recheck processes before stopping anything; other worktrees and previews belong
to other agents.

The 9099 preview has 49 objects: Tidegate is archived, five lookouts roam the
yard/islands, a hydraulic porter delivers crates, three small skiffs explore the
coasts, and Harbor Atlas salvages floating cargo. A low-flying courier pushed an
eastern lookout off the island in the first longer trial. Postbird now climbs
clear of predicted ground traffic. The corrected seed-42 population passed 1800
simulation seconds with nine reloads: all 45 alive, five deliveries, 117 biped
steps, zero aborts and zero external biped contacts. The packaged driving/cargo
check includes a short physical overflight regression. Save and focus-view
browser checks passed, including actual 9099 refreshes and failed-save retention.

An alternate route seed passed 1080 s with all 45 objects and five deliveries.
Inspecting activity also found Northline holding a tilted crate indefinitely.
It now senses contact support under the attached cargo: the stuck-state replay
resumed within 0.417 s, and a fresh 600 s run completed 40 transfers across a
restart. This fix is packaged on 9099; driving and embedded exact-restore checks
passed. See the closed [gantry issue](../tasks/20260924-030000-codex-01/TASK.md).

Tsubame, a 19-part harbor tug, now tows floating crates to Harbor Atlas for
physical handoffs. Its isolated trial delivered three; the full 49-object world
survived 600 s and three reloads, with two handoffs and seven total deliveries.
Twinspire initially pushed the third crate beyond the tug's search area. Its
route avoidance now includes loose cargo: the full 600 s replay retained all 49
objects and completed all three tug handoffs, with eight total deliveries.
Cargo beneath piers now stays buoyant, with deck/roof support and actual
burial still checked. See the closed [water issue](../tasks/20260924-035500-codex-01/TASK.md).
The packaged integration and actual 9099 preview checks passed; six view samples
measured 50.57–52.35 FPS locally. Evidence: `build/blockwalker-tug-{integration1,preview1}.log`.

All 34 characters now have Eyes using existing blocks, with no added parts.
Click a character and press Backslash to ride along while its program continues;
WASD leaves the view. The packaged browser check verified actual block-relative
poses for the biped, lookout and tug, camera switching and the no-Eyes fallback.
Driving/cargo regression also passed. Evidence:
`build/blockwalker-spectator-{packaged1,driver1}.log` and
`build/blockwalker-tug-cargo-avoidance-42/result.json`.
The current image also shows magnet/cargo status in the sidebar and focus HUD,
with a player delivery confirmation. Source and actual-9099 keyboard playtests
completed pickup, transport and scoring; the original learned session is unchanged.
See `build/blockwalker-cargo-ui-packaged.log` and `build/blockwalker-playtest/`.

A longer 49-object run found Skybarge hitting the quarry at 987.62 s. The exact
replay identifies terrain contact, not another creature. Its controller now uses
nearby ground samples to climb earlier; the short replay and isolated crossing
pass without contacts. The fresh population passed 1200 s and six reloads, with
all 49 objects and eight deliveries. The corrected image is served on 9099;
fresh-catalog, follow and Eyes checks passed there. The closed
[aircraft issue](../tasks/20260924-051500-codex-01/TASK.md) records the replay,
regression, longer run and package hashes.

Activity checks also caught Marrowstep remaining upright but stuck in a lift.
It now plants all four feet before retrying a blocked phase. Both captured stalls,
a short regression and a fresh 1200 s run passed; all 49 objects and eight cargo
deliveries survive, with continued physical foot placements. The corrected image
is served on 9099 and passed driving, pickup, follow and Eyes checks. See the
closed [walker issue](../tasks/20260924-054500-codex-01/TASK.md).

The visible browser Save button keeps the latest written checkpoint and links
to named sessions. Manual/programmed design and complete world import/export
remain available. Recovery-world import preserved all 51 creatures and 78
programs from the original learned session; its archive is unchanged. Streaming
capture now saves that complete history. Closing/reopening the copied session
restores all archived file hashes except the intentional Pi pause setting,
verified with in-Dolly hashing before game entry, then resumes the 51-object
world. Peak test-tree memory was 3.09 GiB. Immediate same-tab refresh still exceeds the 4 GiB
bound during boot, so the [memory issue](../tasks/20260923-200000-codex-01/TASK.md)
remains open. Do not begin the separate Lua/YAML migration here.

The two earlier desktop freezes most likely involved host RAM exhaustion while
Node 22 formatted a failed PNG assertion. That mechanism was reproduced, but
memory measurements from the original freezes were lost, so their attribution
remains an inference. No GPU driver or hardware fault was established.

Animated water made an identical-PNG camera assertion invalid. Passing those
large Buffers to `assert.deepEqual` triggered an enormous Myers diff; a bounded
CPU reproduction exhausted 256 MiB in 0.23 seconds. A V8 heap limit alone did not
contain these allocations. The boolean comparison failed normally in 0.235 ms
with 46,976 KiB peak RSS.

The fix is verified: binary comparisons use `assert.ok(actual.equals(expected))`,
and camera checks inspect actual C coordinates independently of animation.
The focused editor and physics/browser integration suites have passed repeatedly
under a 4 GiB/no-swap limit covering the complete test process tree. Keep this
command pattern, with only one test browser at a time:

```sh
systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0 \
  timeout --signal=TERM --kill-after=5s 180s \
  xvfb-run -a node test/blockwalker-browser.mjs
```

This contains host memory usage, not GPU-driver faults. Never deep-assert large
binary data or rerun the unsafe OOM reproduction without a cgroup limit. The
closed [crash issue](../tasks/20260915-004300-codex-01/TASK.md) retains the timeline,
measurements and verification. Original artifacts remain in
`/home/daug/.cache/dolly-crash-20260915/`.
