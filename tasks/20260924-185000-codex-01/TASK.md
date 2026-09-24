# Expand the cave and industrial world with an active new crew

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: game,content,physics

Continue the Blockwalker branch through September 24, 2026, 21:00 JST.
The user likes the cave and wants more interesting places and characters.
Start from verified checkpoint f9e8083, preserve the original saved world and
native Pi history, and keep the existing walkers and island cargo competition.

Build a larger mine/cave district with distinct spaces, navigable passages,
industrial machinery and cargo activity. Add characters with distinct physical
forms and jobs; retain actual motors, contacts, cargo and ordinary controllers.
Give the new content accessible camera locations and library entries. Preserve
older saved terrain revisions. Measure movement, useful interactions, save/load
and browser performance with the existing population, then package the verified
content for the owned 9099 preview. Compile C inside Dolly and use one disposable
4 GiB/no-swap browser tree at a time. Lua/YAML migration remains separate.

The first 68-object run reached 1047 seconds before exposing an
[air courier grabbing another robot](../20260924-193500-codex-01/TASK.md).
The mine crew survived, with five completed porter-to-aircraft deliveries and
72 measured foot placements by the new biped. The final checkpoint requires the
courier fix and another combined run. Temporary trials and saved reproductions
are under `build/blockwalker-mine-*`; they are not automatically shipped content.

The final candidate adds nine machines and a salvage relic: a rotary boring rig,
mine porter, two team lookouts, sump inspection float, physical ventilator,
two-legged workshop strider, paddle launch and telescopic salvage crane.
Terrain 2 has a stepped rock shell, low entrance, dry haul road, side workshop,
flooded sump and dispatch court. Terrain 0/1 saves retain their maps. Rotating the
physical drill permits bounded core samples; the porter must carry them outside.
Mine and Dispatch camera buttons expose the district and its nearby crew.

Verified component trials, compiled inside Dolly:

- `build/blockwalker-mine-models-first/`: 300 s with powered/unpowered paddles.
  Launch travel 93.770/8.852 m, no thrusters; minimum powered up 0.98978.
  Hibari made 18 and 20 supported airborne foot placements, including late ones.
- `build/blockwalker-salvage-run-reach/`: final 23-part crane, relic and float
  survive 1200 s, 21 supported transfers between water and land. Relic height
  -3.515 to 2.948 m; maximum joint separation 0.0711 m; zero removals.
- `build/blockwalker-mine-driver/`: real drill gating, sample stock/reload,
  porter clearance, wrong aircraft attachment and previous physics checks pass.
  Keyboard-driven vehicle travels 8.691 m and picks up cargo; no browser errors.
- `build/blockwalker-water-benchmark-first/`: a water-level terrain shortlist
  matches 129480 old coverage queries across all maps. Identical saved state
  after 3600 timed steps; 50244 to 47430 ms (5.6% less time in this trial).
- `build/blockwalker-mine-preservation.json`: original world, character, config
  and complete native Pi history remain byte-identical to the previous proof.

`build/blockwalker-mine-continuous-final0/` completes 1800 s without reloads:
all 70 originals survive, 31 deliveries, East 33 / West 23, and five complete
lift/hauler/loading-crane/barge/receiving-crane chains. Both teams receive heavy
and light cargo in the last fifteen minutes. Hibari makes 119 supported foot
placements (29 in the final quarter), Sidelight 122; both quadrupeds continue
walking. The revised lookouts make 88/112 arrivals, the float 75 visits, and the
salvage crane 32 transfers. This run exposed an
[empty porter waiting outside sensing range](../20260924-202600-codex-01/TASK.md);
its three early mine deliveries do not establish sustained mine throughput.

The corrected porter completes a second uninterrupted 1200 s population trial
(`build/blockwalker-mine-continuous-final42/`): all 70 originals remain, 26
scored deliveries, East 21 / West 13, seven porter pickups, six mine handoffs
and five scored cores. Hibari makes 83 supported foot placements, 20 in the
final quarter; the salvage crane makes 21 transfers. A saved courier set-down
stall is fixed entirely in its embedded program and verified by exact replay in
[the lowering issue](../20260924-204300-codex-01/TASK.md).

The user's later [embedded driver request](../20260924-205000-codex-01/TASK.md)
adds generic pilot input and a Program source viewer/import/export. Physics and
movement behavior remain in the ordinary actuator/controller path. Empty
programs receive no hidden steering assistance.

Final image 27 is served by the owned 9099 preview. Source archive:
`0f9289f5e3efdf2ead04633759effaaf048759cce7578385b40eb33684800a84`
(960512 bytes). Snapshot:
`6aded83091091923b17fc999832c82fe4157f16f6d21b9e3fdb8f4ca9a6ad82c`
(232415220 bytes), built inside Dolly in 26.0 s using the existing runtime.
The other twelve local image catalog entries are byte-for-byte metadata matches.

`build/blockwalker-competition-preview-mine27-chrome/` and `...-firefox/`
verify the actual served image, all 70 original objects and programs, terrain 2,
51 saved designs, world export/import and zero deaths/errors/HTTP calls.
Seven 15 s camera samples each: Chrome 56–61 FPS, Firefox 46–57 FPS, simulation
0.998/1.000 times real time, zero GPU readback bytes. Framebuffers inspect the
mine, dispatch, biped, paddle launch and salvage crane. Final controller limits
pass 70000 finite calls, 1000 deliberately paused calls and five rejected
runaways (`build/blockwalker-controller-final.log`). The original protected
world and complete Pi history remain untouched.

The next user goal, through September 25 at 07:00 JST, is tracked separately in
[the physical cargo competition issue](../20260924-211600-codex-01/TASK.md).
