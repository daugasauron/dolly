# Make the narrow front and neutral sea cargo continuously active

- STATUS: CLOSED
- PRIORITY: 320
- TAGS: game,world,combat,logistics

Narrow the combat area and provide four artillery stations per team, including
an air-supplied rooftop and a car/hoist-supplied rooftop. Make repeated reloads and
opposing encounters visibly frequent. Neutral mine extractors and crane load a
neutral boat; opposing crane boats compete to carry its ore to their islands.
Add aircraft and allow anchored workshop builds on supported team ground/roofs,
with neutral structures in the middle. Keep the muted base palette.

Implemented terrain 8: 64 m front, eight guns, four roof decks, six cargo couriers,
neutral mine/sea machinery and two competing crane boats. The original 87 catalog
slots remain; the complete catalog has 139 actors and 3,254 parts. All controllers
run at 20 Hz and remain editable Lua; transfers and shots use actual physics.
Scouts/couriers cover north, centre and south. Roof centre reserves move to ground
stock so their supply chains have space to start. Geometry review found and
removed one scout/truck wheel overlap; all 12 final sector/stock relocations are
clear in `build/action-front-20260927/layout-sector-review.json`.

Completion requires a clean populated run with repeated combat and actual supply
chains, followed by actual Firefox/Chrome image checks, old-world restoration and
preservation of other images/saves. Do not substitute an idle clean simulation for
spectator action. Owning tasks retain detailed physical evidence:

- `20260927-160200-codex-artillery-supply`: ordinary catalog mechanisms fire at
  48.9/54.7 s successive intervals; both cars/hoists complete two distinct rounds;
  air delivery reaches a gun and fires on a scout-dispatched opposing courier.
  Friendly trajectory, handoff retry/withdrawal and courier sector decisions pass.
- `20260927-163000-codex-contested-sea-cargo`: each team completes the same generated
  mine-pallet chain in focused runs, with measured deck-supported transit and
  successful restoration. Both final harbor controller replays pass.
- `20260927-210000-codex-map-placement`: physical support/collision and all-team
  restrictions, actual UI preview/confirmation/cancel, running installed Lua and
  saved roof height pass. No browser errors.

Integrated evidence is under `build/action-front-20260927/`:

- `full-v3`: 1,200 s, all 139 originals retained, 164 final objects, 15 deliveries,
  scores 7/15, 13 opposing shots, zero faults/removals. Ground reloads generally
  take 32–49 s; five of eight guns fire. Sea pallet 141 passes porter 34 at 31.167 s,
  pier crane 132 at 210.883, shuttle 131 at 258.017, Blue 134 at 656.533, receiver 30
  at 1035.400, scoring eight points at 1065.517. Forklift 48 then stores it physically.
  This predates the final sector/stock layout and safety-check optimization.
- `full-v4`: final sector/stock layout, stopped after 240 s because gun 57 exceeded
  its existing 200,000-instruction budget while evaluating a long trajectory.
  The fault is preserved in `checkpoint-0240.lua`; `checkpoint-0120.lua` precedes
  it. Red hoist and both air suppliers have completed real deliveries.
- `artillery/gun-budget-before` / `gun-budget-after`: the restored 120 s state does
  not reproduce the exact fault. Over 180 s, conservative assembly rejection and
  shared trajectory samples reduce peak instructions for gun 57 from 71k to 24k,
  and gun 76 from 61k to 20k, with identical shot counts and no faults. Budgets,
  sampled trajectory spacing and physical safety rules are unchanged.

- `full-v5`: final layout and optimized gun checks, fresh 1,200 s. All 139
  originals retained, 162 final objects, 13 deliveries, scores 4/16, 11 shots,
  zero faults/removals. The air-supplied Red roof fires; both cars and both hoists
  deliver ammunition. Pallet 141 completes the neutral mine/boat chain at
  1060.617 s for eight points. This run exposed an empty-hook return jam and
  a pair of stacked couriers; focused physical recovery fixes pass.
- `continuation-proof.json`: the final recovery run starts at the actual 600 s
  checkpoint. Recursive comparison finds only eight live embedded controller
  updates (two hoists, six couriers) and their library copies. All other state
  is unchanged, including poses, velocities, cargo and controller memory.

- `full-v6`: final recovery controllers continue the actual 600 s state for
  another 600 s. All 156 starting actors remain, 163 final objects, ten additional
  deliveries, scores 7/15, zero faults/removals. Both formerly trapped couriers
  deliver again; the hoist returns after 9.467 s. The same mine pallet completes
  the whole sea chain at 1064.633 s. Four of eight guns fire in the complete
  20-minute timeline; loaded stations still wait for safe opposing traffic.

Completed package/browser gates: `local-preview-{chrome,firefox}` match all
139 programs/blueprints and check both bookmark pages, team colors/positions,
zero readbacks/errors and clean exit. `checkpoint-restore` restores all 99
objects, programs and tether attachments from terrain 7 and resumes normally.
`final-scene` captures the populated world on GPU. `package-proof.json` verifies
73 canonical sources, six protected saves and the existing catalog; preservation
checks retain 56 other image/runtime assets. Build and its physical checks pass.

Served locally at http://127.0.0.1:9097/slopyard/. Image SHA256:
`9c9941a7f063eccac97109027dda40a49af9c29748e4d6b45d4c56a560b6fe87`.
Checkpoint branch: `codex/slopyard-checkpoint-20260927-action-front`.
Rotated tether reuse/encounter frequency remain in their separate existing task;
this does not claim unlimited ammunition or every station firing continuously.
