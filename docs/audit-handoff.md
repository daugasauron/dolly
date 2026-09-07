# Audit checkpoint

## Latest checkpoint — 2026-09-07

Work is paused at the user's requested checkpoint. Application baseline
`7cdc961` was published at `http://localhost:9000/`; all 19 packaged image
inventories passed (`build/bhop-foundry-publish.log`). Release identity:
`05414e8a7895887d0e399e73d656c8a0678597562734ea0da756efe36d2741d9`.
A fresh source-suite run passed all 252 tests (`build/bhop-foundry-source-verified.log`).
The actual port-9000 Studio build/open test also passed, including incremental
logs, a source-compiled command in the new tab, failure/denial status, and
Ctrl-C recovery (`build/studio-build-port9000.log`). No public push or deployment
was performed. These are focused checks, not a new full browser-suite run.
The published Foundry play/collapse check passes too
(`build/bhop-foundry-port9000-final.log`); the first port check reached the old
release before atomic publication and correctly failed the new course test.

Chrome GPU errors now link to short setup instructions; unavailable/fallback
adapters fail before downloading weights. The home page sorts default first,
then alphabetically. Qwen 3.5 now uses its native function/parameter tool format
instead of Qwen 3's JSON envelopes, preserving literal shell/code strings and
rejecting incomplete calls.

Studio now provides `dollyfile-build [--open] FILE`: explicit browser approval,
live logs through the existing HTTP broker, a cancellable disposable Wasm build,
and verified cached-result launch at `/custom/run/`. Local admission is a short
table in `src/local-services.mjs`. Builders deny local services/downloads; result
tabs intersect inherited and new-page HTTP restrictions. No Wasm import changed.

Browser evidence: `build/studio-build-policy-browser.log` proves actual command
submission, output before completion, source-compiled C in the new tab, inherited
network denial, separate files, failure/denial status and Ctrl-C recovery.
`build/studio-build-{editor,boundary,local-menu}-browser.log` covers Neovim,
the exact 28 imports and existing local-model controls. All 252 source tests pass
(`build/studio-build-source-final2.log`). The final Studio snapshot rebuilt in
8.5 seconds; the other 18 snapshots and kernel were reused
(`build/studio-build-snapshot-final.log`). This is not a new cold bootstrap.

GPU-help and menu browser checks pass (`build/overnight-{gpu-help,menu}-browser.log`). The real
Chrome GPU run passed `/dolly-hello` and `/dolly-tool`, but `/dolly-fix` repeated
prose until its token limit and created no file. The aggregate local-model test
therefore **fails** (`build/overnight-qwen-native-browser.log`); this is progress,
not a reliable end-to-end agent author/build/debug workflow.
The unchanged retry reproduces this (`build/studio-local-model-recheck.log`).
Manual author/build requests exposed three distinct outcomes:

- Qwen 2B exhausted its 2,048-token output limit before executing a tool. Pi
  exited 0 despite assistant `stopReason: error`.
- Qwen 4B made 45 repetitive shell calls without creating the requested recipe,
  then timed out. An ambiguous missing-file error contributed to the loop.
- Explicit `/skill:dollyfiles` with 4B created a recipe and requested browser
  approval, but omitted the requested source-compiled C command. The approval
  was not completed before the test timeout; this is not a failed approved build
  or a successful author/build/debug workflow.

Evidence is retained in `build/studio-manual-evidence/` (three agent JSONL logs
and the generated `Dollyfile-workshop`). Cancellation left the Studio session
usable. The 4B weights loaded successfully on the test GPU; no default model
change or remote inference fallback was made.

This checkpoint fixes `dollyfile-build` to identify a missing recipe by its
exact path and reject unknown options with status 2. The GPU fixture now checks
the final assistant completion, not just Pi's exit code, and allows selecting
an existing model for comparison; the strengthened full GPU fixture has not
passed. All 252 source tests and the actual browser build/open/deny/cancel
checks pass (`build/studio-diagnostics-{source,browser}.log`). Only the Studio
snapshot rebuilt, in 9.1 seconds (`build/studio-diagnostics-snapshot.log`).

Outstanding defects and verification gaps:

- **Local Pi reliability:** repeat the three starters and exercise skill-led
  author/build/debug work. Do not weaken output checks or substitute scripted
  actions for the model. Cold GPU download/recovery still needs reproduction;
  one earlier run lost its debugger, with no established cause.
- **Misleading Pi instructions:** `src/pi/SYSTEM.md` still claims Zig is always
  installed and the compiled Pi tree is not the running agent. The actual Pi
  module installs its compiled output and locked runtime dependencies. Replace
  stale fixed inventories with accurate image-aware guidance.
- **Fake npm success:** both Pi settings files use `npmCommand: ["/bin/echo"]`.
  This can conceal missing package dependencies. Inspect the install flow and
  make unsupported dependency installation fail explicitly without breaking
  genuinely dependency-free extensions.
- **Missing Pi search tools:** genuine fd/ripgrep are not installed. Rust
  bootstrap versus fully in-sandbox Rust compilation needs an explicit decision.
  fd's `--threads 1` still creates threads; it is not a serial implementation.
- **Tar stdin:** `tar -xf -` opens a file named `-`, so the conventional
  `gzip -dc archive.tgz | tar -xf -` pipeline fails. The isolated Rust experiment
  reproduced this; `modules/tar.dm` confirms the unconditional path open.
- **Quiet child completion:** main does not promptly notify SIGCHLD listeners;
  an isolated fix is browser-tested on the Codex branch (details below), but
  still needs review and a real main-runtime/image rebuild before integration.
- **Pi test readiness:** the streaming UI fixture's fixed startup delay can send
  input before Pi is ready; matching an old echoed marker can then hide failure.
  Fix readiness and fresh-output assertions before treating that run as evidence.
- **Custom-image persistence:** named-session save/load is unavailable for
  tab-local uploaded recipes. Preserve the validated image identity when adding it.
  The built result opens from this browser's verified cache; its URL alone is
  not a portable image or persistent session.
- **Cold build cost:** uncached CMake took 1,434 seconds and Neovim 264 seconds;
  cached Studio assembly took about 10 seconds. No host compilation fallback.

Remaining feature/release work is tracked in [the overnight plan](overnight-plan.md):
The bhop expansion now implements Foundry: 32 jumps through four original
industrial sections, 88–64-unit pads spaced 220–250 units apart, 100-ms collapse
and two-second return, safe checkpoints and section practice without record
writes. Native and in-Wasm checks prove unchanged strafe acceleration, collapse
timing and every individual gap's reachability (not an automated full-course run).
`build/bhop-foundry-play-browser-final.log` proves real keyboard play onto a pad and
its collapse, all four sections, pointer capture, jumping and cancellation.
The first play fixture sent W before the game consumed capture and therefore
never moved; it now waits for two rendered frames. Original failed evidence is
retained. Source suite: 252 passes (`build/bhop-foundry-source-verified.log`); the changed
image rebuilt inside Dolly in 7.9 seconds (`build/bhop-foundry-snapshot-final.log`).
An earlier suite ran while the snapshot was being replaced and correctly
rejected mismatched recipe identity; the final suite ran after publication of
the completed local snapshot. Do not run snapshot-identity checks mid-build.

The public source/artifact and static-hosting review is unfinished,
including personal-path cleanup and provider-neutral asset delivery. The current
package is 775,185,782 bytes, with 123,967,396 compressed snapshot-pack bytes
shared across 19 images; this is not yet a hosting-cost or cold-load assessment.
The development disk is 98% full (about 24 GiB available at checkpoint). Review
owned build outputs before another cold build; do not delete user caches or
releases still needed by pinned browser tabs.

The isolated `codex/wasm64-native-agent-20260907` checkpoint (`cb9314f`) runs the
real upstream `codex-execpolicy` CLI in Chrome, with correct allow/forbidden
results, and a Codex HTTP transport through the existing Dolly broker. Browser
tests verify streaming, binary/JSON/Zstd requests, errors, deadlines and Drop
cancellation. It also fixes a Rust target allocator-alignment mismatch (16-byte
assumption versus Emscripten's 8-byte malloc guarantee). These target patches
remain off main; consult that branch's `CODEX-HANDOFF.md` before reuse.

The full Codex agent is **not running**. Its dependency graph still enables
native networking and multithreaded Tokio; many callers bypass the HTTP trait.
Separately, main does not emit SIGCHLD: a quiet child exiting after 100 ms was
only observed after an unrelated 3-second timer. Isolated commit `35dc338` now
fixes wait-ready notification inside Wasm; `376819e` records browser proof of
112–127-ms waits, cancellation/reaping and recovery, with identical 28 imports
and 128 exports. It used explicitly re-keyed same-ABI test snapshots, not a new
product bootstrap; do not merge those test artifacts. Neither commit is on main.
The later source-only dependency separation lets real `codex-client`, protocol
and HTTP Responses APIs target-check. The Responses browser probe still fails
to link because upstream features retain Tokio blocking-pool pthread imports;
no fake pthread implementation was added. Consult the branch handoff for its
final checkpoint. No complete or authenticated Codex agent workflow is verified.

## Historical verification

Completed audit details are retained in Git history, not repeated as current
work. The last isolated v3 cold-bootstrap proof was `90b4776`: all 12 images,
196 source tests and the full Chrome suite passed, with byte-identical runtime
and snapshots. Evidence: `build/v3-cold.oZiZCr/{bootstrap.log,run.sh,compare.mjs}`.
That proves its checkpoint, not the later 19-image catalog or current changes.

## Handoff rules

Port 9000 serves a published whole-app release, never mutable source or `dist`.
`build/releases/current/release/source.commit` identifies its functional source.
Nothing from this checkpoint was pushed or remotely deployed. A new publication
is required to change the served app; keep older releases for open pinned tabs.

Preserve `.pi/`, `.pi-subagents/`, `work/`, reusable module caches, and
`build/d6-source-cache-backup.v3dj1y`. The isolated verification checkout was
moved to recoverable system trash after retaining its evidence.

Do not turn this result into claims of complete POSIX/Node/libcurl support,
Git filter support, Safari/phone/audio verification, cleanup after forced Worker
termination, or a formal containment proof. Follow [AGENTS.md](../AGENTS.md).
