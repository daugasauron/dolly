# Checkpoint the September 27–28 Slopyard improvements

- STATUS: CLOSED
- PRIORITY: 340
- TAGS: game,combat,logistics,performance

Continue from d82ff39 until 2026-09-28 07:00 JST. Audit every starting unit and
improve useful interaction, recovery, physical combat and impressive cargo
chains. User observes about 100 FPS; preserve that experience through matched
camera/population measurements before and after changes. Improve distant grain
without discarding the established muted PlayStation-era machinery style.

Priority reproduction: a launched magnetic round catches an aircraft but its
handle stays on the aircraft despite cable payout. Complete physical deployment,
ground pickup, hauling, release and enemy scrapyard collection. Give the ordinary
nonmagnetic artillery rounds useful physical consequences. Prefer reusable parts
and editable programs; no hidden forces, forced captures or weaker opponents.

Completion requires per-role evidence, actual populated interactions, continued
safe reload/reuse and meaningful cargo throughput; matched Firefox performance
and visual comparison; a tested local image with protected saves/other assets
intact; checkpoint commit/backup and truthful handoff by the deadline. Preserve
current terrain-8 and earlier saves. Root owns catalog/engine/render integration;
subagents own tether, unit strategy and logistics audits with one shared browser.

Baseline: build/checkpoint-20260927-action-front/ and build/action-front-20260927/.
New evidence: build/overnight-20260928/.

Additional user requirements: rename the game to Slopyard; move every slingshot
closer to the middle while keeping it within its team's territory; give every
station both ground and air resupply. Investigate reusing a roaming boat to
recover stray projectiles. Prefer shared suppliers and existing hulls over
increasing population. Verify both physical supply paths, compatibility with
reusable tether ammunition and ordinary recovery after a blocked path.

Performance reproduction: user reports 40–50 FPS after the world has run for a
while. Firefox replay of the actual 20-minute world also measures 32–41 FPS,
depending on view. Profile controllers, physics and rendering before extending
the population; compare fresh and mature worlds at matched cameras.

The user ended expansion early: “finish the in progress work but do not start
new work.” This time-box task is closed for that revised checkpoint scope; the
broader uncompleted feature requests remain OPEN in their existing child tasks.
Verified walking/scouting/rescue/logistics, four-part tether improvements,
Slopyard branding and performance fixes are packaged locally. Terrain 9, shared
supply, raised launchers, five-part projectiles and salvage boats are excluded.

Final gates: actual Chrome/Firefox catalog and clean-exit checks; populated
240→600 s continuation with all 151 originals, 157 final actors, nine deliveries
and no faults/removals; 99-actor terrain-7 UI restore; aged 163-actor Firefox
rendering; 73 matching sources, six protected saves and 56 other assets retained.
Evidence: `build/overnight-20260928/checkpoint/proof.json`; current handoff:
`docs/crash-handoff.md`. Backup branch `codex/slopyard-checkpoint-20260928`,
built artifacts `build/checkpoint-slopyard-20260928/`. No remote deployment.
