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
state through save/reopen before bundling a faster successor. The current
practice tool stops at 90 s, so longer verification presently uses the world.
