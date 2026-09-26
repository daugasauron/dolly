# Reduce remaining populated-world controller and sensor overhead

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: game,performance

Continue the user's performance investigation for30 minutes after image43.
Profile the remaining work, compare candidates with the same134-object saved
world, and preserve60Hz physics/eight solver substeps, every actor and embedded
program, retained sensor snapshots, controller budgets and saved-world behavior.
Do not reduce simulation quality or remove gameplay to improve the numbers.

Baseline: image43,29fb53f. Inputs and disposable browser evidence:
`build/blockwalker-performance-30m-20260926/`. C compilation remains inside Dolly.
Use sampled phase timings to identify costs without putting a host clock call
around every controller operation. Quantify improvements with uninstrumented
browser runs in alternating order, and verify equivalent physics and saves
before packaging. Keep the FPS badge visible throughout.

The first1/127 sampled profile records89.50ms building sensors versus32.67ms
executing programs across253 sampled calls. Nearby-object construction accounts
for40.00ms; contact calculations only3.67ms. A deeper per-cargo profile is visibly
distorted by its extra clock calls, so use it only to identify operations.

Bulk QuickJS object construction traps with an out-of-bounds memory access on
the first candidate world run. Rejected and unbundled; stock survives unchanged.
`bulk-chrome/failure.log` preserves the failure. A separate three-element-vector
constructor comparison gives stock42.30/38.25FPS and candidate42.24/40.31FPS, with
substantial temporal drift and no clear gain. That change also remains unbundled.

The next candidate excludes terrain boxes outside conservative sight-segment
bounds before calling the existing raylib collision test. It retains the original
narrow-phase and visibility semantics. Check random, axis-parallel, grazing-edge
and inside-box rays across all five terrain versions, then compare the complete
world and uninstrumented browser performance.

The broad-phase visibility candidate matches26,344 comparisons against the
original raylib path. Chrome's repeated stock/candidate/candidate/stock samples
are39.17/46.38/50.98/38.48FPS, a25.4% average gain with all134 actors retained.
Evidence: `visibility-rays-chrome/probe.log` and `visibility-chrome/` beneath the
experiment directory. The small segment expansion makes box rejection conservative;
the final hit/distance decision still uses the original raylib routine.

The follow-up computes the observer's eye once while building a sensor's nearby
list. The combined candidate passes the full equivalence comparison: identical
initial/retained sensor values,720 terrain samples and complete saved world after
1800 physics steps, including controller memory. Evidence:
`eyes-equivalence-chrome/proof.json`. Combined FPS/frame-interval comparisons and
the existing scout/radio gameplay fixture are the remaining gates.

Final combined Chrome comparison: stock43.17/40.75FPS, candidate49.50/50.12FPS
(average41.96→49.81,+18.7%). Median intervals21/23→17/17ms; p95 intervals34/35→
33/32ms. All134 actors remain without errors/deaths. The existing check_radio
fixture also passes roof/wall occlusion, scout-triggered remote carriers, team
isolation, unseen claims retaining old coordinates, saved jobs and rejected bad
radio imports/output. Evidence: `eyes-chrome/` and `radio-chrome/probe.log`.

Firefox's first launch failed because its pinned Playwright executable had been
missing. Restored the required Playwright test browser and
resumed the comparison; the user's browser/profile was not touched.

Final Firefox comparison: stock44.30/43.44FPS, candidate49.07/49.73FPS
(average43.87→49.40,+12.6%). Median intervals21→19ms; p95 intervals35→30–31ms.
No missing actors, new deaths or errors. Combined raw measurements:
`build/blockwalker-performance-30m-20260926/comparison.json`.
The final implementation is11 added/3 removed C lines; rejected constructor
experiments are not included. The models, programs, physics timing and FPS badge
remain unchanged.

Post-change sampled profile: nearby15.37ms, environment/radio/depots7.01ms,
contacts2.30ms, per-part arrays5.21ms, total sensor construction45.05ms and program
execution22.97ms across253 sampled calls. Nearby construction remains the largest
identified sensor component, but falls from45% to34% of sampled sensor time.
Absolute phase times also reflect changing host load; use the alternating browser
comparisons for the improvement claim. `post-chrome/profile-performance.json`.

Packaged as image44 in41.8s inside Dolly using the existing runtime/dependencies.
Chrome and Firefox each verify111 bundled designs/programs and seven restored
worlds, including format1 and actual magnetic attachments, with no new errors,
deaths or model requests. Rendered views and persistent FPS badges inspected.
`build/blockwalker-image44-preview{,-firefox}/proof.json`.
All22 archived sources and served artifact hashes match; six protected save/
history files and39 other snapshots are unchanged. All13 image entries remain,
only blockwalker metadata changes, and40 recipe lint checks pass.
`build/blockwalker-image44-artifacts.json`. Local app remains on port9099.

The final constructor diagnostic passes1,250 allocations of1–25 numeric fields,
and another1,250 with nested arrays/strings under the4MiB heap limit. The original
prototype trap is therefore not isolated to the basic bulk API; its cause remains
unproven. Both minimal probes and the failed full candidate are retained under
`{object-probe,mixed-object-probe,bulk}-chrome/`. No constructor change ships.
