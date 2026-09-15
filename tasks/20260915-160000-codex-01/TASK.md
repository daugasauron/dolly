# Give the walking robot articulated arms and magnetic hands

- STATUS: OPEN
- PRIORITY: 200
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
`build/blockwalker-arms-library-{71,72}.json` and
`build/blockwalker-arms-{standing,initial-walking}-practice-result.json`.
The independent 90.017 s populated-world diagnostic reproduced the interference:
hand31 hit hip joints5/6 (sampled peaks1.823/2.723 Ns), and hand34 hit18/19
(.944/2.995 Ns). There were747 contact samples, approximately .1 s apart;
these are individual sampled impulses, not an integrated contact total. No arm
hit static ground, no dynamic external impulse was sampled, and oriented arm
clearance stayed above3.632 m. Exact body/source verified; all54 test-world
objects survived. Instrumented wall time96.573 s. C compiled inside Dolly;
browser tree limited to4 GiB/no swap, handle3259 terminal0, scope inactive.
`build/blockwalker-arms-collision-world/contact-proof.json` and the full report
preserve the evidence. This diagnoses #72; it is not a300 s successor pass.

Pi saved the forward/aft raised layout as#73. Its trial stopped for posture at
131.517 s after two scored steps, six aborts and a transfer timeout; full result
is `build/blockwalker-arms-raised-practice-result.json`.
The737-character contact report was delivered through the normal Pi prompt box
(`build/blockwalker-arms-contact-steer.mjs`). Pi is now trying symmetric outward
shoulder spacers on#72. No experimental arm body has been released.

The07:28 export preserved all53 live creations, all65 archived designs and the
entire374481137-byte native history prefix (now381693874 bytes). Live#67 was
upright at3346.483 s with232 scored placements,31 reversals and no aborts.
`build/blockwalker-walking/arms-progress-proof.json` verifies preservation,
actual Astra/xhigh requests and receipt of the complete contact report prompt.
