# Make catapult hits interrupt cargo flights

- STATUS: OPEN
- PRIORITY: 60
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
are retained in `build/slopyard-compound-regressions-chrome-payload-defense/`
`salvage/`; log `build/slopyard-payload-defense/trial.log`. No full terminal
trace/result was exported before stopping.

The next trial changes only yard gun87's program, leaving its body, loader,
ammunition and opponents unchanged. It covers the earlier completed courier
route. Inputs: `build/slopyard-payload-defense/{yard-catalog.json,yard-defense.c}`;
output `build/slopyard-compound-regressions-chrome-payload-yard/salvage/`.
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
`build/slopyard-payload-defense/payload-comparison.c`; candidate:
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
`build/slopyard-compound-regressions-chrome-payload-couriers/salvage/`.
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

Precision replay completes466.017→586.017s in both branches, raw failure1.
Baseline fires90 at473.600s, misses121 and hits the aircraft instead. Candidate
fires at472.867s and hits121 at474.150s, approach speed16.026m/s. Cargo maximum
sampled speed rises2.619→6.467m/s, but its grip survives and both branches deliver.
First releases561.833/558.833s both have magnet power0. Each branch retains125
objects; no errors, missing originals, deaths or friendly impacts. Full trace and
both final worlds: `...-chrome-payload-precision/salvage/`.

Prepared next physical variant: yard87 uses the existing channel battery's
87-part longer arm and taller mast, with unchanged700Nm motors and100N magnet.
The longer geometry preserves the loading height. Existing courier backoff and
precise payload aiming remain; all other bodies/programs match image41. Inputs:
`long-arm-catalog.json`/`long-arm-defense.c`, maximum600s from a fresh world.
Running as payload-long-arm; require a real powered-magnet cargo ejection, not
merely another hit. Image41 remains unchanged.

Long-arm trial completes600s, raw failure1:124 objects,16 deliveries, no errors,
missing originals, deaths or friendly impacts.91 hits80 at299.300s at20.042m/s;
90 hits81 at592.967s at20.605m/s, and the carrier at21.362m/s. Three payload-contact
events, no powered grip loss.80 is still delivered at379.767s;81 remains held at
the end. Courier59's own delivery-memory counter is0, but authoritative delivery
events and cargoDelivered record its completed80 delivery. Do not mistake that
controller statistic for denial. Full trace: `...-chrome-payload-long-arm/salvage/`.

Central-hit replay uses `center-comparison-catalog.json` and
`center-comparison.c`, using the natural466.017s light encounter. Baseline is the
precise program forced to20Hz; candidate uses60Hz and0.17m center
tolerance. Bodies/forces remain identical. New diagnostics record contact normals
and the actual magnet-pole/attachment-point gap, to distinguish swinging from
separation. A hit alone still fails the disruption gate.

Both branches complete586.017s, raw failure1. Candidate hits121 at486.667s at
23.675m/s with a nearly horizontal contact normal, but sampled grip gap peaks
0.806m, below the existing1.2m break distance. It then hits friendly loader107
twice while airborne (14.602/1.936m/s). Both branches deliver121;125 objects each,
no missing actors/errors/deaths. This candidate is unsafe and remains unbundled.
Evidence: `...-chrome-payload-center/salvage/`.

Rate audit: the original gun and previous precision replay already run at60Hz.
The20Hz baseline in this fixture was an incorrect assumption, so this pair changes
both rate and tolerance and is not a comparison against the previous precision
baseline. The candidate's failed ejection and friendly impacts remain direct
evidence. `center-60-comparison.c` corrects the rate for a future comparison; unrun.

Beam spin-up comparison completed277→397s in both branches. Aligning yaw before
spin and reserving20% magnet force delays grip loss280.217→289.417s, but both
branches produce zero shots/hits/drops/friendly impacts. Both deliver target80.
The candidate's best predicted miss0.713m exceeds its0.56m release gate; grip load
still reaches100N. No errors/losses/deaths. Full trace:
`...-chrome-payload-beam-spin/salvage/`. The C fixture exits1; the Xvfb wrapper
exits5 after exporting all artifacts. Its sole leftover Xvfb process was stopped.
Beam ammunition and these gun programs remain experimental and unbundled.
