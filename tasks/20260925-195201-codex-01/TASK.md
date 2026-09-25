# Keep the yard porter from climbing machinery during pickup

- STATUS: OPEN
- PRIORITY: 230
- TAGS: game,content,bug

In fresh competition-v5, porter 38 delivers six parcels, including all three
carousel parcels, then tips while approaching parcel 41 around 800 simulated
seconds. The unchanged replay from the saved 273-second world reproduces the
first tip at 799.233 seconds. Its front wheel climbs onto guard 76's magnet fork;
contact force reaches 179 N before the tip. The porter is neutral and is not
magnetically captured. Its pickup program disables all non-cargo avoidance.

Reproduction and contact evidence:
`build/blockwalker-compound-regressions-chrome-checkpoint-porter-observe/salvage/`.
`salvage-loaded.json` is the 750-second pre-incident save; `salvage-dock.json`
is the first tip. `contact-proof.json` identifies the contacting parts.

An unbundled candidate retains moving-machine avoidance during pickup, preserving
the approach to anchored cranes. Changing only porter 38, the exact 750→930-second
replay passes: minimum up 0.997532, deliveries 5→6, then it collects parcel 41
and starts carrying it home. It has no guard contacts, errors or deaths; all 113
original actors, other programs and machine blueprints remain (115 at the end).
No guards, capture rules, forces or placements changed.

Evidence: `build/blockwalker-compound-regressions-chrome-checkpoint-porter-traffic/`
`salvage/porter-proof.json`, full contacts and final world. Candidate:
`build/blockwalker-checkpoint-followup/porter-traffic.js`.
Fresh combined verification and packaging remain required before closing.
The served checkpoint remains `ce3a392`.

Fresh combined trial delivers all carousel parcels, but porter 38 tips again near
(18.1, 36.1), first sampled below 0.8 up at 704 seconds. It completes four deliveries
before this different incident. The candidate therefore does not resolve the
whole issue. An unchanged 273→725-second replay confirms contact with carousel
95's fixed base/cab parts 90–92. Wheel 4 hits base 90 with a 642 N peak before tipping;
first sampled up below 0.8 is at 703.083 seconds. The pickup exemption for anchored
machines allows driving into their solid structure while chasing an unrelated
parcel. Preserve access to hanging cargo without ignoring solid base geometry.
`...-chrome-checkpoint-porter-combined-observe/salvage/contact-proof.json` retains
actual parts/forces, pre-incident save and first-tip save. All original programs
and actors are preserved in that diagnostic replay.
