# Make faster biped walking survive repeated transfers

- STATUS: OPEN
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
