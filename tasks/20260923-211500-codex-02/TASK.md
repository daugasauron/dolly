# Reconcile Slopyard mechanics, catalog and late-1990s industrial art

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: game,physics,art

Requested direction: late-1990s Japanese PlayStation, with muted textures,
low-poly forms and chunky industrial machinery. Face-adjacent rigid blocks must
stick to each other; hinges, pistons and wheels remain explicit moving
connections. Replace spherical hinge visuals with mechanical angle indicators,
and curate the strongest recent characters into a coherent world.

Implemented on `codex/slopyard-retro-20260923`: cylindrical servo collision
shapes with nominal block mass, live angle scales/pointers, rigid neighbor welds,
muted industrial rendering/UI, coastal haze and dithering. Fresh worlds contain
33 objects / 1109 parts from 26 designs. Sidelight opens the workshop and patrols
near the world camera; 18 older prototypes can be loaded separately through the
library. Existing saved populations are not replaced. The original checkpoint
and learned session recovery remain preserved.

The bridge's touching leaves needed a gap under the new weld rule; three tip
blocks were repositioned as raised trim without changing controller indices.
Articulation clearances and nominal mass were verified with actual Box3D.

Evidence so far: in-Dolly C compilation and `slopyard --check` pass, including
a closing-face weld that holds after the parent weld is destroyed and an adjacent
servo that turns freely. A bounded Chrome/WebGPU run completed 300 simulation
seconds in 302.419 wall seconds with all 33 objects and no removals. Independent
foot-pose sampling measured 20 alternating biped placements, minimum uprightness
0.98587 and maximum stance-foot drift 0.01790 m. World controller diagnostics
recorded three reversals and no aborts. No model requests were needed.

Local evidence: `build/slopyard-retro-proof/{summary.json,retro-proof.json,
retro-world.json,retro-*.png,physics.log}` and `build/slopyard-retro-soak.log`.
Final packaged image builds in 28.2 seconds with the unchanged Wasm kernel.
`test/slopyard-browser.mjs` passed editing, camera/underside placement, archive
access, both biped actuator pages, held-key feedback and blueprint persistence.
`test/slopyard-agent-browser.mjs` passed actual cargo lifts/releases, buoyancy,
feedback flight, contact forces, controller failure containment and world
save/reload. The self-contact fixture also needed clearance under the weld rule;
its force assertions remain intact. All browser process trees used the 4 GiB,
no-swap guard; no model calls or live learned-session modifications were needed.
Logs: `build/slopyard-retro-{editor,integration-final,build-final}.log`.
Image SHA-256: `a2b807b91b3c96ae95e1625668ab24a147a77e95a34f21a050f9554ffb7875ff`.
The existing preview at `http://127.0.0.1:9099/slopyard/` was independently
opened in a fresh Chrome context; its final renderer and 13-actuator control
paging passed (`build/slopyard-retro-preview.log`).
