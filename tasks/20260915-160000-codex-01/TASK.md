# Give the walking robot articulated arms and magnetic hands

- STATUS: OPEN
- PRIORITY: 10
- TAGS: game,agent,physics

Extend the verified two-legged body into a more expressive, useful character
for the living world. Start a separately saved design from Pi library#62,
preserving that exact body/controller and live#67. Use actual Astra/xhigh Pi,
physics feedback and a few timed GPU images. Keep the game in C and use ordinary
builder blocks, hinges, light materials and unused keyboard bindings.

First add two articulated arms and verify standing, then sustained alternating
walking with the arms present and moving. Feet must provide the ground support;
arms must stay clear while walking. Preserve the ordinary physics and motor
limits. Save each experiment. Check at least300s independently in the populated
world before promoting a successor, including foot clearance, support impulses,
stance drift, absence of ground support from arms and exact save restoration.

Then explore magnetic hands and a small cargo pickup/release. A telescoping arm
or a controlled crouch can provide reach; use actual finite-force magnet
attachments and preserve cargo objects. Record what is measured separately from
what remains experimental. Keep every older creation and the complete native
Pi history. No unverified releases.

## First arm layout

Pi saved #71 (standing) and #72 (walking): 35 parts, 16 powered hinges.
The first 29 parts exactly match verified #62. Each light arm adds a shoulder,
elbow and hand, with digit bindings and finite 8/6 Nm motor limits; total added
mass is 1.369 kg. The 5 s standing check stayed upright (minimum up .99999976)
and arm clearance exceeded 4.589 m.

The unchanged gait plus slow mirrored arm motion completed 300 s, but failed
the walking quality gate: 18 scored steps, three aborts, minimum up .932817,
maximum controller stance drift .462378 m and worst tracked support-block drift
.531 m. Arms stayed above 3.491 m, but their contact flag was present for
235.667 s. That flag includes self-contact and does not prove ground support
or identify the interfering parts. #72 remains experimental; no release.

Exact records and full trial results are retained in
`build/slopyard-arms-library-{71,72}.json` and
`build/slopyard-arms-{standing,initial-walking}-practice-result.json`.
The independent 90.017 s populated-world diagnostic reproduced the interference:
hand31 hit hip joints5/6 (sampled peaks1.823/2.723 Ns), and hand34 hit18/19
(.944/2.995 Ns). There were747 contact samples, approximately .1 s apart;
these are individual sampled impulses, not an integrated contact total. No arm
hit static ground, no dynamic external impulse was sampled, and oriented arm
clearance stayed above3.632 m. Exact body/source verified; all54 test-world
objects survived. Instrumented wall time96.573 s. C compiled inside Dolly;
browser tree limited to4 GiB/no swap, handle3259 terminal0, scope inactive.
`build/slopyard-arms-collision-world/contact-proof.json` and the full report
preserve the evidence. This diagnoses #72; it is not a300 s successor pass.

Pi saved the forward/aft raised layout as#73. Its trial stopped for posture at
131.517 s after two scored steps, six aborts and a transfer timeout; full result
is `build/slopyard-arms-raised-practice-result.json`.
The737-character contact report was delivered through the normal Pi prompt box
(`build/slopyard-arms-contact-steer.mjs`). Pi is now trying symmetric outward
shoulder spacers on#72. No experimental arm body has been released.

The07:28 export preserved all53 live creations, all65 archived designs and the
entire374481137-byte native history prefix (now381693874 bytes). Live#67 was
upright at3346.483 s with232 scored placements,31 reversals and no aborts.
`build/slopyard-walking/arms-progress-proof.json` verifies preservation,
actual Astra/xhigh requests and receipt of the complete contact report prompt.

## Spacer and attitude experiments

Symmetric spacers added two light boxes (.456 kg), yielding37 parts/16 joints.
Standing#74 passed5 s with no arm contact flags and conservative arm-floor
clearance above4.57 m. Walking#75 failed for posture at230.35 s after13
alternating landings, seven scored steps and eight aborts. Its first arm contact
flag appeared at228.8 s during the fall; this supports, but does not independently
prove, the clearance fix. The added supporting-hip attitude term in#76 made
things worse: posture failure at81.25 s after two scored steps. All exact saved
bodies/controllers and complete results remain in `build/slopyard-arms-*`.

Pi's next matched experiment holds the arms neutral on#75. A verified C update
now also exposes per-part support/self-contact force estimates; see the
[sensor issue](../20260915-163200-codex-01/TASK.md). Earlier contact reports use
Box3D's raw `totalNormalImpulse` solver accumulator. It establishes nonzero
contact, but its value is not net momentum change integrated over a tick.

The new live session `slopyard-forces` preserves all53 live creations and76
designs, with full384715559-byte native history verified before resuming. At
the saved checkpoint live#67 was upright at4452.4 s (74.2 min),308 scored
placements,41 reversals and zero aborts. The948-character continuation prompt
resumes the quiet-arm comparison, then force-informed tuning; actual Astra/xhigh
requests resumed at07:53:38 UTC. No arm body has been released or promoted.

Quiet-arm #77 fell at 99.067 s with five alternating landings, two scored.
Across 621 elevated-foot samples, the opposite foot carried above 9.13 N and
the raised foot had zero sampled external support. There were 32 self-contact
samples, peaking at 36.69 N; arm force first appeared during the fall at 97.85 s.
Exact records #77/#78 and the quiet-arm result are in `build/slopyard-arms-*`.
The neutral blueprint comparison gives 25% more mass and a .619 m higher COM
than #62; rigidly locked roll inertia rises 37%. This is a geometric calculation,
not measured articulated response (`slopyard-arms-mass-comparison.json`).

Saved #78 uses slower, better-damped transfers and recent external-force
evidence for support. Its trial was interrupted for a sandbox update; Pi was
explicitly told to rerun it. The update removes the arbitrary controller source
cap and preserves cached magnet load on restart. All 53 live creations, 78
designs and the entire 385650233-byte native history survived exactly. The
923-character continuation was submitted through the normal prompt box.
Initial relay errors recovered; Pi resumed inspection and trials at 08:44 UTC.

The recovered native history confirms #78 completed its rerun, falling at
185.1 s / 11106 ticks. It was not released. All 78 saved designs remain in the
September 23 recovery archive. The full 923-character prompt was received after
resending at a slower typing rate; the first submission lost text during a
background save. Native history preserves both submissions and all results.
The existing unmodified patrol #67 reached 53590.3 simulation seconds (14.9 h),
3713 scored steps, 485 reversals, two aborted transfers and maximum recorded
stance drift .052154 m. These are controller counters, not independent geometry
checks of all 3713 steps. It remained upright in the final saved world.

This arms extension remains experimental and OPEN. The broader living-world
checkpoint includes the independently verified two-legged patrol body, while
all arm attempts remain available in the recovered design library.
