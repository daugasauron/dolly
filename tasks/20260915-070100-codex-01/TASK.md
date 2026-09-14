# Build a two-legged walking creature

- STATUS: OPEN
- PRIORITY: 300
- TAGS: game,agent,physics

User priority: "Looks cool, I really want something thats on 2 legs!"

Have the actual Astra/xhigh Pi design and learn a fully 3D biped with two leg
chains and distinct feet. Balance and stepping must emerge from joint controls,
physics feedback and foot contact. Preserve existing creations and history.
Use timed real GPU observations. Measure standing, weight transfer/single-foot
support, alternating steps and sustained forward travel before bundling it.
Wheels, jets or external anchoring do not establish walking. Arms, counterweights
and articulated broad feet are legitimate mechanisms.

The request was delivered through the live game's prompt input. The controller
limit investigation continues independently so host pauses do not defeat a
working gait. Replay the successful actual Pi design from a fresh start in the
populated world, including persistence, before closing this issue.

Independent guarded replay of Pi's saved 33-part Sidelight III completed 20 s
under the corrected controller budget. Final up=0.9969, torso displacement
2.154 m. After settling, neither foot lost all terrain contacts: both retained
nine contacts at 15–20 s and center height 0.485 m. The swing knee reached
1.5 rad, but that foot slid inward from x2.006 to x1.415 instead of lifting.
This is not walking. Actual poses/contact traces and three GPU images are in
`build/blockwalker-biped/`, with runner `build/blockwalker-biped-browser.mjs`.
The measurements were sent through the real Pi prompt; it is continuing the
biped experiment after the preserved-history runtime update.

At 22:29 UTC Pi had built taller Sidelight IV with greater shoulder/ankle
clearance. Released-key standing passed; its first active COM loop rocked, so
it is testing quiet standing before applying weight transfer. No biped has been
released or bundled yet.

Independent Sidelight VI replay verified actual single support: at 20 seconds,
left foot nine contacts, right foot zero, right sole minimum clearance 0.76955 m,
root up=0.997513. All sampled states from 18.7167 through 20 s had planted left
support, right clearance over 0.15 m and up over 0.99 (1.2833 s sampled span).
The unchanged Pi blueprint has 37 parts; lighter articulated segments overcame
the earlier torque limitation. Three actual GPU frames and poses are in
`build/blockwalker-biped-lift/`, including `proof.json`. Alternating support and
walking remain unproven; Pi is developing Sidelight VII. Its request 389 was
still active at 22:43 UTC, with request 388 completed and world frames advancing.
Do not abort/restart solely because inference is long.

The separate 90-second Sidelight VII replay kept all 46 objects/1248 parts alive.
The first support qualified for 1.567 s and landed. During the mirrored lift,
the left sole cleared 0.896 m at 30.82 s, but the right sole rolled 0.254 rad
onto three contacts, with COM 1.45 m left of its center. It aborted at 31.47 s
and stalled in landing phase 4 through 90 s. Final sole rolls were 0.215/0.395
rad, three contacts each; right correction saturated at +0.4. One completed
transfer is not sustained walking. Poses, controller memory, three GPU frames
and proof are in `build/blockwalker-biped-support/`. The instrumented run took
130 wall seconds; do not treat it as normal rendering performance. The findings
were queued through Pi's normal steering input without aborting inference.

Request 389 eventually ended with `Browser HTTP transport failed`; the existing
retry resumed normal tools without a browser restart. By the 22:49 UTC mirror,
Pi was testing Sidelight VIII with narrower hips. The full history remains saved
(315,183,322 bytes); this single transport failure's cause is not established.

The new 90-second practice replay exposed Sidelight IX's later fall: up=0.99944
at 20 s, below 0.9 at 55.12 s, and below zero at 58.73 s. Joint separation
stayed under 0.0182 m. After the fully preserved runtime migration, actual Pi
repeated the 90 s trial and independently reported the same failure. It is now
testing Sidelight X with direct torso-attitude feedback. The source-only trial
extension and missing practice-memory diagnostics have tasks 080300/080400.

The packaged 90 s Sidelight XI replay stayed upright (minimum up=0.91824,
final=0.99709), with maximum joint separation 0.01026 m. New practice-memory
inspection exposed the failure directly: only 0.383 s qualified support,
zero completed cycles, lift aborted at 15.933 s, landing timed out at 22.95 s,
then terminal recovery phase 6 from 34.95 s. Maximum forward excursion was
0.194 m; the 1.147 m final displacement is mainly lateral. This is not walking.
Evidence: `build/blockwalker-memory-trial/` contains unchanged source, full
poses, 89 bounded memory snapshots and three actual GPU frames. Live Pi reached
Sidelight XII before the tool-update checkpoint; no biped is bundled yet.

A separate 90 s Sidelight XII replay reproduced its exact final pose metrics:
up=0.9986781, displacement=4.48666 m, maximum joint separation 0.007437 m.
Maximum forward excursion was only 0.511 m. By 10 s both soles had rolled onto
three contacts. At 20 s right sole roll was -0.07784 rad while root roll was
-0.01449; the knees had never entered the programmed swing. Pi independently
trimmed only its diagnostic logs and reproduced the same motion. Its actual
new tool result exposed transfer timeout at 23.85 s and terminal recovery at
45.867 s, with zero support/lift cycles. Numerical findings were queued without
aborting inference; next focus is loaded sole leveling during weight transfer.
`build/blockwalker-damped-trial/` contains poses, memory samples, three GPU images,
`proof.json` and the actual Pi tool result in `pi-trial-proof.json`. The original
large logs exceeded the 8 KiB snapshot after 9.32 s; Pi's compact version fits.

Actual Pi trials then reached transfer at 6.817 s in XIV and 0.50 s qualified
support. XV's measured sole-orientation feedback restored quiet standing after
failed lifts, instead of persistent edge rocking. XVI reached 0.517 s support
in a targeted 32 s run. XVII reached 0.867 s support but fell during landing
(final up=-0.697 at 32 s). None completed a qualified cycle. The actual tool
results are in the 23:49 UTC native/event mirror; Pi is continuing its next
revision. The independent XII poses also measured up to 1.88 degrees of finite
angular deflection at a nominally rigid sole/ankle weld. This and guidance to
use shorter transfer comparisons before longer gait verification were queued
through the normal prompt without interrupting inference.
