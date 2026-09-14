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
