# Populate the islands with learned working machines

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: game,distribution

Bundle the live Pi's Postbird magnetic flight courier and separate crate,
Westwatch scanning beacon, Twinspire patrol boat and Mooncalf hinged-knee walker.
Preserve their tested blueprints/controllers and island placements. Existing
saved worlds and the complete live conversation must remain intact.

Verify a fresh browser world has all 26 objects/546 parts without model access.
Measure the courier lifting its own crate above the island, carrying it and
releasing it; check the beacon's moving head and anchored base, boat patrol,
walking, and restoration without duplicate cargo. Capture actual GPU views.

## Verification, 2026-09-15 03:43 JST

The C image compiled inside Dolly and the focused browser integration passed
under a 4 GiB/no-swap scope. Ten saved samples over 30.65 simulation seconds
retained 26 objects/546 parts with zero removals or model requests. All three
magnetic machines lifted distinct crates while sharing one Cargo library entry.
Postbird carried its crate to y=6.339 above the island floor at y=4, released
it about 3.9 m from pickup, then reacquired it for return. Westwatch's head swept
82 degrees with zero base displacement. Mooncalf reached 17.41 m from its start
before reversing; Twinspire reached 14.28 m and remained afloat/upright.

The longer observation exposed an old test that checked the large walker's
distance only at the final sample: it had already returned toward home. The
check now accepts measured travel in any sample. Saved-world identities, loaded
magnetic attachments, explicit empty-world loading and the existing real physics
checks passed. No application code changed beyond the bundled design data.

Five actual GPU views passed with all objects retained and simulation matching
wall time. Measured rates were 34–43 FPS while the live Pi world also ran;
these short observations do not isolate GPU cost. The courier, beacon and boat
images were visually inspected. Evidence: `build/slopyard-island-starters-build.log`,
`build/slopyard-island-starters-integration.log`,
`build/slopyard-island-starters-proof.json`, `build/slopyard-islands-gallery.log`
and `build/slopyard-islands/`. All test browsers exited. The existing live
world/full conversation were not migrated or modified by this starter update.
