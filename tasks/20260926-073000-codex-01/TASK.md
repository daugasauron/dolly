# Improve populated-world frame rate without changing physics

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: game,performance

The user reports the current local game is starting to lag. Profile the deployed
image42 with the populated134-object saved world and distinguish controller/
sensor work, physics solving, post-step bookkeeping and rendering. Keep60Hz
physics, eight solver substeps, character programs and gameplay behavior intact.

Profile inputs: `build/blockwalker-performance-20260926/{profile-source.tar,
check.mjs,browser.mjs}`. C instrumentation is temporary and compiled inside Dolly;
compare the uninstrumented executable to quantify its effect on timing.

Existing pre-image39 measurements put most CPU time in controller/sensor work.
Every controller currently receives eager arrays for all sensor fields, including
ones it never reads. A source-usage count is only a lead, not runtime evidence.
Any sensor optimization must preserve saved programs, mutable per-call snapshots,
retained sensor values, physics results and bounded controller execution.

Complete after measured browser improvement on matched worlds, equivalent
simulation/save behavior and Chrome/Firefox rendering. Do not remove actors,
reduce physics quality or replace real gameplay with an easier benchmark.

Latest134-object Firefox sample reproduces18.56FPS with15.03s simulation in15.09s
wall time. Instrumentation lowers it to14.86FPS, so its absolute FPS is not a
production measurement. Of the measured15.18s frame work, controller/actuator
phase takes10.94s, Box3D2.54s, post-step0.53s and rendering0.75s.
`build/blockwalker-performance-20260926/firefox/` retains the matched sample.
The first lazy-environment prototype snapshots nearby native terrain boxes and
materializes groundSamples/obstacles/terrain on access; it is unbundled.

The revised implementation preserves shared terrain/obstacle entries, mutable
arrays, assignment/deletion, repeated frozen reads, and retained readings across
terrain changes. The native snapshot is owned by the controller's QuickJS heap;
it contains copied values, with no pointer into a later physics world.
The actual in-Dolly comparison passes: all sensor values for134 actors match,
retained snapshots still match after30s of simulation and a terrain-version
change, and720 sampled locations across all five terrain versions match. Both
executables produce identical complete world saves after1800 steps, including
poses, velocities and controller memories. Evidence:
`build/blockwalker-performance-20260926/equivalence-chrome/proof.json`.
The durable snapshot/alias checks are in `test/fixtures/blockwalker-controllers.c`.

Repeated Firefox order stock/candidate/candidate/stock gives10.96/11.11/13.75/
10.18FPS, a17.6% average increase. All runs retain134 actors, with no errors or
deaths. Host load varies: the earlier10.35→36.19 sample is not the performance
claim. Evidence: `build/blockwalker-performance-20260926/paired-firefox/`.

The user also requested a visible FPS display. Move it from the bottom status
line to a compact badge in the game view, visible with panels, in focus mode and
with the Pi panel open. Reuse the existing one-second frame counter.

Chrome's repeated order gives28.06/29.47/29.89/28.31FPS, a5.3% average increase.
All134 actors remain with no errors/deaths; physics still advances at60Hz.
Evidence: `build/blockwalker-performance-20260926/paired-chrome/`.
These are modest measured improvements, not a claim that all frame-rate issues
are resolved. Controller/sensor work remains the main profiling lead.

Packaged and served locally as image43. The51.5s in-Dolly build reuses the runtime
and12 dependencies. Chrome and Firefox pass111 bundled design/program comparisons
and seven world restorations, including format1 and active magnet attachments,
with no new errors/deaths/model requests. FPS screenshots inspected in normal,
focus and focus-with-Pi layouts. Evidence:
`build/blockwalker-image43-preview{,-firefox}/proof.json` and `fps-*.png`.
All22 archived sources match canonical files, served artifact hashes match,
six protected save/history files and39 other image snapshots are unchanged;
all40 recipe lint checks pass. `build/blockwalker-image43-artifacts.json`.
