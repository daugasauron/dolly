# Make catapult hits interrupt cargo flights

- STATUS: OPEN
- PRIORITY: 260
- TAGS: game,combat,cargo,controllers

Image41's channel battery hits aircraft, but those impacts have not demonstrated
cargo loss or useful delivery denial. Prefer loaded enemy aircraft over surveyors
and aim at the carried payload using the same physical ammunition, magnets and
motor limits. Keep friendly clearance and all opposing controllers intact.

Completion requires a real projectile contact and loss of the carrier's magnetic
attachment while aloft, with its magnet still commanded on. Compare from the same
pre-shot state to distinguish impact from a normal delivery or unrelated drop.
Then verify populated continued play, cargo recovery/resupply and retained saves.
Do not invent damage, force a detach, teleport cargo, delete opponents or disable
their stabilization. Keep the aiming controller editable on the character.

First diagnostic changes only106's program. At900s: no shots,20 deliveries,
no reported deaths. A courier stalls over122 from598.1 because truck111 keeps its
traffic-clearance altitude above pickup reach (task20260925-195200). Gun106 has
never selected a loaded enemy. The run was stopped after exporting900s; it is not
an1800s failure/pass or evidence that payload impacts work. Three progress saves
are retained in `build/blockwalker-compound-regressions-chrome-payload-defense/`
`salvage/`; log `build/blockwalker-payload-defense/trial.log`. No full terminal
trace/result was exported before stopping.

The next trial changes only yard gun87's program, leaving its body, loader,
ammunition and opponents unchanged. It covers the earlier completed courier
route. Inputs: `build/blockwalker-payload-defense/{yard-catalog.json,yard-defense.c}`;
output `build/blockwalker-compound-regressions-chrome-payload-yard/salvage/`.
Maximum600s, with physical hit/drop evidence required, no missing original actors,
controller errors, deaths or friendly projectile impacts. Await terminal evidence.
The playable image41 remains unchanged.

Yard trial completes600s, raw failure1 (wrapper5 from Xvfb cleanup):125 objects,
no controller errors/missing originals/deaths/friendly impacts. Gun87 fires91 at
482.750s, hits carried parcel121 at484.733s, approach speed13.102m/s. Courier59's
magnet remains powered and attached; it subsequently delivers121. This proves a
payload hit, not disruption. `payload-hit.json` preserves the actual impact state.

The earlier opportunity against80 has best predicted miss0.746m but the firing
threshold is0.56m: it counts payload radius alone, omitting the projectile radius.
Prepared candidate uses the sum of both radii, capped at the existing1.15m, and
raises requested motor speed from70% to95% of the existing configured maximum.
The separate80%-of-magnet-force centripetal limit and1.2rad/s² acceleration ramp
remain. This changes control commands, not motor forces, body masses or magnets.

Matched120s baseline/candidate replay now starts from the actual300s yard save,
when gun87 holds91 and courier59 carries80. Only87's program changes. Fixture:
`build/blockwalker-payload-defense/payload-comparison.c`; candidate:
`energy-comparison-catalog.json`; output `...-chrome-payload-energy/salvage/`.
Require a real payload hit and subsequent airborne grip loss while the carrier's
magnet remains powered, absent in baseline, plus no actor losses/errors/friendly
impacts. Await terminal evidence. The radius-only fresh candidate remains unrun.

The300→420s comparison fails the disruption requirement. Baseline fires zero;
candidate fires91 at312.617s and contacts heavy parcel80 at314.583s, approach
speed19.246m/s (also a1.762m/s contact with carrier59). Neither branch loses the
payload before normal delivery. First releases364.817/364.417s both have magnet
power0. Candidate payload maximum sampled speed4.229m/s versus baseline2.604.
No errors, missing actors, deaths or friendly impacts. Both final saves and full
0.1s payload traces are retained. This is better interception, not air denial.

Next paired replay starts at420s from that unchanged baseline, before the light
parcel121 pickup. Candidate now requests full configured motor speed and retains
a95%-of-magnet-force centripetal bound, with the same acceleration ramp. All
physical forces, bodies, ammunition and opponents remain unchanged. Inputs:
`{fullspeed-comparison-catalog.json,payload-light-comparison.c}`; output
`...-chrome-payload-light/salvage/`. Each branch runs120s. Require powered-magnet
cargo ejection after a projectile hit; a normal depot release does not count.

The420→540s light-parcel comparison is inconclusive for ballistics, raw1. Neither
branch fires or gets a loaded-aircraft opportunity; both retain identical final
poses for59,87,111, with no errors, missing actors, deaths or friendly impacts.
Tender111 collects121 before the courier, which normally abandons that job and
returns home (phase began460.583s). At540s the tender is lowering121 in its bay.
This is competing ground retrieval, not a renewed aircraft traffic deadlock or
evidence against the full-speed throw. Do not force the parcel into the aircraft.
Full results: `...-chrome-payload-light/salvage/`. A fresh populated test with the
existing courier traffic backoff will need to provide a natural next opportunity.

Fresh populated test now runs `courier-defense-catalog.json`/`courier-defense.c`:
only59/60 gain the previously tested traffic backoff, and87 gains payload aiming
with full configured speed and the95% magnet-force bound. All111 original designs
and other programs remain. Maximum1800s; requires an actual hit followed by grip
loss aloft while the carrier magnet remains powered, then60s further observation.
Exports300s progress and the first armed light-payload encounter, so the next
comparison can use a naturally occurring shot opportunity. Output:
`build/blockwalker-compound-regressions-chrome-payload-couriers/salvage/`.
Do not edit these frozen inputs while the trial runs; image41 stays playable.

Early live checkpoint:119 actors, no deaths at300s. First loaded-target save
exports at277.500s:87 is spinning with91 while59 lifts80. The candidate fires at
285.633s with predicted miss1.022m, flight1.49s and velocity(3.012,13.709,−20.944);
no payload hit is counted by300s. The expanded radius tolerance admitted this
miss; do not promote it based on the geometric estimate.

Prepared tighter comparison, not run: `precision-comparison-catalog.json` returns
to the original target-radius tolerance while retaining full motor speed/95%
force bound. Reuse `payload-comparison.c` on the actual277.500s
progress-defense-target.json. Baseline remains the original70%-speed payload
program.

Stopped the fresh trial for the user's stable-checkpoint request after retaining
progress-payload-1200.json:130 objects, all111 originals,23 deliveries, no controller
errors/deaths. Three shots and three payload-contact events, no forced grip loss
or friendly impacts. This is an interrupted diagnostic, not a completed1800s
pass/failure; no final full trace was exported. Saved progress and log remain.
The natural armed light-payload save at466.017s is the better next comparison
input: gun87 holds90 while courier59 lifts121. Precision comparison remains unrun;
image41 and all physical blueprints are unchanged.
