# Measure the cost of a larger Blockwalker world

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: game,performance,gpu

The 42-object/1,095-part gallery measured 34–47 FPS while the separate live Pi
world was active. Earlier runs varied between 32 and 57 FPS, so a slowdown's
cause is not established. Measure controller/physics, scene preparation and GPU
submission separately in a guarded browser; compile instrumentation inside Dolly.
Use the result to improve capacity without changing learned physics behavior.
Preserve the live world and Pi history. Temporary profiling stays out of the app.

## Initial profile and rejected upload change

Temporary C instrumentation, compiled inside a separate Dolly browser, measured
1.46–1.53 ms per physics tick for controller/drive work, 2.74–2.84 ms for Box3D,
and about 0.06 ms for samples. Render tree construction took 1.33–1.37 ms/frame;
scene upload calls took 6.1–7.6 ms and the final submission 0.86–1.29 ms. The
upload timing includes waits across the existing GPU broker, not only CPU copies.
Evidence: `build/blockwalker-profile/` and matching browser log.

An old/batched/old replay of the same world reduced GPU requests from about
3.15/frame to 1.08/frame, but all variants remained around 55–57 FPS. The wait
moved from separate uploads into the final combined batch. Do not claim a speedup
or merge this temporary upload change. Sources/results remain under `build/`:
`blockwalker-batched-render.c`, `blockwalker-upload-compare.mjs`, and its output
folder/log. The host GPU provider remains unchanged.

The existing GPU timestamp queries measured only 0.33–0.42 ms for scene rendering.
Separating terrain/population trees increased CPU tree time from about 1.31 to
1.52 ms and GPU time slightly; rejected (`build/blockwalker-tree-compare/`).
Caching transformed bounds alone reduced tree time to about 1.17 ms, a small
saving for the extra storage (`build/blockwalker-bounds-compare/`).

## Selected change and validation

Median partitioning reduced tree construction from **1.314/1.317 ms to 0.474 ms**
per frame in an old/new/cached/old run, with all 42 objects and no removals. The
additional bounds cache reached 0.352 ms but was left out to avoid extra storage
and bookkeeping for the smaller saving. The production change adds ten net C
lines and retains the existing scene data and GPU ABI. GPU execution remained
about 0.38 ms. Evidence: `build/blockwalker-median-compare/` and its log.

An isolated old/new/old run with the owned live game paused measured old 53–54,
new 45–47, then old 45–48 FPS. The CPU saving reproduced (about 1.30 versus
0.45 ms), but end-to-end FPS did not consistently improve. Keep the claim limited
to scene preparation. [Timer wakeup investigation](../20260915-062600-codex-01/TASK.md)
tracks the remaining question; no host scheduling change was made.

Eight frozen GPU captures and complete world-state JSON match byte for byte:
home, basin, harbor, both islands, north ridge, underneath terrain, and overview.
The fixture advances no simulation time, so animated water is comparable.
All binary assertions use boolean Buffer.equals comparisons. Evidence:
`build/blockwalker-frozen/{proof.json,*-frozen-*.png}`, matching browser log.
The guarded editor suite passed builder geometry, camera travel, controls,
materials, capture/export/import and reopen, with no ordinary GPU readbacks.
Evidence: `build/blockwalker-median-editor.log`. C compiled inside Dolly.

The growing history exceeded Playwright's 256 MiB WebSocket message limit during
the final backup. The browser and Wasm filesystem stayed alive. Replacing one
large CDP result with 8 MiB binary chunks successfully saved **274,387,780 bytes**
of native history, including the exact earlier 235,645,401-byte basin prefix.
The monitor fix is `build/blockwalker-performance-monitor.mjs`; the old monolithic
monitor is stopped and must not be restarted. The saved archive has 47 objects,
1,214 parts, six historical removals and complete conversation. See the broad
world task for current recovery files and services.

The new binary compiled inside the live Dolly filesystem in 1.535 s and passed
native checks in 5.361 s. Full world and native-history hashes matched across the
update (`performance-updated-proof.json`). Pi resumed Astra/xhigh requests and
successful tool calls; at 21:33:36 UTC the world reached 49 objects/1,281 parts,
with no new removals. Its 279,433,079-byte history retains the exact complete
274,387,780-byte pre-update prefix. A native compaction entry and subsequent
assistant/tool messages were appended without truncating history. The guarded
image build and editor/frozen checks passed; end-to-end FPS improvement remains
unproven. This profiling task is complete; timer measurements remain separate.
