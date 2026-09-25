# Verify captures and teammate rescues in the cargo competition

- STATUS: CLOSED
- PRIORITY: 220
- TAGS: game,content,bug

The user explicitly chose physical captures/overturns and teammate rescues.
Existing editable guard/raider programs perform both; opponents, magnets and
physical forces remain unchanged. Truck tipping is measured rather than treated
as an automatic whole-world failure.

Fresh1500s competition-v5 records64 hostile grip releases,20 leaving the enemy
tipped,32 friendly attempts and9 upright friendly releases. Follow-up checks
find3 sustained rescues: targets71/74 remain above.5 up for10s, finish above.85
and move more than1m. Their distances are3.435/2.747/1.761m. Some other rescue
attempts fail; an upright instant is not counted as sustained recovery.

Full grip/release identities, team checks, follow-ups and preserved capture/
rescue saves: `build/blockwalker-compound-regressions-chrome-competition-v5/
salvage/competition-proof.json`. All original sources/blueprints remain except
the documented cargo/traffic fixes. No hidden righting force or respawn.

Packaged in image37. Chrome/Firefox match all98 catalog programs/blueprints
and restore old plus loaded worlds; see `docs/crash-handoff.md` for evidence.
