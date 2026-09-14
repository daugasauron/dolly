# Host freeze handoff — 2026-09-15

Resume in `/home/daug/dev/dolly/work/gpu-shaders`, currently on
`codex/blockwalker-20260914`. Preserve the existing uncommitted Blockwalker
work. Read this before rerunning `test/blockwalker-browser.mjs`.

Follow-up, 00:50 JST: camera checks now use the existing C state through an
uploaded userspace fixture. The focused editor test passed under the proposed
4 GiB/no-swap process-tree limit in 38 seconds. The issue is closed with evidence;
the investigation notes below describe the original failure and mitigation.

## Diagnosis

The user experienced two unresponsive desktops and manually restarted both.
The leading explanation is host RAM exhaustion in Node v22.22.2 while
formatting a failed screenshot assertion. This failure mechanism is reproduced;
the original processes' memory usage was not captured, so attribution of the
two hangs remains an inference. No GPU driver or hardware fault was established.

The editor test launched at 00:00:34 and 00:32:43 JST before the respective
hangs. The second run's last screenshot was `world-camera.png` at 00:33:07.
Its next check requires identical PNG bytes after switching world → builder →
world. New water animation advances with `world.age`, including while in the
builder, so unchanged camera coordinates no longer imply identical pixels.
The prompt-focus and Home checks have the same problem.

On failure, `assert.deepEqual` imported from `node:assert/strict` expands PNG
Buffers into hundreds of thousands of lines and constructs a Myers diff that
retains large typed arrays. Comparing two saved PNGs without any GPU work hit
a 256 MiB cgroup limit in 0.23 seconds. A 128 MiB V8 heap limit did not contain
these allocations. The boolean Buffer comparison failed normally in 0.235 ms
with 46,976 KiB peak RSS.

## Changes already made

- `test/blockwalker-browser.mjs`: screenshot assertions now use
  `assert.ok(actual.equals(expected), message)` or its negation. Keep this
  mitigation: do not feed large binary values to deep assertion error diffs.
- [Open issue](../tasks/20260915-004300-codex-01/TASK.md): timeline, reproduction,
  upstream references, validation and completion criteria.
- This handoff. No commit, image rebuild, driver or system setting change.

`node --check test/blockwalker-browser.mjs` and the targeted `git diff --check`
passed. The equivalent failure path passed the bounded CPU probe. The full
browser test has **not** been rerun and the animation-sensitive checks are
**not fixed**; they should now fail with a short assertion error.

## Continue here

1. Make world-camera checks independent of animation while retaining coverage
   for movement, view-switch persistence, prompt focus and Home reset. Inspect
   existing state/observation facilities before adding test hooks. Static
   builder screenshots can still use bounded byte comparisons.
2. Run the focused browser test once under a memory limit covering its entire
   process tree, for example from this worktree:

   ```sh
   systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0 \
     timeout --signal=TERM --kill-after=5s 180s \
     xvfb-run -a node test/blockwalker-browser.mjs
   ```

   This is a proposed guarded verification command, not a completed run.
   It limits host memory; it does not isolate GPU-driver failures.
3. Record the browser result in the issue and close it only after verification.

At 00:43 JST, the main session's preview on 9099, relay on 9010 and
`build/blockwalker-water-live.mjs` were running. The editor test was absent.
Recheck current processes; the investigation did not stop these services or
modify the live browser profile. Avoid overlapping additional test runs.

Original logs, pre-mitigation source copies, PNGs, the reproduction and measured
results are in `/home/daug/.cache/dolly-crash-20260915/`. The saved PNG pair is
an analogous mismatch, not the exact operands lost during the hangs. Do not
rerun `assert-repro.cjs unsafe` without a cgroup limit. The controlled OOM at
00:40:14 JST belongs to `pc-crash-assert-probe.scope`, not either original hang.
