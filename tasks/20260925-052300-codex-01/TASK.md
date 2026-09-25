# Recover seabed cargo with winch salvage boats

- STATUS: OPEN
- PRIORITY: 240
- TAGS: game,content,physics

Give the new cable block a useful job in the shared world. In the populated
3000 s world, two of West's three fired light crates lie on the seabed and its
recovery truck cannot reach them. Build a stable industrial salvage boat with
a freely hanging winch magnet, controlled by an ordinary editable program.
Recover existing cargo, ferry it to an accessible handoff and leave it for the
land crew. Keep all cargo, guards and other machines physical and present.

Verify real underwater pickup, loaded reeling and buoyant transport, handoff,
interrupted pickup and loaded save/reopen. Then prove a recovered crate reaches
the loader and slinger in the combined world. Inspect the boat and visible
cable in Chrome and Firefox before bundling it. No actor-specific engine logic,
teleports, ammunition respawning or hidden movement helpers.

Starting evidence: `build/blockwalker-rivalry-wide-patrol-continued/blockwalker-
world.json`; cable mechanics and rendered hoist: `test/fixtures/blockwalker-
winch.c`, `test/fixtures/blockwalker-winch-view.mjs`.
