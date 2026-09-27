# Set down failed rescues safely and recover tipped bipeds

- STATUS: CLOSED
- PRIORITY: 310
- TAGS: game,controllers,physics

The actual 163-actor `full-v6/after.lua` contains Hibari suspended from Tsuru.
Its off-center grip leaves it tilted; after 90 s the old controller releases
without support, dropping the feet 4.64 m. Replay and contact evidence are under
`build/overnight-20260928/team-audit/`.

The timeout now retains the grip and lowers onto measured external support.
`supported-rescue-v1` and its unchanged continuation `supported-rescue-v2` prove
an actual supported abort: release on 34.208 N support against 31.944 N weight,
with zero credited rescues. The unchanged porter scenario still releases at
139.517 s on 42.065 N support, up 0.997454 and ground gap -0.00416 m.

The grasp now uses observed root-assembly geometry and center of mass for
bipeds, preserving the existing wheeled pickup behavior. Starting from that
actual post-abort world, `centered-rescue-v1` changes only Tsuru's source;
every other saved field matches recursively. It physically grips the top torso
at 67.267 s, releases upright on support at 104.533 s (30.483 N, up 0.999985),
and the biped finishes assisted settling at 106.533 s. The porter case still
passes identically. No poses, forces, assistance motors or tick rates changed.

`rescue-walking-v1` continues that same world for another 180 s with no source
changes. Independent rotated-foot/contact checks count 5/5 clean placements,
seven alternations, maximum accepted stance slip 0.0341 m, minimum up 0.987124,
and zero recovery cycles. All 169 original actors remain; no controller faults
or deaths occur. This proves walking, not merely displacement or a counter.

Exact source SHA-256:
`fba73958594ebe48679e1bb8d2f68fe2adbdcc9216d1a674f94828b3b71b9586`.
The source diff and real-grip/support proof are retained in
`centered-rescue-v1/controller.diff` and `centered-rescue-v1/comparison.json`.
