# Collect incapacitated enemies into physical scrapyards

- STATUS: CLOSED
- PRIORITY: 270
- TAGS: game,controllers,physics

Add visible salvage machines for each team. They should find grounded, stalled,
overturned opponents after a tether releases, magnetically pick them up and
carry them to the team's scrapyard. Release them there without deleting bodies
or changing enemy physics. Healthy enemies, teammates, neutral machines and
cargo are not scrap. Claims, pickup deadlines, wrong-grip release and location
exclusion should prevent fighting another teammate or repeatedly collecting an
already deposited wreck.

Implementation uses an editable Lua skycrane program and ordinary thrusters,
winch and magnet. The new map exposes scrapyard coordinates and floor height.
Verify actual opposing-aircraft pickup, transport and release with Box3D inside
Dolly, friendly/healthy exclusions and a second job after release. Record the
populated-world behavior, browser smoke and saved-world restoration before
closing. Evidence: `build/combat-20260927/`.

`salvage-v1` (600 simulated seconds, real browser/Dolly wasm64, September 27):
the 10.496 kg collector grips an overturned 9.811 kg enemy courier at 26.533 s
and releases it inside the East scrap pit at 66.917 s. It then grips a second
at 92.933 s and releases inside the same pit at 184.017 s. The closer overturned
friendly courier and a healthy upright enemy are never grabbed. All five
actors survive without controller faults; neither deposited wreck is picked
up again through 600 s. Test opponents use their actual courier geometry with
passive controllers to isolate the physical collection sequence. Their stopped
programs are fixture setup, not a production restriction on captured enemies.
The terminal evidence is `build/combat-20260927/salvage-v1/terminal.log`.

The first run exposed a piled-wreck case: the second release was the deposit
phase's deadline, because its altitude target assumed an empty pit. Deposit now
uses observed external part-contact support, reduces lift as the pile takes the
weight and releases on sustained support inside the yard.

`salvage-v2` repeats the 600-second physical fixture with stricter checks: two
normal controller-completed deposits, not deadline releases. Releases occur at
66.917 and 134.367 s; the second is 49.65 s earlier. There are zero friendly or
healthy grabs, faults, removals or repeated pickups. A save/reload preserves all
five actors and both deliveries; simulation resumes for another two seconds
without reattaching. The complete world, trace, events and summary are under
`build/combat-20260927/salvage-v2/`.

The focused fixture isolates physical transport and safe deposition. The
populated runs below verify interaction with ordinary active opponents; an
unbroken natural interception-to-salvage sequence is not claimed.

`full-v9` supplies a naturally occurring contested capture with every controller
active. East Kurogane (86) grips West Hibari (39) at 420.350 s. West Benkei (45)
physically grabs its teammate at 422.883–433.017 and again 577.550–607.667 s.
The 600 s saved world has Benkei holding Hibari while East's crane remains
attached above it; the crane cannot complete transport and releases at its
carry deadline, 687.667 s. West Tsuru (85) later grips Hibari at 803 s and remains
in its settling phase at 900 s. This is a real opposing-team capture and rescue
contest, not a completed scrapyard delivery. The two other overturned guards
weigh 25.41 and 42.45 kg, above the collector's 17.5 kg lift selection limit.

`salvage-active` keeps both enemy couriers' complete normal flight/recovery
programs active from their initial inverted poses. Both physically right
themselves and reach their normal 32 m cruise height by 60 s; at every minute
through 360 s they remain upright with recovery mode cleared. The collector
correctly never grabs them, nor the closer friendly or healthy control actors.
All five actors save, restore and continue without faults or removals. The first
fixture reported status 1 because it required a deposit even when no enemy
remained incapacitated. Its revised criterion recognizes either actual normal
deposition, or both aircraft independently sustaining upright unheld flight
for 30 seconds with zero collector grabs. It never disables their controllers
to manufacture a capture.

`salvage-active-v2` passes the revised physical recovery checks: both initially
inverted couriers sustain 30 seconds of upright free flight, zero collector
captures, all five actors restored and two further seconds without errors.

`full-v11` verifies a completed collection in the populated world with ordinary
active programs: East Kurogane (86) grips West Hibari (39) at 210.850 s and
performs a normal scrapyard release at 369.867 s. Its persistent delivery count
is one; Hibari is inside the yard at release and later rests at its boundary
near (78.1,14.7). This is a captured walker, not evidence of a naturally
intercepted aircraft being scrapped. The 900-second world finishes with all 87
original actors, 103 total objects, no controller faults/removals and eight
cargo deliveries (team scores 3/12). Await packaged-browser verification before
closing.

Closed after actual 9097 Firefox/Chrome checks: all 87 programs/blueprints match,
terrain 6, no errors/readbacks, clean exit. Firefox restores new terrain-6 and
old terrain-5 worlds with programs/attachments intact and >16 s continued play.
Evidence: `build/combat-20260927/{local-preview-firefox,local-preview-chrome,checkpoint-restore,noon-restore}`.
`package-proof.json` and `preservation.log` verify 69 source files, six protected
saves and 56 unchanged unrelated assets. Projectile reuse remains separately open.
