# Audit handoff

## Stable checkpoint — 2026-09-08

GitHub Pages is live at `https://daugasauron.github.io/dolly/`, deployed by run
`34184222497`. The audited application source is commit `32d3b34`, release tag
`pages-32d3b34-r1`, artifact `dolly-pages.tar.gz` SHA-256
`fbb6d1fe6673e97125ba17a2335b1f07719767aa1a2fe5c20a7dd7a60287023b`.
Both host exports have 1,131 identical decoded sealed files; their 691 public
HTML pages differ only by deployment prefix (`build/stable-release-export-equivalence.log`).
Public browser boot/HTTP, actual Qwen FP32/Pi file reading, and session
export → delete → import → named-URL restore pass
(`build/stable-release-github-{live-2,qwen,sessions-2}.log`).
The post-release repository follow-up only corrects an obsolete README assertion
in the live smoke test and records this receipt; it does not change the deployed
application. Public session tests require `DOLLY_BROWSER_BASE=/dolly/`.

Cloudflare Pages is also live at `https://dolly-9dk.pages.dev/`, project `dolly`,
deployment `e0e677db-e059-425c-8084-e0ad240bbf7c`. It serves the same audited
release `fe1e44c38acd11c07d82586d70b2315db26c7461d16b02c1e5afc64cab40ac7a`,
retaining `987466e3485b3fdd1a90138fe695443fa90ad34af644fcff9b4a0e1158dad962`.
All 19 public image routes pin that release. Public delivery passes all 14
decoded compressed-file hashes, untouched gzip packs, MIME/isolation/cache
headers, named-session routes and retained assets
(`build/stable-release-pages-public-transport.log`). Real Studio session
export/delete/import/restore and prebuilt inventory pass
(`build/stable-release-pages-public-{sessions,inventory}.log`). No Functions,
Worker, R2 backend or paid hosting subscription was added.

The first public system rebuild completed, but the inventory fixture's subsequent
localhost HTTP fetch failed with status 2. The inventory assertion now compares
the in-Wasm manifest's SHA-256 with the packaged manifest and walks paths in C,
without an unrelated test-server fetch. Browser networking/ABI is unchanged.
The corrected public system rebuild and full inventory pass
(`build/stable-release-pages-public-rebuild-2.log`).
All 280 source tests pass (`build/stable-release-pages-deployed-source-tests.log`).

Scope is UX/stability, not PTYs/tmux or new ports. Session file export/import/delete
now passes a real Chrome save → downloaded file → delete → import → Wasm restore,
including Pi sessions and credentials. Names cannot collide on import; deletion
requires confirmation. `build/stable-release-session-chrome-2.log` and
`test/session-file.test.mjs` cover the change. Files remain unencrypted local data.

Qwen now has one logical ID per size (`Qwen3.5-2B`, etc.). The worker selects
pinned FP16/FP32 assets from adapter features, not browser identity; all sizes
have both variants. Loading progress is visible and a two-minute idle timeout
terminates a stalled model worker without touching Dolly's filesystem. Real Pi
file reading passes on Chrome hardware without f16, using the ordinary 2B menu
choice (`build/stable-release-auto-qwen-chrome-2.log`). All 277 source tests pass
(`build/stable-release-source-tests-2.log`). Studio's default model ID is updated
and its small leaf snapshot rebuilt; no runtime ABI/binary change.
All 19 images pass publication checks (`build/stable-release-publish.log`).
Published Chrome passes both real Qwen/Pi file use and file-export session restore
(`build/stable-release-live-{qwen,session}-chrome.log`). Firefox 155.0.1 also passes
the downloaded-file session round-trip (`build/stable-release-session-firefox-3.log`).
Earlier Firefox fixture runs sent commands before Slop's first input wait; the
corrected fixture waits for the interactive prompt before and after restore.
Fresh Firefox/Linux reports disabled WebGPU cleanly. GPU inference verification
uses `dom.webgpu.enabled=true` in its own temporary test profile, not the user's.
Firefox passes three consecutive real Pi file-reading turns with automatic FP16
(`build/stable-release-qwen-firefox-enabled.log`); Chrome uses automatic FP32.
Publication passed all 19 inventories (`build/stable-release-publish-final.log`).
Port 9000 serves the sealed directory selected by `build/releases/current`.
Published Firefox disabled-GPU
guidance and shell recovery pass, as do Chrome menu copy/cache controls
(`build/stable-release-gpu-disabled-firefox.log`,
`build/stable-release-live-gpu-menu-chrome.log`). All 277 final source tests pass.
The extended Firefox GPU run now also passes: cancellation in 1,943 ms, fourteen
growing prompts through 12,625 input tokens, cached model reload and subsequent
inference with the in-Wasm filesystem preserved
(`build/stable-release-firefox-soak.log`). This is bounded evidence, not a claim
that experimental Firefox/Linux WebGPU can never crash.

`npm run export:pages` now prepares static-only Cloudflare Pages delivery with
Brotli for oversized binary downloads and explicitly retained sealed releases.
Source runtime/ABI files are untouched. The initial export with one predecessor
contains 2,820 files and 14 compressed downloads; no file exceeds 25 MiB. The
provider's local Pages runtime requires opaque MIME types for compressed SOURCE
artifacts; its normal `application/wasm` compression otherwise overwrites the
encoding header. Workers Static Assets double-compresses even opaque files and
must not be substituted. The full local Pages proof now passes decoded SHA-256
for all 14 compressed assets, isolation/cache headers, retained-release URLs,
unchanged gzip packs, a real system rebuild and Studio session file export →
delete → import → named-URL Wasm restore. See
`build/stable-release-pages-browser-3.log`. Candidate output is
`build/cloudflare-pages-candidate-2` (2,820 files, about 674 MB including one
predecessor; largest file 24,980,297 bytes). Its deployment manifest verifies.
All 280 source tests pass (`build/stable-release-pages-source-tests-2.log`).
Owned browser profiles, local provider processes/tool installation and the first
failed candidate export are cleaned; the passing export and logs are retained.

Remaining release gates:

- Finish `daugasauron.com` DNS in the dashboard: the root CNAME must point to
  `dolly-9dk.pages.dev`, replacing only the old root web record. The user was sent
  this step. The active zone and Pages project share an account; the domain is
  associated, but Pages reports `CNAME record not set`. The authenticated Wrangler
  login has Pages access, not DNS read/edit access; no DNS records were changed.
- After DNS activates, verify the domain's TLS, release seal and real browser
  boot/session restoration. Do not rebuild images or add metered hosting to do so.

The committed source-aligned refresh uses `build/stable-release-committed-publish.log`
and `build/stable-release-checkpoint-export.log`; its Pages output is
`build/cloudflare-pages-checkpoint`, retaining the previously tested release.
Verify `build/releases/current` against its recorded source commit, not later
test/documentation-only commits, and check
`deployment.sha256` inside that export. Do not change source files during sealing.

## HTTP defaults — 2026-09-08

Unconfigured networking permits caller-requested Fetch redirects and has no
lifetime request quota. Explicit destination rules, inherited restrictions and
exact bootstrap grants still reject redirects; byte caps, deadlines and omitted
browser credentials remain. The Wasm ABI and binaries are unchanged. All 269
source tests pass, and Chrome checks cross-origin 302/307 behavior, restricted
destinations never contacted, inherited rules and in-Wasm curl -L
(`build/http-defaults-{source-all,browser-green-stable,browser-restricted}.log`).

## Studio follow-up — 2026-09-08

Studio now gives Dollyfile directives an explicit yellow style and displays
inline diagnostics. Automatic linting is deferred/coalesced after open/edit/save
callbacks. Canvas checks and keyboard editing pass in Chrome; three consecutive
Firefox runs pass with the updated plugin (`build/studio-editor-firefox-deferred-final-*.log`).
Earlier Firefox probes observed one Neovim startup trap and cold terminal-copy
timeouts during Pi startup and editor checks. Their broader cause is not
established; the supplied Pi session summary contains no crash trace.

`dollyfile-build FILE` now starts and streams immediately. Only a user's
**Open image** click launches the completed result; the approval state, reserved
tabs, `--open` option and HTTP opening route are removed. The browser proof
checks no tabs appear during/after building, explicit result opening, isolation,
failure and cancellation (`build/studio-immediate-build-browser-final.log`).
All 268 source tests pass (`build/studio-immediate-build-source-tests.log`).
All 19 packaged image inventories pass. Live port 9000 checks pass immediate
build/stream/open/cancel and Studio editing in Chrome, plus installed Studio
editing in Firefox (`build/studio-combined-live-{build,editor,firefox}.log`).

Tmux is not installed. The next checkpoint needs in-Wasm PTYs (independent
input/output, mode, size, EOF and foreground signals), local Unix IPC, and a
deliberate spawn-based port of tmux's fork sites. Build real ncurses/libevent,
then add a Studio entry script with Pi and Neovim panes. No browser socket,
native-process fallback or additional outer Wasm import is intended. A real C
probe confirms socketpair is ENOSYS and /dev/ptmx is absent. Browser curl gets
HTTP 200 from GitHub's API and raw files, while release downloads fail; this
is not evidence of a Studio-only allowlist (`build/studio-porting-probe.log`).

## Prior checkpoint — 2026-09-08

The prior checkpoint served application `15f658e`, immutable release
`9ad971deddb9c062971caf544ef23e2c7f255dc4887163637422fd1b8857a29e`.
Overnight work paused at the user's requested checkpoint; the remaining goals
below are not complete. The handoff-only commit did not change the application.
All 268 source tests pass (`build/checkpoint-20260908-source.log`).
All 19 packaged browser inventories pass (`build/literal-filenames-publish.log`).
No public push, deployment or hosting purchase has been performed.

Runtime identity:
`sha256:fb0a862d11295ce62e74b9fcceee496ff1f362caa87b11e5de41acdf2d4f4d5d`.
The canonical outer ABI is unchanged: exactly 28 imports and 128 exports,
including types (`build/dollyfile-stdin-outer-abi.log`). The kernel Wasm is
byte-identical; the compiler seed now contains the corrected Dollyfile executor.

## Validated work

- Janis package exports/imports and Studio lint diagnostics now preserve literal
  filenames containing JavaScript replacement sequences such as `$&`. Both
  actual components fail before the fix and pass after it; installed-browser
  regressions likewise fail on the old images and pass on the rebuilt ones
  (`build/literal-filenames-{source,janis-browser,studio-browser}-{red,green}.log`).
  All nine affected images rebuilt from the corrected, pinned sources; cached
  bases were reused (`build/literal-filenames-snapshots.log`). Final checks on
  port 9000 pass Janis filesystem/package loading and Studio's Pi startup,
  example linting and Neovim unsaved/save diagnostics
  (`build/literal-filenames-live-{janis,studio}.log`).
- WebLLM's prompt formatter interpreted JavaScript replacement sequences in
  message text and removed literal `{function_string}`. Template expansion now
  precedes literal message insertion. The actual formatter's exact-byte tests
  fail before the fix and pass for system/user/assistant messages
  (`build/webllm-literal-prompts-{red,green}.log`). Identical real-browser JSON
  requests return `A {user_message} B` on the old release and `A $& B` on the fix
  (`build/webllm-literal-json-browser-{red,green-assert}.log`). A plain-text echo
  dropped `$` even on the fix; that failed trial is retained, not counted as a
  pass. The browser regression now checks the JSON value exactly.
- Packaging reads raw snapshots directly instead of copying and then deleting
  4,029,066,146 staging bytes. An actual ENOSPC failure exposed the duplication;
  its cleanup preserved the live release. The corrected publication succeeds,
  with all 19 browser inventories passing (`build/snapshot-staging-publish.log`).
  All 141 packs and 19 snapshot manifests remain byte-identical
  (`build/snapshot-staging-byte-identity.log`); source snapshots are retained.
- Browser tests no longer delete Chrome profile locks or trust a stale debugger
  port file. Startup reads its own process's endpoint announcement. A second
  harness refuses an occupied profile while the first model remains usable;
  locks and debugger identity remain unchanged
  (`build/browser-profile-live-proof.log`). Exit/disconnection cleanup and
  normal Studio startup pass (`build/browser-profile-{disconnect,studio}.log`).
- The pinned Qwen 3.5 chat configs contained obsolete Qwen 2 stop-token IDs,
  truncating ordinary Korean text. Worker overrides now match all three pinned
  tokenizers. The actual 4B browser failure and fix are retained in
  `build/qwen-stop-tokens-browser-{red-assert,green}.log`; Janis also verifies
  complete output through the existing Wasm HTTP boundary
  (`build/qwen-stop-tokens-wasm-browser.log`). Live Studio startup/linting passes
  (`build/webllm-literal-prompts-live-studio.log`). The current GPU suite passes
  all three model sizes, real Pi file tools, offline use, cache reuse and
  cancellation (101 ms), plus 14 growing prompts reaching 12,625 tokens
  (`build/webllm-literal-prompts-full-gpu-browser-final.log`).
- WebGPU asset preparation now owns unique scratch outside the public asset
  directory, cleans failures and stages the bundle before publishing complete
  files; the manifest is published last. This is per-file replacement, not a
  directory transaction. Injected partial-write/bundler failures preserve old
  complete outputs, and verified assets are reused
  (`build/webgpu-staging-{red,green-final}.log`). Actual preparation preserves
  all 14 generated files byte-for-byte (`build/webgpu-staging-prepare-final.log`).
- Pi's edit tool now rejects unchanged replacements, empty search text and
  overlapping duplicate matches without writing the file. Literal replacements
  preserve BOM, CRLF and Unicode. The regressions fail on the old implementation
  and pass both as source tests and through the installed browser image
  (`build/pi-edit-{contract-red,contract-green,browser-red,browser-green}.log`).
  All 261 source tests pass (`build/pi-edit-source-final.log`); all affected Pi
  layers rebuilt successfully, with unchanged bases reused
  (`build/pi-edit-snapshots.log`). Upstream Pi's TUI, incremental SSE and installed
  write/edit tools pass (`build/pi-edit-tui-browser.log`). All 19 packaged image
  inventories passed before publication (`build/pi-edit-publish.log`).
  Live port 9000 also passes installed edit/UTF-8 regressions and Studio's Pi
  startup, example linting and Neovim diagnostics
  (`build/pi-edit-live-{browser,studio}.log`).
- A manual Studio trial exposed a genuine build hang: `SLOP` inherited a terminal
  stdin even though the isolated builder cannot receive keyboard input. Build
  commands now receive `/dev/null`; explicit pipes and redirection remain normal
  shell operations. Native EOF/descriptor-cleanup regressions pass, as do the
  real-browser boundary, lifecycle, Slop and Dollyfile parser suites
  (`build/dollyfile-stdin-{parser-final,runtime-browser}.log`). A source-compiled
  Wasm probe also verifies non-TTY EOF with either terminal or piped caller stdin,
  explicit recipe input and preserved caller stdin
  (`build/dollyfile-stdin-direct-browser-green.log`). The expanded Studio
  regression fails on the old image (`build/studio-build-stdin-c-red.log`) and
  passes on the fix (`build/dollyfile-stdin-studio-browser.log`), including
  approve/build/stream/open, denial, failure and cancellation. Invalid exports show
  the expected object kinds; successful builds explain that their tools belong
  to the new image, not the calling Studio session.
  The full rebuild caught a Python recipe smoke test that assumed a terminal on
  stdin. It now checks noninteractive EOF; its raw-mode round-trip check moved
  intact into the real interactive Python browser fixture.
- All 260 source tests pass (`build/dollyfile-stdin-source-final.log`). All 19
  images completed genuine fresh-runtime builds
  (`build/dollyfile-stdin-{all-snapshots,snapshots-final}.log`); the first run's
  Python recipe failure and the successful correction are retained separately.
  All 19 packaged inventories passed before local publication
  (`build/dollyfile-stdin-publish.log`). The final live Studio check passes
  build/stream/open/cancellation, Pi startup and Neovim linting
  (`build/dollyfile-stdin-live-studio.log`).
  Named save/load also passes on the rebuilt Python/Pi image, including edits,
  deletions, credentials/history, corrupt/wrong-base rejection and preserved
  checkpoints (`build/dollyfile-stdin-session-browser.log`).
- The updated Studio snapshot builds in 8.7 seconds using cached bases. Pi
  startup, installed example linting, Neovim syntax, unsaved-buffer linting and
  save diagnostics pass (`build/dollyfile-stdin-studio-browser.log`).
  Interactive Neovim also passes shifted punctuation, Escape, `:w`, shell
  commands and `:q` recovery (`build/dollyfile-stdin-neovim-browser.log`).
- Quiet-child SIGCHLD is delivered only once the child is waitable. Cancellation,
  escalation, descriptors, pipes, nested-shell recovery and `tar -xf -` pass
  in real browsers (`build/sigchld-tar-lifecycle-browser.log`). Boundary,
  C/C++ process/DSO probes, Git HTTP clone/fetch/push/cancellation, libcurl,
  77 Slop regressions and Make propagation pass
  (`build/sigchld-checkpoint-browser.log`). The new catalog also passes Git
  clone/fetch/push, cancellation and lock cleanup
  (`build/dollyfile-stdin-git-browser.log`).
- Pi's fake npm success was removed. Pi TUI, incremental output and fixture-backed
  write/edit calls pass (`build/dollyfile-stdin-pi-browser.log`). Python child
  streaming, cancellation, Bonnie's real PEP 517 build/cleanup, interactive stdin
  and ctypes callbacks pass (`build/dollyfile-stdin-python-browser.log`).
- Prebuilt launches and derived builds no longer download the 113 MB compiler
  seed. A genuine Ghostty root rebuild still works. Release-pinned assets use
  immutable caching; repeated kernel/loader reads transfer zero bytes
  (`build/lazy-kernel-seed-browser.log`,
  `build/lazy-kernel-seed-port9000-cache.log`).
- Static export now preserves versioned assets, clean navigation and correct
  service-worker scope, including a nested `/dolly/` deployment. Real headerless
  browser checks pass for isolation, approved build/log/open, cancellation,
  named-session restore and cache/derived-build iteration
  (`build/static-export-{isolation,build,iteration}-browser.log`,
  `build/static-export-session-final.log`). See [deployment](deployment.md).
- Source archives now reject explicitly supplied symlinks, complete short writes
  and own unique staging with failure cleanup. Behavioral regressions fail on
  the old writer and pass on the fix. Regenerating all prepared sources preserved
  every prior byte hash (`build/source-tar-audit-before-final.log`,
  `build/checkpoint-source-archives-{before.sha256,prepare.log}`).
- Recipe pin updates now distinguish digest operands from identical text in
  paths and comments. A behavioral regression fails on the old updater; the
  fixed updater preserves formatting and remains byte-identical on a second run
  (`build/pin-operands-{before,after}.log`).
- Qwen history now preserves the empty thinking markers required in the current
  tool round and separates assistant text from tool calls correctly. Regression
  tests pass, but this did not make independent recipe authoring reliable.
  The README is shorter and no longer makes stale phone/login claims.
- Actual Chrome navigation measured 43,507,555 response-body bytes cold and
  121,102 warm for default; Studio used 78,186,172 cold and 155,792 warm.
  Snapshot-ready times were 1.12/1.12 seconds and 2.23/2.13 seconds respectively
  (`build/{default,studio}-cold-boot-final.log`). These are single local,
  unthrottled cold/warm pairs, not WAN or fully interactive Pi timings. They
  exclude protocol overhead and GPU model weights; a fresh profile measured
  each image, including Worker requests.
- CPython's personal bootstrap path was removed at source preparation; all three
  Python snapshots are clean of that path. The expanded release scan covered
  1,121 files, 48,875 tar members, 18,875 snapshot records and 1,067 nested ZIP
  members. No checked Dolly personal-path or OpenRouter-key patterns matched.
  All 13 private-key blocks matched pinned upstream CPython test fixtures
  byte-for-byte (`build/public-artifact-fixture-provenance.log`). The new release
  introduces no new flagged bodies
  (`build/dollyfile-stdin-artifact-privacy{,-comparison}.log`). The tracked-source
  scan also has no checked personal-path/key matches
  (`build/dollyfile-stdin-source-privacy.log`).
  The 16 unparsed archive occurrences also match pinned Zig/CPython fixtures
  byte-for-byte (`build/public-artifact-unparsed-provenance.log`).
  This is a bounded pattern scan, not proof that every possible secret encoding
  or unsupported archive format was inspected.
  Repeating it on the current literal-filename release found no new flagged bodies
  and the same public fixtures
  (`build/literal-filenames-artifact-privacy{,-comparison}.log`).

## Outstanding issues

1. **Local Pi reliability and recovery.** Guided Qwen 4B starters pass, but
   independent author/build/debug/open remains unreliable after the edit fix.
   Normal settings repeated invalid exports and unsupported `sed -i` commands;
   no-op edits now correctly fail. A separate temperature 0.7/top-p 0.8 trial
   built and opened an image, but its line counter returned 0 for two lines
   (`build/studio-pi-edit-sampling-correctness-final.log`). Explicit repair
   feedback still produced incorrect C and omitted requested assertions. Its
   second build opened, but the independent I/O recheck was interrupted, not
   passed. Sampling changes were test-only, not new defaults. Preserve the
   `studio-pi-edit-{default,sampling,repair}.jsonl` transcripts and recipes under
   `build/studio-manual-evidence/`. Successful compilation is not code correctness.
   Ctrl+C returns 130; the two-second cancellation fallback can unload the model.
   The shell/files survive, and explicit cached reload restores real Pi tool use.
   In Pi's upstream JSON mode, a model-error event can accompany exit 0: its
   `print-mode.ts` only maps final assistant errors to exit 1 in text mode.
   Inspect JSON events, not only the process status; this is not evidence of a
   Dolly exit-status defect. Preserve the cached GPU profile.
2. **Missing Pi search tools.** Genuine fd/ripgrep are not installed. Resolve the
   Rust bootstrap boundary: pinned external compiler versus an in-Dolly compiler.
   fd's single-thread option still creates threads. Do not ship renamed substitutes
   or represent externally compiled tools as source-built inside Dolly.
   An isolated upstream ripgrep 15.1.0 probe now runs in the published browser:
   default serial search/listing, Unicode, ignore rules, pipes, exit statuses,
   explicit mmap and direct Ctrl+C/reuse pass (5 ms cancellation). Rust objects
   were externally compiled; Dolly compiled three missing upstream pthread
   attribute functions and linked the executable. No ripgrep source patch or
   host change was needed. Evidence and reproduction scripts are under
   `build/ripgrep-probe.OHvH0j/`; final proof is `browser-direct-cancel.log`.
   `scripts/build.sh` must include `pthread_attr_init`,
   `pthread_attr_setstacksize` and `pthread_attr_destroy` in the process archive.
   These functions do not implement threads. SDK packaging remains unfinished.
   The probe's upstream build script picked up Dolly's parent Git revision;
   isolate Git discovery and remap host source paths before packaging Rust tools.
3. **Custom-image persistence.** Uploaded recipes cannot yet use named-session
   save/load. Result URLs refer to this browser's verified cache, not portable
   images or persistent sessions. Preserve exact image identity when extending it.
   Existing named saves are build-specific; incompatible records are retained,
   but there is no cross-build migration or export UI.
4. **Final release review and hosting.** Static export is verified; provider
   selection, WAN/load testing and production retention are not.
   The release is about 772 MB, including 124 MB of compressed snapshot packs;
   seven individual assets exceed 25 MiB. Root rebuilds still download the 113 MB
   seed, which Chrome did not cache. Keep prior `_dolly/` releases and packs for
   open tabs: an ordinary one-release GitHub Pages deployment does not do this.
   Review remaining source/docs. Upstream model build paths and public certificate
   and archive fixtures are not Dolly user data and should not be blindly deleted.
5. **Build cost and disk pressure.** Fresh-runtime CMake took 1,143 seconds,
   Neovim 222 seconds and Python 100 seconds; cached Studio assembly took 9 seconds.
   Around 1.2 GiB of development disk remains after the isolated Rust probe. The final
   publication used RAM-backed temporary staging; no old releases were deleted.
   Two reproducible static-test exports were removed earlier; their logs and
   source releases are retained. Preserve user caches and releases; avoid further
   large builds.
   One cached 2B startup took 119 seconds. A fresh browser process loaded it in
   4.17 seconds with phase timings (`build/gpu-load-phase-first.log`); the next
   published run took 4.34 seconds. The outlier's cause remains unproven.
6. **Command cancellation — next fix.** A fresh stock default image reproduces
   `sleep 30 | /bin/slop -c 'echo wrongly-ran > FILE'` continuing after Ctrl+C:
   the second stage writes FILE and the pipeline returns 0 in 31 ms. This does
   not involve Rust (`build/pipeline-interrupt-browser-red.log`, reproduced by
   `node build/pipeline-interrupt-probe.mjs`). Slop's serial pipeline advances
   after the interrupted child; `dolly_wait` discards the signal metadata already
   available through `waitpid`. Preserve real termination information and stop
   the current command's remaining work. Do not infer a signal from numeric 130:
   the probe also confirms an ordinary `exit 130` must allow later pipeline work.
   The same failure is now reproduced for `(sleep 30) | ...` and
   `sleep 30; ...`, both executing the later write and returning 0
   (`build/pipeline-interrupt-{compound,list}-browser-red.log`; pass `compound`
   or `list` to the same probe). Cover descriptor cleanup and prompt recovery,
   and propagate real signal termination through nested noninteractive shells.
7. **Ordinary tar root entries.** The extractor rejects `./` and `./file` paths
   from a conventional `tar -cf archive -C DIRECTORY .`. Real-browser failure:
   `build/ripgrep-probe.OHvH0j/browser-link.log`. Normalize safe leading `./`
   components and accept empty root directory markers without accepting parent
   traversal or treating a root marker as a regular file. This is not fixed.

GPU guidance, home-page sorting, approved Studio build/log/open and the Foundry
bhop expansion are implemented and browser tested. See the
[overnight plan](overnight-plan.md) for the original requested scope.

## Isolated Codex experiment

Branch `codex/wasm64-native-agent-20260907` is clean and paused at `e9b8c4f`
(provider source checkpoint `e2c0a98`).
Its worktree's `CODEX-HANDOFF.md` contains reproduction steps and evidence.
No experimental Rust patches were merged into main.

Real upstream components run in browser Wasm: execpolicy, process waits and
cancellation, layered TOML/managed configuration, API-key AuthManager, actual
ConfiguredModelProvider, model-manager WasmFS caches and Responses/SSE. The
provider owns the exercised auth and model managers; its browser proof passes
twice again (`codex-core-boundary-provider-browser.log` in the experiment's
build directory). Seventeen patches replay without fuzz; selected native and
target libraries type-check, not the full core or native test suite. Exact outer
ABI checks pass. No new host capability or live credential was used. OAuth and
unsupported auth modes fail explicitly. Rust compilation remains an external
bootstrap step; Dolly's compiler links the archive inside Wasm.

**The full Codex agent does not run.** Real ConfigBuilder/ModelClient/CLI
integration remains unported. A fresh exact-feature Tokio diagnostic reproduces
28 socket2 errors and one Unix peer-credential error in 3.22 seconds, before
core type-checking. Actual contributors include file-search, exec-server,
code-mode, WebSockets, MCP and telemetry; the target graph is 716 units.
Fallible model-manager construction must propagate through cyclic/spawned
startup. Native transport fields, full configuration/environment construction,
process groups/executable identity and SQLite workers also remain. Separate
these native dependencies without host fallbacks. There is no in-Dolly Rust SDK.
Experiment processes are stopped.

## Handoff rules

Keep port 9000 on published releases, never mutable source or `dist`.
`build/releases/current/release/source.commit` identifies the served source.
Preserve `.pi/`, `.pi-subagents/`, `work/`, reusable module caches,
`build/d6-source-cache-backup.v3dj1y`, old pinned releases and failed-test evidence.

These checks do not establish full POSIX/Node/libcurl compatibility,
Safari/phone/audio support, complete cleanup after forced Worker termination,
or a formal containment proof. Follow [AGENTS.md](../AGENTS.md).
