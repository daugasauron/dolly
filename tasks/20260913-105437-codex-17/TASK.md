# Show the reasons and dependency scope of image rebuilds

- STATUS: CLOSED
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

## Resolution

`npm run image -- IMAGE --plan` validates the currently pinned recipe closure
and its existing snapshots without preparing sources, changing pins, deleting
artifacts, or launching a browser. It reports the dependency order, reuse/build
reasons, and descendants that must be checked after a parent's output is known.
Normal builds show this plan after source preparation, then reuse its validation
results; unchanged snapshots are not decoded and hashed a second time.

The nine-image default plan took 1.6 s. An isolated real-artifact proof verified
missing metadata, corrupt snapshot digest, changed seed/ABI identity, pending
parent outputs, and a leaf recipe edit. The leaf edit scheduled only default;
the seed/ABI change scheduled all nine. Executing the unchanged plan launched
no browser and left the artifacts intact. Image commands now print timings for
pinning, preparation, inspection/routes, snapshots, and optional packaging.

The read-only plan describes pinned recipes, not unstaged application sources.
It does not silently repin edits or reconstruct archives; selected preparation
and archive reuse remain tracked in task 16.
