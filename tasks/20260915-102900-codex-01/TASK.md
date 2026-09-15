# Make faster biped walking survive repeated transfers

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: game,agent,physics

Keep the verified original Sidelight - two-legged walker and every existing
creation/history intact. Continue the actual Astra/xhigh Pi experiment as
separate designs, using real joint/foot feedback and a few timed GPU images.
The [first biped checkpoint](../20260915-070100-codex-01/TASK.md) already walks;
this issue concerns speed and reliable later cycles.

XXXI moderated forward transfer passed 90 s practice with five alternating
upright foot placements and 1.68232 m travel, versus original XXVIII's 0.79589 m.
Its longer populated replay at (80,-50) failed: first swing abort 95.2 s,
up<0.9 at 142.317 s, maximum stance slip 0.66795 m, transfer timeout 167.583 s,
and posture removal at 172.0 s. It scored only four steps, then lost progress.
The original alongside remained upright with nine placements and 2.84939 m
forward travel. This is not evidence to promote XXXI.

The unchanged candidate source/blueprint is `build/blockwalker-fast-seed.json`.
Reproduction: guarded `build/blockwalker-fast-world-browser.mjs`, which uploads
through the ordinary Dolly file picker and runs the actual C game. Its expected
survival assertion correctly fails. `build/blockwalker-fast-world/` contains
poses, controller memory, two GPU images and `failure-proof.json`; the preceding
90 s practice proof is in `build/blockwalker-fast-trial/`. The 172.5 simulated
seconds took 270 wall seconds with dense world saves; this is not ordinary FPS.

Measure later transfer drift and actual support/landing geometry; do not tune
only the first step or accept a controller's own score as physical proof. A
short practice pass must be followed by at least 300 s in the populated world,
with repeating airborne forward placements, stable torso attitude, bounded
stance slip and useful cumulative travel. Preserve exact controller source and
state through save/reopen before bundling a faster successor. The practice tool now supports 300 s; see
[the verified extension](../20260915-103400-codex-01/TASK.md).


XXXIII's bounded-reach/sole-spacing controller passed an independent unchanged
180 s practice run: nine alternating physical placements, 2.91687 m torso and
3.19105 m COM travel, minimum up=0.979819, final up=0.999988 and maximum stance
slip=0.119806 m. No recorded abort. The original at the same 180 s has 2.88395 m
travel, so this is not an established speed improvement. Spacing between the inner foot-box centers along X
still reaches 0.95612 m; the outward correction does not preserve the initial
2 m gap. The final two placements have 2.833/1.700 s actual supported airborne
spans and 0.714/0.641 m foot advances. Evidence: `build/blockwalker-spacing/`.
The findings were delivered through Pi's prompt without interrupting it.

The 300 s populated-world run and exact reopen passed with 51 objects/1403 parts,
zero removals and 16 actual alternating placements. XXXIII travelled 4.74551 m,
minimum up=0.972636, maximum stance slip=0.148518 m. The original alongside
travelled 5.70929 m. IDs, all poses/velocities, sources and controller memories
restored exactly. The instrumented run took 489.356 wall seconds; do not treat
this as ordinary FPS. Evidence: `build/blockwalker-spacing-world/proof.json`.

Actual Pi also completed the 300 s tool with three GPU images and readable
memory. It then tested reach-cap-only XXXII-L for 300 s: 16 landings, no aborts,
5.372 m forward and 0.119806 m maximum stance slip. It found no demonstrated
endurance benefit from the outward spacing correction. Neither is a proven
speed improvement, so keep both out of the default catalog. The original's
[later live fall](../20260915-110000-codex-01/TASK.md) is a separate investigation.

XXXIV's alloy-pelvis mass-only comparison passed its actual 90 s Pi trial with
five scored landings and 1.758 m forward travel, but the 300 s tool rejected it.
After seven scored landings its eighth swing aborted at 132.933 s with support
loss/scraping; transfer/recovery timed out at 159.050/171.067 s, ending tipped
(up=-0.685629). The 8.503 m final displacement includes falling and is not walking
progress. Pi left it in practice and is examining the failing swing. Exact
source/29-part blueprint: `build/blockwalker-alloy-pelvis-seed.json`; actual tool
result/memory: `build/blockwalker-alloy-pelvis/pi-failure-proof.json`.


XXXV keeps the alloy pelvis but stops lateral integration from increasing an
already-large target/actual torso error during swing. The preceding failed
swing had a 2.43 m lateral mismatch and target height 5.80 m versus actual
6.78 m. Actual Pi's 90 s XXXV check passed five scored landings, 2.013 m forward,
minimum up=0.98682 and maximum stance slip=0.03014 m; no aborts. The actual 300 s trial failed at the seventh lift: abort at 115.967 s,
collapsed at the 123.383 s settle timeout. Lateral integration alone was not
the initiating cause. Its independent populated run lasted longer but also
failed: 16 landings (14 scored), first swing abort 264.117 s, up<0.9 at 264.683 s
and posture removal at 289.267 s. Last good landing at 252.533 s had 6.051 m
forward travel; later falling displacement is not walking. The original
alongside and all 49 other objects survived. The 289.6 simulated seconds took
470.5 instrumented wall seconds; no reopen was claimed for the failed candidate.
`build/blockwalker-antiwindup-world/failure-proof.json` preserves this result.

## Damping through weight transfer and lift

Exact original XXXVI source (12888 characters) was recovered from its recorded
program call as `build/blockwalker-damped-seed.json`. Pi reconstructed the
same documented control changes as separately labelled XXXVI-R (11879 chars),
kept at `build/blockwalker-damped-reconstructed-seed.json`; do not call those
sources identical. Its rebuilt 29-part blueprint matches the recorded current
body exactly. The short trial matched the reported original XXXVI metrics.

Actual XXXVI-R completed 300 s with three GPU images, 18 alternating scored
landings, 7.212 m forward, no aborts or recorded support loss, minimum up about
0.9872, maximum stance slip 0.020971 m. Roughly 173 s were weight transfers.
The independent 300 s populated/reopen comparison passed with unchanged source
and blueprint: 18 physically verified alternating placements, 7.208103 m forward
versus 5.703442 m for the original alongside (+26.38%). Minimum up=0.987204,
maximum stance slip=0.021042 m. All 51 objects/1403 parts survived and restored
with exact IDs, poses/velocities, source and controller memory. The final saved
state includes the eighteenth landing at 299.917 s, after the last periodic
sample. Each placement has >0.15 m ground clearance while the opposite foot
is grounded and the torso is upright, followed by >0.15 m forward foot advance.
Evidence: `build/blockwalker-damped-world/proof.json`, dense poses/memory and
three GPU images. Instrumented wall time 492.285 s is not normal rendering FPS.

A temporary C diagnostic collected actual Box3D contact pairs and manifold
impulses in independent 90 s practice runs, without changing physics. In the
faster design, 76/135 sampled supported-airborne states have a nonzero impulse
between opposite feet/legs (maximum summed normal impulse 0.345698 N s per
sampled step). The original has 11/128 such samples. Neither has any external
contact during those ground-clear intervals. Thus these are real alternating
ground-free placements, with cross-foot rubbing; do not claim completely
contact-free swings or dismiss the flags as only within-foot contacts. Some
within-foot flags in the original have zero impulse, confirming that a contact
flag alone does not establish load. Evidence: `build/blockwalker-contact/`
(`proof.json`, contact-report.json and six GPU images). Diagnostic C is confined
to build artifacts and is not part of the production API.

The verified exact XXXVI-R source/body is appended as **Sidelight II - balanced
biped** at (80,-50), keeping all 50 earlier catalog entries unchanged. The image
build and updated browser integration/reopen checks passed. The live migration
preserved all 53 existing objects and full native history; six historical
experiments are recovered as library #47-52, with the public biped at #44.
Fresh worlds include the successor automatically. Actual Pi also released exact
source/body #65 at (75,-85), seed6501; its first65.98 s remained upright with
three scored placements,1.1308 m forward and no aborts. All53 prior objects, all
52 designs and the complete355431228-byte history prefix remain. Live proof:
`build/blockwalker-walking/bipeds-release-proof.json`. Cleaner/faster stepping continues
in [the follow-up](../20260915-131400-codex-01/TASK.md).
