# Add a short Chrome and Firefox core regression gate

- STATUS: OPEN
- PRIORITY: 350
- TAGS: audit,testing,core

## Evidence

[`npm test`](../../package.json) starts with a build and then runs a large browser suite.
[The standard browser runner](../../scripts/test-browser.sh) selects Chrome.
A [standalone Firefox concurrent-I/O check](https://github.com/daugasauron/dolly/blob/ff633f72f5f6c28439196d61fe573730c2739ed8/test/firefox-process-io.mjs) exists but is not part of that entry point.

The audit ran 38 focused ABI, HTTP, and session tests successfully, while browser probes still found filesystem and cancellation bugs.
A short behavior gate should be practical to run on routine core edits.

Deeper iteration measurements at ff633f7 (2026-09-13, existing local artifacts):

- node --test test/*.test.mjs passed 335 checks in 32.8 seconds without a build.
- The full browser launcher starts 50 separate Chrome harness invocations on a successful run, counting its loops. Its total duration was not measured.
- npm test first builds the runtime and, with no image selection, the 32-image catalog; then it runs Node tests and the full browser launcher.
- The existing process-smoke mode passed in 19.48 seconds with DOLLY_BUILD_IMAGES=default. It compiles actual C/C++ probes inside Dolly and checks fresh processes, shared files, environment, HTTP, nested Slop, pipes/poll and DSOs.

The fast path already exists as a lower-level invocation:

```sh
DOLLY_BUILD_IMAGES=default DOLLY_IMAGE=default DOLLY_BROWSER_MODE=process-smoke bash scripts/test-browser.sh
```

It requires built artifacts; it does not rebuild images and is currently Chrome-only.
Use a private browser profile/port when another harness is running. This passed
on deployed main's checkout; the current rts-arena worktree has older artifacts.

## Done when

- Make routine verification independent of rebuilding/publishing every image. Provide one documented command that checks existing built artifacts in both Chrome and Firefox, with clear stale/missing-artifact errors.
- Cover ABI admission, filesystem semantics, signals/cancellation, concurrent I/O, and HTTP cancellation.
- Integrate the existing Firefox I/O regression and the audit bug regressions as they become available.
- Keep full image rebuild/packaging verification separate and available.
- Run source-level Node tests without requiring the full distribution. Keep catalog/artifact integrity checks in a separately selected group rather than deleting useful integrity validation.
- Reuse existing process-smoke and other focused modes, selecting only their dependencies; fix the [repeated graph scan](../20260913-105436-codex-13/TASK.md) before inventing another harness.
- Report failures by scenario and record the gate's measured duration.
