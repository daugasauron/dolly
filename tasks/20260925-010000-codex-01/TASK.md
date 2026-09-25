# Keep the crowded world responsive in Firefox

- STATUS: OPEN
- PRIORITY: 220
- TAGS: game,performance,browser

The 600 s rivalry save has 91 objects, including six new wheeled rivals and
retained cargo. Chrome renders it at 51.83 FPS; Firefox repeats at 13.99 and
11.68 FPS while simulation remains close to real time. Evidence is under
`build/blockwalker-rivalry-view-{chrome,firefox}-crowded/` and Firefox's
`-rivalry-profile/` variant. GPU packet processing occupies less than one
second of the 37 s profiled view; CPU simulation dominates.

A fixed 1800-tick Firefox replay takes 29.97 s: 18.61 s processing controllers,
10.31 s solving physics, plus cargo and sampling. Sampled detail identifies
observation construction as the largest controller cost. Sharing calculated
neighbor geometry within a tick preserves the exact saved world but provides
no demonstrated speedup (31.14 s); do not add that experimental cache to the
engine. Evidence: `build/blockwalker-geometry-firefox-{rivalry-profile,
geometry-profile,detail-profile}/`.

Changing only the six new wheeled programs to 20 Hz gives 16.97 FPS in the
rendered repeat. Their long-run interaction still needs verification. Check
appropriate control rates for stationary machinery next; every controller must
remain an ordinary visible program using the same sensors and actuators.
Preserve the 60 Hz physics step, all bodies, and useful observations. Do not
remove content or silently stop programs to improve the measurement.

Verify a sustained improvement (target at least 30 FPS) on the same crowded
save in Firefox, and repeat the actual cargo/fight/recovery workload at the
chosen rates. Keep Chrome and the original population working. All experiments
are source-only and compiled inside Dolly; the served image is still image 27.

The next rendered candidate uses 20 Hz for the six rivals and the ten previously
60 Hz stationary machines. On the same saved population, Firefox reaches
41.92 FPS, with 14.44 s of controller work and 10.17 s of physics per 1800
ticks. The simulation stays near real time and all original bodies remain,
without errors. Evidence: `build/blockwalker-rivalry-view-firefox-crowded-
rivalry-profile-industrial-hz20/`. This is a program cadence change, not a
physics-rate change. Sustained interaction and Chrome verification remain;
neither the canonical catalog nor the served image uses these rates yet.

The full 1200 s combined run retains 103 bodies without errors and proves the
20 Hz stationary/rival programs continue delivering, fighting and recovering.
However Firefox renders this larger save at only 23.04 FPS. Changing the two
forklifts and quarry runner to 20 Hz gives 25.55 FPS, with all bodies retained
and simulation near real time. The earlier 41.92 FPS result does not establish
the target for this larger population. Evidence is under
`build/blockwalker-rivalry-view-firefox-crowded-{combined42,combined20}/`.
Investigate the 41 inert cargo programs, which still construct observations
ten times per second. Any slower rate must be explicit, available to every
program, preserve physical state and keep those programs running.

An explicit 1 Hz rate for those unchanged cargo programs reduces the paired
1800-tick replay to 24.80 s, versus 26.73/27.42 s for the two 10 Hz baselines.
After excluding the configured cargo rate and last-call tick, saved worlds
match exactly, including poses, velocities, credit and every program's memory.
The two baselines also match each other. Evidence:
`build/blockwalker-geometry-firefox-cadence-profile-repeat/`.

A same-browser baseline/candidate/baseline render gives 13.43/35.48/20.20 FPS.
All 103 bodies remain; simulation is near real time. GPU timestamps average
0.33 ms/frame; CPU world updates dominate. The earlier standalone 1 Hz render
was only 18.05 FPS, so browser variance remains material. Evidence:
`build/blockwalker-rivalry-view-firefox-crowded-cadence-profile-paired/`.
The canonical source now permits 1 Hz for any program and uses it for newly
created inert supplies. Cadence save/import checks, catalog updates, Chrome
and a final uninstrumented browser repeat remain before closing this issue.

The generic 1/10/60 Hz motor test now passes in both Chrome and Firefox,
including held actuator commands, physical joint motion, callback `dt`, and
saved/imported cadence. The full UI test retains 106 bodies without program
errors, verifies camera targets and exports the exact selected program source.
Chrome renders the four views at 48.65–51.65 FPS; uninstrumented Firefox gives
21.31–24.66 FPS. Evidence: `build/blockwalker-world-ui-{chrome,firefox}/`.
This confirms compatibility but does not meet the crowded Firefox performance
target; keep the issue open.

A sampled per-controller profile identifies observation creation as the largest
cost (`build/blockwalker-geometry-firefox-owner-profile/`). The next candidate
keeps the six walking/balance programs at 60 Hz, runs three boats at 20 Hz and
ten aircraft/gantries at 30 Hz. It changes only configured cadence, retaining
their source and all 60 Hz physics. An uninstrumented same-browser A/B/A test
on the 103-body save gives 23.85 / 50.62 / 44.01 FPS; all bodies remain and
simulation stays near real time. The warmer second baseline matters: do not
attribute the initial twofold difference entirely to the rate changes. Evidence:
`build/blockwalker-rivalry-view-firefox-crowded-controls30/`. A fresh 1800 s
combined cargo/fight workload is now checking those rates and the new handlers.

The final 125-object, 2327-part save regresses substantially: Chrome's six UI
views give 22.65–26.48 FPS; Firefox gives 8.99–9.49. A separate 90 s warm Firefox
run averages 14.66 FPS after warmup, with simulation still near real time.
Evidence: `build/blockwalker-world-ui-{chrome,firefox}/` and
`build/blockwalker-rivalry-view-firefox-crowded-final-pickup/`.

The current frame profile measures GPU work at 0.350 ms/frame and CPU world
updates at 100.954 ms/frame (about six physics ticks). Per tick: controllers
and force application 9.524 ms, Box3D 7.016, cargo 0.391, sampling 0.196.
`build/blockwalker-rivalry-view-firefox-crowded-current-profile/`.
Lower stationary/battery/barge rates reach only 17.81 warm FPS. Caching radio
and depot observations preserves the exact 1800-tick world but saves only
about 0.29 ms of sensor work per tick; it remains an unpromoted experiment.
The next cadence trial also uses 20 Hz for transport programs, retaining all
walking/balance programs at 60 Hz and physical simulation at 60 Hz. Physical
cargo, flight and firing behavior must pass before any rate changes are bundled.

Checkpoint decision: the 35-controller transport-rate candidate reaches 24.51
warm FPS on the same 125-object save and retains all bodies with near-real-time
simulation (`build/blockwalker-rivalry-view-firefox-crowded-transport20/`). It
still misses the target and lacks full cargo/flight verification. It is excluded
from image 28; the final packaged catalog retains the previously tested rates.
The observation-cache experiment is also excluded. Keep this task open.

A lazy-neighbor experiment keeps an immutable numeric snapshot in a
QuickJS-managed buffer and creates JS neighbor objects only when read.
Retained-observation and assignment checks pass, and the three resulting
1800-tick saves are identical. On the 125-object save, Firefox takes
28.153 / 27.659 / 27.983 s for baseline/candidate/baseline. This small difference
does not justify promotion; canonical observation construction is unchanged.
Evidence: `build/blockwalker-lazy-sensors-firefox/proof.json`.

A separate default-sleep candidate lets stationary bodies sleep and wakes motors
for nonzero commands. Firefox's paired 1800-tick replay takes
28.131 / 27.677 / 28.049 s (baseline/candidate/baseline), with 125 objects
retained throughout; awake bodies fall from 2309 to 1983. This roughly 1–2%
gain is insufficient to justify a physics behavior change and its validation
cost, so the candidate is excluded. `build/blockwalker-sleep-firefox/proof.json`.

The next structural investigation is [rigid compound assemblies](../20260925-100000-codex-01/TASK.md):
the current 2271-block catalog has only 351 fixed components. Measure the real
benefit and resolve block-local sensors, contacts and saved-state compatibility
before considering an engine change. No compound-body candidate is bundled.

Image 30's two new recovery trucks add about 2.6% to Firefox simulation time
in paired 1800-tick runs of the same 900 s saved world: 27.505/27.440 s with
106 objects versus 28.198/28.177 s with 108. Other programs are unchanged and
all runs finish without errors. `build/blockwalker-recovery-cost-firefox/`.
The crowded rendered-FPS target remains unmet.

The pinned Box3D already has an SSE2 path for WebAssembly. The ordinary Dolly
compiler lacks `-msimd128`/`-msse2` driver options, but its LLVM backend supports
the target. A source-only wrapper applies Clang's `target("simd128")` attribute
to unchanged upstream translation units, with Emscripten's compatibility headers
and explicit SSE macros. The probe and complete library compile and execute
inside Dolly; the probe declares the Wasm SIMD128 target feature.

Paired Firefox replays of the same 125-object save take 28.244/28.101 s with
the current scalar library and 26.348/26.167 s with SIMD (1800 ticks each,
all objects retained, zero controller/browser errors). This is about 6.8% less
simulation time, not a rendered-FPS result. `build/blockwalker-simd-wrapper-
firefox/proof.json`; recipe and probe in `build/blockwalker-simd/`. The prototype
remains outside the image pending longer physical and save/restore validation.
The first unmatched-header-pragma failure is retained in
`build/blockwalker-simd-firefox/`; the working wrapper balances the pragma.
