# dolly-image-0.wat carries two items with nothing in them: an export no host calls and a parameter that must be 1

- STATUS: CLOSED
- PRIORITY: 70
- TAGS: audit,core,abi,cleanup,0.1.8

From the core audit of 2026-11-16 (`work/audit-1116`, source of `b09b1e243`). First proposed by
the kernel audit of 2026-11-01 (`tasks/20261101-074306-audit-kernel`, "two exports that carry
nothing": "Dropping both changes the image contract, an image input: a catalog round"); that task
closed without a task for it, and the 0.1.6 and 0.1.7 catalog rounds passed without it.

## Closed (2026-11-19)

A seed change. It is in the 0.1.8 integration (`ff0ae4e7d`, ws/modules), and the round
`dolly-round-018k` (`work/integrate-018`, `8d666a4e4`) built the runtime and the whole catalog
on it (images passed 08:03, the compiler stage at its fixed point). `abi/dolly-image-0.wat` has
neither item, and nothing outside `tasks/` names them. On `fix/rc-core` with that round's
runtime and images: `test/image-browser.mjs` passes in Chrome (150 s) and Firefox (176 s),
`test/host-compute-browser.mjs` in both. Donna's task `~/dev/donna/tasks/20261117-033130`
lists the change for its host. The next round rebuilds the catalog on this runtime again.

## Change (2026-11-17)

Done on `ws/modules`: `abi/dolly-image-0.wat` has no `dolly_snapshot_format_version` (removed
from `kernel/system-snapshot.c` and `.h`, `test/image-browser.mjs` and
`test/fixtures/image-roundtrip.c`), and `dolly_process_bootstrap_resume_prepare` takes the
staged size alone (`kernel/dolly.c`, `site/build-worker.mjs`). The image contract is an input
of the image build ID, so every image rebuilds: the 0.1.8 round's. On `ws/modules`, with the
runtime and the core's images rebuilt (43, image inputs `f3edb8bb…`), `test/image-browser.mjs`
(the image codec, build inputs, the in-page builder), every build `FROM` a base (which loads
its builder with `resume_prepare`: the core suites' `workbench()`, `custom-session-browser.mjs`)
and the build suites (`host-compute-browser.mjs`, `default-browser.mjs`'s
composed builds) pass in Chromium and Firefox (logs `work/modules/build/modules-tests/e/`).
## Found

Of the 65 functions the kernel's contracts export (`abi/dolly-supervisor-0.wat`,
`abi/dolly-image-0.wat`, `host/*/dolly-*-0.wat`), one is called by no host: a grep of `page/`,
`host/`, `site/` and `scripts/` for each name finds every other one
(`work/audit-1116-evidence/core/contract-funcs.txt`).

- `dolly_snapshot_format_version` (`abi/dolly-image-0.wat:7`, `kernel/system-snapshot.c:167`)
  returns `DOLLY_SNAPSHOT_VERSION`, which the same contract already gives as a constant
  (`abi/dolly-image-0.wat:17`) and every snapshot part carries in its header. Its only callers
  are `test/image-browser.mjs:93-95`, which instantiates the contract file itself (never the
  kernel), and `test/fixtures/image-roundtrip.c:57`.
- `dolly_process_bootstrap_resume_prepare(size, resume_uses)`: the kernel refuses any
  `resume_uses` but 1 (`kernel/dolly.c:285`), the contract says "The second parameter is 1"
  (`abi/dolly-image-0.wat:72`), and its one caller passes 1 (`site/build-worker.mjs:151`).

AGENTS.md: "The core interface must remain small"; "Removing code is a win". A second host
(Donna) implements and documents both for nothing.

## Do

Remove the export and its two test uses (the constant is the version a host reads); drop the
second parameter from the export, the kernel and `build-worker.mjs`.

## Done when

`abi/dolly-image-0.wat` has neither; the image and build suites pass in Chromium and Firefox on
the rebuilt catalog; Donna's task for the image contract is told of the change.
