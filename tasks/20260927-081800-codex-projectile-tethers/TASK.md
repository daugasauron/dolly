# Launch, ground and recover independent magnetic tether rounds

- STATUS: CLOSED
- PRIORITY: 90
- TAGS: game,combat,physics

A separate magnetic projectile catches an opposing aircraft, deploys a handle,
and lets an ordinary ground tug haul it down. Release only after real support;
then prove independent recovery or physical collection and settled scrapyard
disposal. An ordinary supplier must retrieve, load and fire the same returned
round again. Preserve friendly safety, save/restore and populated-world behavior.
No forced attachment, stronger hidden forces, actor-ID rules or weaker opponents.

## Checkpoint boundary

The catalog retains its four-part Kusari and terrain-8 launchers. The passive
five-part handle, terrain-9 launcher changes, observed-COM aiming and slower
descent remain private experiments. They must not enter the checkpoint merely
because an isolated case succeeded. The canonical controller pair and retained fixture pass against that four-part
catalog. The five-part-only wing fixture is archived in the evidence directory;
no repeated ammunition reuse has been established.

Controller work frees stalled slack cable by reeling taut before paying out,
queries ground at the endpoint, and broadcasts actual hauling/release to
collectors. The tug approaches with its fork, latches alignment gear, checks
shore support, follows observed allied self-claims and returns supported rounds.
It records only unheld supported stock and rejects obstructed saved return bays.
The original forces, support threshold and 180-second capture abort remain.

## Verified evidence

Paths below are under `build/overnight-20260927/tethers/`; C fixtures compile and
run inside browser Dolly wasm64 with a 4 GiB disposable-browser scope.

- `lifecycle-checkpoint-collection-v2`: exact canonical four-part round and
  controllers pass the retained fixture. Capture 0.017 s, 30.4 m payout, actual
  tug grip, externally supported victim release 18.867 s. At 31.150 s the
  returned round has remained supported, unheld, folded and below 0.3 m/s for
  a full second. The opponent later regains sustained independent flight at
  387.300 s; the approaching unchanged collector never grips it. No faults or
  deaths. Folding above the nominal 1.15 m cable length requires actual contact
  between the endpoint and main body. Return acceptance records the completed
  physical event, not a later instant when passing traffic can nudge it.
- `deploy-final-v1`: actual terrain-8 wing jam, all 144 original actors retained;
  only four controller strings changed. The existing four-part handle frees at
  about 139 s and reaches ground at 148 s, without faults or removals.
- `pickup-final-v1` / `pickup-align-v1`: exact 156-actor state. Per-tick gear
  selection stalls around 90 degrees; latching alignment gear permits a real
  grip around 691.5 s, still held at 700 s. No actor/pose/force changes.
- `lifecycle-stock-v1`: staged five-part round (1.140841 kg, two bodies) clears
  the wing at 23.733 s, deliberately releases a supported victim at 25.567 s,
  and the unchanged collector physically carries/releases it into the scrapyard,
  where it settles on support at 477.217 s. The round finishes supported,
  stopped, folded and unheld. This proves retrieval readiness, not reuse.
- `encounter-24-n18-v1`: actual supplier-loaded five-part round fires at
  102.217 s and captures the unchanged enemy at 104.883 s. Other retained matrix
  cases include a hit without capture, a miss and two accidental loaded losses;
  one favorable shot is not general interception reliability.
- `encounter-salvage-v1`: all seven actors continue unchanged from that capture;
  the collector carries the victim, releases inside its yard at 279.450 s and
  it settles with support at 285.517 s. The actual launched tether detached
  through spring separation, so this is not controller-supported release.
- `return-portals-debug-v1`: the tug had remembered the occupied gun cup as
  stock; 28 existing inflated obstacle bounds block that destination.
  `return-portals-clear-v1` changes only the tug source in the actual seven-actor
  state: supported release at 635.700 s, folded/unheld/stopped round at 636.750 s.
  `stock-initialize-v1` also rejects a gun-held round as fresh loose stock.

The returned round in `return-portals-clear-v1/returned-ready.lua` lies beneath
an industrial beam. Logistics' ordinary aircraft reaches it but physically hits
the beam; an added ordinary ground supplier reaches the vicinity but has not
completed retrieval. Preserve this exact eight-actor continuation in
`../logistics/returned-ground-v1/diagnostic-after.lua`; do not reposition the round
or preseed the supplier's memory to claim reuse.

## Rejected descent candidate and remaining blockers

`descent-portals-soft-v1` reduces reel-in while falling and achieves one real
supported release at 159.417 s followed by independent flight. However,
`lifecycle-descent-diagnostic-v1` rejects that same candidate: at 90.517 s the
victim bottom is 0.933 m above the floor, independent support is zero, and the
only upward contacts are against the projectile magnet (9.58 N and 5.90 N).
The controller incorrectly calls that grounded. The strict support assertion is
retained, and the candidate remains private. The saved failure and source are
`lifecycle-descent-diagnostic-v1/lifecycle-stall.lua` and
`kusari-soft-descent.lua`; no new grounding heuristic was adopted.

The staged five-part handle also hits its launcher's fixed base during a low
sweep: `encounter-parts-north-v1` records handle part 4 against gun part 10 at
106.050 s and 20.28 m/s. Moving terrain gates clears their earlier obstruction
but does not solve this self-contact. Root owns launcher/catalog work; logistics
owns rotated ground/roof handoffs. Raised-gun trials are not checkpoint content.

Finish those physical clearance/supply failures and reliable supported release,
then continue the preserved returned round through supplier → loader → gun →
second shot. Finally verify repeated populated-world encounters and save/restore.
The earlier four-part supported shot is retained in
`build/combat-20260927/tether-offset14`; ordinary projectile effects have their
separate task `20260928-013500-codex-artillery-effects`.

## Closed (2026-10-01)

Closed. The catalog keeps the four-part Kusari round; `slopyard-tether-lifecycle.c`
runs in `slopyard-browser.mjs` and passes (capture 0.017 s, ground handle held,
supported release 18.9 s, retrieval-ready return 31.2 s). Reuse of a returned
round was never established, and the five-part/terrain-9 experiments and their
evidence are gone. Repeated tether rounds are one line in `20261001-223000-slopyard-living-world`.
