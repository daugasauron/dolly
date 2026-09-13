# Show the reasons and dependency scope of image rebuilds

- STATUS: OPEN
- PRIORITY: 250
- TAGS: audit,build

## Evidence

At `ff633f7`, [build-system-snapshot.mjs](../../scripts/build-system-snapshot.mjs)
swallows missing/malformed/stale-cache errors and starts a browser build without
reporting the failed condition or the dependency that propagated it.
The separate pruning script prints broad reasons, but deletes the old pair before
the image builder can explain it.

Read/decode/recipe-entry validation and SHA256 of the eight cached default
snapshots took **2.52 seconds** for **2,175.78 MiB** on this host. This was a
read-only reproduction of the validation work, not a timed end-to-end image build.
A user cannot currently preview whether an edit needs this check, a leaf rebuild,
or the expensive Rust/application chain.

## Done when

- Show the selected dependency order and per-image decision before starting builds.
- Report the concrete changed input, seed/runtime identity, dependency output, absent file or invalid artifact that requires rebuilding.
- Provide a read-only way to inspect the plan, without deleting artifacts or launching a browser.
- Report phase and per-image durations; retain fail-closed artifact checks.
