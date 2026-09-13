# Stop repeatedly expanding the same Dollyfile dependency graph

- STATUS: CLOSED
- PRIORITY: 350
- TAGS: audit,core,build,testing

## Evidence

Measured on deployed main `ff633f7` on 2026-09-13, using existing local artifacts.
Calling `inspectStaticSources(projectDir, await discoverImageDefinitions(projectDir))`
took 6.7 seconds; an instrumented repeat took 7.3 seconds, with **53,274 readFile
calls for 223 unique paths**. It read 1,033 MiB, including 729 MiB of static inputs.
The same inspection restricted through `selectImageDefinitions(definitions, "default")`
took 0.39–0.44 seconds.

[loadDollyfileGraph](../../scripts/dollyfile-graph.mjs) expands the referenced image
again for every COPY path. Its `seen` map deduplicates the result list, but does not
stop recursion. `recipeRecords` also visits descendants before checking `seen`.
The catalog scan read bootstrap.dm 4,272 times and ghostty.dm 3,418 times.
A single default graph is only 62 ms; catalog-wide repetition makes this costly.

The [browser harness](../../scripts/browser-harness.mjs) scans before validating
the requested mode, including when DOLLY_IMAGE selects one image. The invalid-mode
Node test took 9.3 seconds in the concurrent suite despite never starting Chrome.
Source and retention tests repeatedly load the same graphs too.

## Done when

- Read and parse each recipe once per inspection operation; avoid rebuilding identical artifact subgraphs.
- Preserve ordered USE scope, caller-dependent exports, every edge's pin validation, cycle/depth rejection, and recipe-lock order. A global cache of mutable context-bearing records is insufficient.
- Validate modes before asset inspection; select the required image closure for ordinary browser scenarios.
- Reuse graphs within a test/inspection pass; keep catalog-wide integrity validation available.
- Measure catalog/default inspection again and run existing graph, pin, retention, and browser checks. Do not replace hash validation with source-text assertions.

## Resolution

Implemented on `codex/core-iteration-20260913` in `work/core-iteration`. Parsed
recipes are shared within each inspection; completed artifact subgraphs are reused
without reusing caller-dependent module scopes. Removed unused graph bookkeeping.
Every edge still checks its pin and depth; recipe-lock ordering is unchanged.
Ordinary browser modes inspect their selected image closure; catalog modes retain
the full catalog. Invalid modes fail before source inspection.

Measured 2026-09-13 with the same built artifacts: catalog inspection **223 reads
for 223 paths, 0.62 s**; default closure **135 reads, 0.20 s**. Full Node verification
passed **334/334 in 8.70 s** versus the 32.84 s baseline. New behavioral cases cover
a stale pin on a later COPY, repeated USE under different providers, and a cached
artifact referenced beyond the depth limit. Existing snapshot checks verified all
32 retained recipe chains, entries and hashes.

Chrome passed process-smoke (19.04 s), the catalog menu (1.09 s), and Pi-based
v3-iteration (26.43 s), including source edits, cache reuse/invalidation and IndexedDB
rollback. The iteration fixture assumes Pi; its default-image invocation failed
on that fixture assumption, so verification used the existing supported Pi mode.
The last small release-loader and test-cache edits passed their focused Node checks.
