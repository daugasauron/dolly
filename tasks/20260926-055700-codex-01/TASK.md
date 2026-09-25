# Treat passive block assemblies as cargo

- STATUS: OPEN
- PRIORITY: 220
- TAGS: game,cargo,physics

Ordinary spawning recognizes only a single unanchored block as cargo. A beam made
from three ordinary boxes is therefore invisible to cargo-handling programs,
although the ore spawner manually marks its multi-block pallet as cargo.

Use the same rule for all unanchored assemblies containing only ordinary boxes.
Keep articulated machines and anchored structures out of cargo classification.
Preserve explicit cargo roles in saved worlds. No current catalog design is a
passive multi-box assembly, so this does not reclassify existing bundled robots.

Experimental source: `build/blockwalker-multipart-cargo/world.c` and `source.tar`.
Two lines replace the single-block rule; the ore-specific assignment is removed.
The served image41 and canonical source remain unchanged.

The running payload-beam trial replaces three ammunition props with ordinary
three-block beams: one alloy box and two hull boxes, about1.369kg total, below the
existing1.5kg light-ammunition limit. Initial in-Dolly assertions pass for cargo
classification, block count and measured mass. Gun body, loader and forces stay
unchanged. Inputs: `build/blockwalker-multipart-cargo/{catalog.json,defense.c}`;
output: `build/blockwalker-compound-regressions-chrome-payload-beam/salvage/`.

Completion requires physical pickup/handoff, preserved ordinary-machine roles,
rendering and save restoration in browsers. The separate projectile-disruption
gate may still fail; do not claim a combat improvement from classification alone.
