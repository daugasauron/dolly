# Build a two-legged walking creature

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: game,agent,physics

User priority: "Looks cool, I really want something thats on 2 legs!"

Have actual Astra/xhigh Pi learn a fully 3D biped with two leg chains and distinct
feet. Balance and stepping must emerge from joint controls and physics feedback.
Require repeated actual airborne forward foot placements, stable weight transfer
and sustained travel. Preserve existing creations and full native Pi history.
Use a few timed real GPU observations. Wheels, jets and anchoring are not walking;
arms, counterweights and articulated broad feet are legitimate mechanisms.

## Verified original

**Sidelight XXVIII — measured-motion landing damper** has 29 parts and ten
powered hinges. Actual Pi developed it through standing, single support, swing,
landing and alternating-transfer experiments. The first successful compact
source is 10460 characters, preserved in `build/blockwalker-repeat-seed.json`.
The local default image now includes it as **Sidelight - two-legged walker**
at (60,-50), with all prior 49 catalog entries unchanged.

| Check | Measured result |
| --- | --- |
| Independent unchanged 90 s practice | L–R–L–R landings at 19.550, 42.600, 63.817 and 85.067 s; torso travel 0.79589 m, COM travel 1.06428 m |
| Actual physical foot placement | 1.400–2.083 s supported airborne spans; 0.315–1.119 m maximum clearance; 0.355–1.052 m forward foot advance; all landings up>0.98 |
| 240 s populated world | 13 lifts, 12 alternating upright landings, torso travel 4.29367 m, minimum up=0.983106, maximum stance slip 0.15846 m |
| Populated persistence | All 50 objects/1374 parts survived; IDs, poses, controller sources and memory restored exactly before the next frame |
| Fresh packaged image | 50 objects/1374 parts, zero removals/model requests, original source/blueprint, all 50 identities retained on reopen |

Rotated box-corner poses establish actual clearance independently of the
controller's own score. The first physical landing is valid despite its stricter
internal rejection. Source is unchanged; blueprint equality accounts for C
float32 storage. No physics tuning, hidden balance assistance or anchoring was
introduced. The gait is slow: later placements settle near 17.5 s apart.

Evidence and three timed GPU images per physics replay:
`build/blockwalker-repeat-trial/`, `build/blockwalker-biped-world/` and
`build/blockwalker-biped-checkpoint/`. Their matching browser/check scripts and
logs reproduce the runs inside Dolly. The image build took 20.8 s and produced
231885791 bytes (SHA prefix 29aec82041b76b9c). Current source pins are in the
Dollyfile/module. Guard the complete test tree with 4 GiB/no swap.

Pi released exact original source/blueprint as live ID 62 at (60,-50). It
walked 4.09964 m over 226.717 s before the checkpoint, staying upright, with all
52 earlier objects unchanged. The updated `blockwalker-sidelight` session
preserves 53 objects/1390 parts and the full 337,244,715-byte native history.
All five files matched after import; world/history hashes matched inside Dolly,
and the real session compatibility check passed. Actual Astra/xhigh continuation
and the advancing-world backup preserve every old ID/source and the entire
history prefix. Evidence: `build/blockwalker-walking/sidelight-*-proof.json`.

The first biped checkpoint is complete. Faster sustained walking continues in
[its separate issue](../20260915-102900-codex-01/TASK.md); the broader timed goal
remains active until 22:00 JST.

## Faster candidate, still separate

Independent unchanged **XXXI — moderated forward transfer** completed five
L–R–L–R–L placements in 90 s at 19.550, 37.933, 54.483, 69.583 and 84.083 s.
Supported airborne spans were 0.867–1.467 s, maximum clearances 0.207–1.119 m,
and foot advances 0.440–0.942 m, all upright. Minimum up=0.980949, final
up=0.999921, maximum stance slip=0.127904 m. Torso travel was 1.68232 m versus
XXVIII's 0.79589 m. Source and blueprint are unchanged.

The longer populated replay **failed**. At (80,-50), XXXI first aborted a swing
at 95.2 s, fell below up=0.9 at 142.317 s and was removed for posture at 172.0 s.
Maximum stance slip reached 0.66795 m; it scored four steps, then lost progress
through unscored transfers. The original alongside remained upright with nine
physical landings and 2.84939 m forward travel at 172 s. The 50 other objects
survived. Do not promote the faster candidate. This run measures survival and
motion, not ordinary rendering performance (dense world saves took 270 wall s).

`build/blockwalker-fast-world/failure-proof.json`, poses and two pre-failure GPU
images retain the failure. The browser assertion correctly rejected removal
before 240 s; no persistence claim is made for the failed candidate. The 90 s
practice evidence and three images remain in `build/blockwalker-fast-trial/`.
Late-failure findings are included in the resumed Pi prompt.

## Earlier findings

Quiet standing, foot sliding and one successful transfer did not establish
walking. Earlier versions fell during touchdown or stalled in recovery. Actual
finite angular flex along the loaded chain displaced the sole by up to 0.849 m
relative to ideal measured-angle kinematics. A temporary 120 Hz constraint
comparison reduced flex but regressed boat navigation; the
[stiffness issue](../20260915-093700-codex-01/TASK.md) retains the evidence and
unchanged 60 Hz defaults. Successful landing instead came from measured-motion
feedback and coordinated leg geometry.

The detailed experiment chronology and artifact names remain at
`d4371a1:tasks/20260915-070100-codex-01/TASK.md`. Keep failed variants and full Pi
history; improve the successful gait as a separate version.
