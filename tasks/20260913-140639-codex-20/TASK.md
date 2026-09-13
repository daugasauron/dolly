# Avoid cloning gigabytes of image inputs into build Workers

- STATUS: CLOSED
- PRIORITY: 350
- TAGS: audit,bug,core,build

## Evidence

Final system assembly fails in Chrome before the build Worker starts:
`DataCloneError: Data cannot be cloned, out of memory` at image-builder.mjs.
Its four direct inputs total 1.13 GiB. The build helper clones all buffers into
the Worker even though the ordinary runtime boot already transfers them.

## Done when

- Transfer inputs into the disposable Worker and return ownership after import.
- Shared graph dependencies remain reusable without requiring persistent cache.
- Complete the system/default build and verify reuse in Chrome and Firefox.
- Cancelled and failed builds can be retried.

## Resolution

Build inputs now transfer into the Worker and return after their Wasm copies
are complete. No extra cache requirement or graph invalidation path is needed.
System assembly succeeds with all 1.13 GiB of direct inputs (5.6 seconds),
followed by default packaging (2.7 seconds). Chrome and Firefox each complete
a successful build, a failed recipe, and a retry using the same input objects;
every returned input and both successful outputs have identical SHA-256 values.
The regression runs with the existing image-build browser workflow.
