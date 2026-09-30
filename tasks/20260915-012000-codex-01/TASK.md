# Add powered magnets for cranes and cargo

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: game,physics,agent

Add a magnet block that cranes can energize to pick up loose boxes, carry them
using actual Box3D forces and release them. Provide assignable on/off controls,
visible energized/holding state, adjustable holding strength and controller
feedback. Exclude the crane's own parts from attraction. Excess weight or
distance must defeat a finite magnetic force; do not teleport or parent cargo.

Make loose cargo available in practice and the shared world. Preserve powered
and attached states through world save/restore, and handle removed targets
without invalid body accesses. Keep older blueprints working.

Verify pickup, lift, release, self-exclusion, overload and persistence in real
physics and browser controls. Then have the live Astra/xhigh Pi experiment with
a cargo-handling crane while preserving the successful world and conversation.

## Verification, 2026-09-15 01:40 JST

Implemented magnet type 5, latched On/Off keys, selectable pole axis/sign,
2–100 N force, visible power/holding status, practice/world cargo and controller
sensors. Physics uses a finite spring/damper at the target contact point with an
equal reaction on the magnet. It ignores its own character and static bodies.
Version 5 blueprints preserve magnets and still load versions 1–4. World saves
resolve attachments through stable creature/part identities after body reload.

The C image compiled entirely inside Dolly. Native checks passed self-exclusion,
pickup, latched lift, release, overload and a destroyed target. With a 24 N magnet,
an alloy crate reached y=1.988 m at 3.697 N load; maximum crane separation was
0.00331 m. Evidence: `build/slopyard-proof/physics-check.log`.

Both focused browser suites passed in Chrome 151/NVIDIA under separate 4 GiB,
no-swap scopes. Integration measured cargo y=1.9885 m, release y=0.4850 m,
a repeatable program trial, and a loaded crane still holding its saved cargo
after restart. Editor checks placed and configured a magnet, round-tripped the
blueprint, dropped cargo with the UI button, lifted it with the keyboard and
released it with a quick Off tap. Ordinary rendering read back zero GPU bytes;
explicit observations still use actual GPU PNGs. Existing camera/editor,
under-floor placement, feedback flight, water and anchored bridge checks passed.
Logs: `build/slopyard-magnet-integration.log`,
`build/slopyard-magnet-editor.log`; measurements/images:
`build/slopyard-proof/slopyard-magnet.json`, `magnet-ui.json`,
`magnet-ui-lift.png` and `slopyard-magnet.png`.

Migrated the live browser to session `slopyard-magnets`, preserving all 14
current survivors at world age 7989.65 s and the 46,359,844-byte full Pi
conversation. The recovery archive is `build/slopyard-walking/magnet-state.tar`.
The earlier second tripod was removed at age 6667.4 s before this migration;
the old log does not identify the cause;
its design remains in previous recovery archives. The newer boat, 28-part crane
and 72-part bridge were preserved. Submitted the magnet crane experiment to
Astra/xhigh. The real agent pickup/carry experiment is verified below.

At 01:44 JST, the actual Astra/xhigh Pi built an 18-part anchored crane, placed
an alloy crate and exercised it through direct keyboard tools with timed GPU
frames. Parsed tool results verify: cargo lifted to y=2.1343 m, remained attached
while slewing at y=2.2003 m/load=16.6313 N, then released onto the floor at
y=0.4850 m, 2.7178 m horizontally from pickup. Captured evidence, blueprint,
controller and measured trial states: `build/slopyard-walking/magnet-proof.json`.
Pi then installed a 60 Hz feedback controller that gates pickup, lift, slew,
lowering and release on attachment, load and joint sensors; its autonomous
shuttle experiment continues in the live world session. This completes the
magnet task; ongoing population work remains in the larger-world task.

The agent subsequently released Dockhand and a separate crate into the shared
world. At the next image migration (01:49 JST), the 76.6-second-old crane
restored its live attachment to cargo ID 20 and applied 6.2375 N load, with the
crate still at y=2.1637 m. The full conversation and 15 current survivors were
preserved in session `slopyard-cranes`. Real-agent evidence is retained in
`build/slopyard-cranes-monitor.log` and the full current-state archive.
