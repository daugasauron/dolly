# Restore inactive cargo links and share artillery resupply

- STATUS: OPEN
- PRIORITY: 30
- TAGS: game,physics,controllers,performance

Audit dock, foundry/barge, mine/ferry and ammunition supply roles. Reconnect useful
existing units through ordinary controls, observed geometry and team radio.
Every battery needs both air and ground recharge. Recover stray rounds without
increasing population or actuator force. Root owns catalog/terrain and sea-salvage
boats; logistics owns shared suppliers, loaders, hoists and major cargo chains.

Evidence below is under `build/overnight-20260927/logistics/`. Historical rejected
experiments remain there; they are not completed fixes. Completion requires real
physical chains, measured controller cost, no faults/removals, all-station route
coverage and an integrated browser/performance check.

Checkpoint September28: foundry/Shio fixes below are committed; shared-fleet
terrain9 work is unfinished and excluded from the terrain8/four-part production
catalog. Hayabusa, Koban, Komatsu and Yagura were restored byte-for-byte to their
production-proven HEAD sources. Exact candidates, patch and SHA-256 manifest
remain in `checkpoint-20260928/`; all actual saves and source archives remain.
Do not regenerate a production package from the private terrain9 stage.

## Verified and committed

`fd13951`: Shio's conservative shore prefilter produces identical128 actuator
outputs across33 actual saved states. Mean Lua instructions8394→7333 (-12.6%),
peak11000→9000. These static controller costs are not whole-frame percentages.
The original mine pallet141 passes porter34→pier132→neutral boat131→Blue boat134
→receiver30→island score1064.633 s. Working mine/sea machinery was preserved.

`411b749`: the original foundry home(-52,52), mass, forces and actor state are
preserved. `foundry-low-retreat-v1` resumes the actual4500 s fourth-cycle jam;
lowering the existing mast during stalled withdrawal clears the loading plinth.
The same pallet177 reaches the quay4661.567 s, but minimum lift travel leaves it
centimetres above support. `foundry-soft-v1` resumes that actual5100 s save,
reducing analog magnet strength near the floor while retaining support-based
release. Pallet177 releases5104.583 s with independently measured support2.104×
weight/no floor gap, passes quay26→West barge28→receiver30 and scores5497.283 s.
Natural178 is collected5272.567, released5435.333 with support1.842×weight and
scores on East island5861.833. Natural179 also receives a supported quay release;
180 is collected5963.600 and remains in transit. Zero faults/deaths. Loaded
controller mean4958 instructions, peak5000. Frozen source SHA-256:
`771cdf7e19fed49db2fb096f8a43748d39da0445f6ff509f81efedb99c2fd1f4`.
Earlier saved continuations separately score original140 and natural165/168/176.

## Verified staged ammunition mechanisms

Staged ammunition is the passive five-part Kusari:1.140841 kg, two physical
bodies, reflected Blue geometry. Strict completion requires supported supplier
jobs plus the same round's real loader/gun custody; timeout drops never pass.

`air-native-v1` passes all8 chains on the optimized engine/latest staged terrain9:
Red/Blue Tengu87.217/90.267 s, Hosen93.567/99.417 s,
north147.917/159.917 s, south150.917/165.917 s. `air-inner-v1` revalidates
reserve placement at±75,-6 (aircraft±80,6,0): strict2/2 in84.167/90.267 s.
The original±85 reserve proof remains in `air-matrix-v1`. Aircraft captures the
exposed primary assembly rather than the free handle. Loader geometry derives
signed travel and uses observed oriented boxes for magnetic pickup/handoff.
Frozen loader `koban-native-eight-air.lua` SHA-256:
`8b59a0e91316a8be5b422741a45163369dd4cd1746b91cb1fc2104e30af618f3`.

`air-owned-v1` preserves all7 actors from the actual577.217 s capture chain,
changing only the aircraft source. It abandons a stale job now held by a teammate;
the tug retains uninterrupted custody through589.217 s, with no faults/deaths.

`hoists-v6` proves all4 taller hoists make supported roof deliveries. Both north
stations reach their guns56.717/56.767 s. `blue-hoist-column-v2` continues the
actual rotated car delivery: observing the surface under the hook, rather than
an adjacent high handle, gives pickup362.433→supported roof placement379.433 s.
The actual Red counterpart releases supported367.033 s. Ordinary taller masts
and explicit sideways reach are staged; forces and maximum piston travel remain
unchanged. `hoist-clearance-fragments.lua` contains all4 physical designs.

`red-roof-native-v1` fixes the exact Red rotated roof stall: actual pole-to-box
distance was0.700 m, outside native0.65 m reach despite an apparently reachable
AABB. Ordinary rail approach grasps120.383→gun143.950 s. `red-car-native-v1`
fixes the same0.663 m miss after a real car job: pickup300.433→gun323.333 s.
Loaded loader means5220/4672 instructions, peaks11000. `blue-roof-handoff-v1`
changes only the actual loaded Blue south loader source and reaches gun59.767 s.

`car-yard-v1` tests the same cars at±80,0/reserves±75,-6. Simpler `komatsu-v15.lua`
makes supported jobs on both sides (by100/220 s); the larger COM-face pickup
experiment makes neither and was reverted. The controller uses measured generic
wheel differential speeds, a bounded terrain planner and observed station bays.
`blue-car-receiver-v1` changes only the loader in the actual253.817 s Blue
end-grip save. The observed receiver pole, rather than the nominal cargo centre,
permits a supported release266.417 s and real gun capture268.833 s. Loaded mean
5321 instructions, peak6000. This private candidate has not passed integration.

The fresh420 s `ground-matrix-v1` is only2/8: Blue Tengu253.067 s and Red
Hosen382.533 s pass. Red Tengu's captured end hangs vertically and jams before
the cup; Blue Hosen rests passively on the gun without magnetic custody; Red
north's rotated roof round has no selected reachable primary face; Blue north's
fork presses into a terrain post; Red south releases onto support outside the
magazine; Blue south reverses into its hoist base. These are actual failures,
not missing test coverage. Frozen source: `ground-receiver-source-v1.tar`.

The final bounded continuations change one controller source each, preserving
every other saved field. `blue-south-clearance-v1` avoids reversing into the
hoist base: supported car release408.933 s, hoist grasp424.317, supported roof
release440.833, loader grasp456.633 and gun custody475.533. Car loaded mean7923
instructions, peak9000. The same private clearance candidate moves Blue north
off its post but does not reach the station. `blue-hosen-support-v1` still makes
no pickup. `red-south-support-v1` correctly retains the off-bay round instead of
counting a supported but misplaced delivery; it does not complete the route.
All four runs retain every actor with zero faults/removals. None is promoted.

## Remaining work

- Complete all8 ground routes, including shared-yard→roof-hoist legs. Every air
  route passing does not establish ground accessibility or concurrent dispatch.
- Finish the six fresh ground failures above; retain physical custody/support
  checks and verify loaded gun/spare-stock clearance before integration.
- Verify simultaneous requests, ground/air claims and service fairness. Keep
  the final yard clear for both car and aircraft, which currently share homeXZ.
- Reuse the actual launched/captured/disposed/returned round. `returned-patrol-v1`
  exposes a home-distance patrol bug; its minimal fix reaches the real round but
  descent physically hits a factory beam. `returned-ground-v1` adds one ordinary
  catalog car at(80,0), preserving all7 original actors/controllers. It reaches
  the area but its fixed staging point is unreachable; no pickup yet. Generic
  clear-staging and air descent-clearance candidates remain private.
- Root owns private boat-salvage correction/proofs. The original candidate floats
  and makes one pickup, but fails the delivery chain; no success claim.
- Team strategy owns Kawasemi22's dock-output continuation and its separate
  `20260928-023000-codex-dock-output` task. Its repair is separately committed
  `6aa370f`: actual Atlas→courier→supported island delivery88.417 s; only courier
  relocation is needed, not cargo23's earlier proposed move.
- Run the combined populated map, confirm no controller faults/removals and
  retain FPS headroom. `station-coverage.md` tracks exact per-route coverage.
