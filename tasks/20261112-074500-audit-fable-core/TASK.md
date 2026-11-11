# Audit of the core at 0.1.6: architecture, security boundary, Dollyfile, kernel

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: audit,architecture,security,core

## State (2026-11-12)

Read-only audit of `main` at `e2e8c20aa` by a Fable 5.2 agent. Nothing was built, run or changed;
`dist/` was not trusted (a packaging job had narrowed it), so every statement below is from
sources, `wc`, `grep` and `git log`. "By reading" means not reproduced in a browser.

Covered: `AGENTS.md`, `docs/`, `abi/`, `include/dolly/`, `host/*/module.json` and contracts, the
registry (`host/modules.mjs`), the HTTP broker and policy, nena, snapshot, packages, build, console,
html, download, microphone, the lease bridge, `src/browser.mjs`, `src/site.mjs`, `src/route.mjs`,
the supervisor's call path, the kernel's module table and process end, `scripts/dolly-build.mjs`,
`docs/dollyfile.md` against `src/dollyfile.c` and `src/dollyfile-view.mjs`, the owner's words in
`tasks/` and the memory notes, the earlier audits, and Donna (`~/dev/donna`) as a second host.
Not read line by line: `host/gpu/worker.mjs`, `host/input/input.mjs`, `host/dso/ffi.mjs`,
`host/display/`, upload, audio, touch, `src/slop.c`, `src/compiler.cpp`, the libc adapter.

What matters most:

1. **The perimeter holds.** 13 typed function imports and `env.memory`; no path was found by which
   a program reaches the browser other than through a provider's stated authority. Two places
   widen authority beyond what `docs/browser-boundary.md` says: `dolly-build`'s Node relay (S1) and
   `packages@0` reading a directory the guest names (S2).
2. **"Host module" names seven different mechanisms**, and three of them (threads, pty, console)
   are written into the core supervisor by name. Only the device bridges are the unit the owner
   asked for: one directory, one manifest, one import (A1, A2).
3. **What a second host must copy is larger than the contracts say.** Donna typed by hand: the
   kernel's `malloc` and `free`, the `/etc/dolly/*` control files, the image directory's JSON, and
   a 1,867-line supervisor. The Dollyfile's only parser is page JavaScript (A3, A4, D1).
4. **The kernel has two stream mechanisms and two terminals**: built-in pipes and the display's
   terminal beside the `dolly_kernel_socket_kind` table that sockets, pseudo-terminals and
   console pipes use (K1, K2).
5. Of the 2026-11-07 audits, the HTTP slot leak and the document drift are fixed; the structural
   findings (flat `src/`, the 704-line dispatch, runtime source importing `dist/`, site code in
   `host/`) and most security remedies stand unchanged (section 7).


Owner (2026-11-12): "Security during build isn't important, thats why the relay was added. The
build image is only to build other images. I want you to convert everything else into tasks, the
host-module actually being modular is extremely important, this is top priority to fix, if the
contract has to change thats fine, but it definitely seems the current implementation is broken
from an architecture point of view. Create tasks and fix these things."

So S1 (the build relay) and F3 (the build's Chromium without its OS sandbox) are not findings: a
build is trusted to reach what its steps fetch. Every other finding is in a task:

| Findings | Task |
| --- | --- |
| A1, A2, A7 | `20261112-074501-modules-modular` (priority 450) |
| A4 | `20261112-074502-supervisor-events` |
| A3 | `20261112-074503-abi-contracts` |
| K1, K2 | `20261112-074504-kernel-streams` |
| K3, K4 | `20261112-074505-kernel-lifecycle-small` |
| S3 (F4, F7) | `20261112-074506-nena-switch-visible` |
| S4, S6, S7, S8, section 6 items 1-3, F15 | `20261112-074507-page-providers` |
| S5, F5, F12 | `20261112-074508-http-credentials-site-csp` |
| D1-D4 | `20261112-074509-dollyfile-findings` |
| A6, A7 test hooks | `20261112-074510-src-layout` |
| section 6 item 4 | `20261112-074511-gpu-provider-review` |
| section 6 items 5-6, section 7 rechecks | `20261112-074512-audit-hygiene` |
| A5, S2 | `20261104-143110-modules-r4`, `20261104-143110-modules-r5` (updated) |

Done when: each finding below is fixed, investigated with its history and closed with the
reason, or moved to a task of its own. Findings are claims, not changes (owner, 2026-10-13).

## 1. Owner direction

Dated quotes, with where each is recorded. `memory/` is
`/home/daug/.claude/projects/-home-daug-dev-dolly/memory/`.

**What the product is.**
- 2026-10-11: "The agent stuff was the original idea, then I realized how powerful the environment
  became and created the demos mainly to demonstrate that power" (`memory/thesis-evolved-beyond-agents.md`).
- 2026-10-14: "the power of the system is demonstrated by the apps that have been ported, and the
  sandboxing is still relevant since there is only one HTTPS edge that can be strictly managed on
  the browser side"; "it has evolved from a minimal posix userspace to a modular posix userspace"
  (same note). `AGENTS.md`'s Goal and Thesis say this now.
- This audit's request: "The core runtime etc is the product here, and it should be as small and
  well architected as possible. The architecture audit is more important than the implementation
  audit."

**Small, clean, Unix.**
- 2026-10-01: "If the core is slop it will be impossible to extend it"; each host bridge is one
  directory with a `module.json` naming every file, and registry, build, packaging and tests read
  the manifests (`memory/host-module-architecture.md`).
- 2026-10-13: "I want to get the core right, Dollyfile syntax, host modules/bridge, browser runtime
  etc. It should be as clean and small as possible in order to be extensible. Think unix
  philosophy (this is a core thing)." (`tasks/20261013-142800-direction/TASK.md`)
- 2026-10-13: "The long term goal is that the core things (that triggers rebuilds of everything),
  like the slop shell, runtime, modules etc, become stable and reusable." Full rebuilds are
  "intentional, this way is robust and reliable" (same task).
- 2026-10-23: "go ahead and audit stuff its very important to keep the core small and well thought
  out" (`tasks/20261023-200000-core-audit/TASK.md`).
- 2026-10-14: "Removing code sounds great!" (`memory/act-on-confirmed-describe-uncertain.md`).

**Modules.**
- 2026-10-02: "I thought subprocesses would be a host module? And the dolly-runtime? Not sure if it
  makes sense or not to have the runtime as a requirement but seems modular and nice."
  (`tasks/20261002-073000-runtime-process-modules/TASK.md`); "I feel like mouse/keyboard should be
  a host module." (`tasks/20261002-072000-input-host-module/TASK.md`)
- 2026-10-08, sockets: "declared only by programs that require only at link time. Things that
  don't need it to run shouldnt require it." (`tasks/20261007-074904-sockets-module/TASK.md`)
- 2026-10-13, nena: "if you have the nena bridge you can freely configure which host bridges are
  enabled during runtime. If you don't have it, the runtime can't change any host bridge related
  functionality" (`tasks/20261012-230015-bridges/TASK.md`).
- 2026-10-13: "GPU is just a module, and the other programs has no dependency on being run on a
  CPU, they only need POSIX." (`memory/gpu-is-a-module-not-a-category.md`)
- 2026-11-04: "I feel like the modularity of the host modules have been lost somewhere along the
  way, and it's now ended up in a place where all images declare everything"; "the only place I
  expect to see @http is on the pi-agent images." (`tasks/20261104-135806-module-audit/TASK.md`)

**Decisions that stand.**
- 2026-09-30 and 2026-10-14: one user, no permission bits; "better to use workarounds than adding
  permission bits" (`memory/no-permission-bits.md`).
- 2026-10-13: "Both SLOP and RUN are needed, see the history, this is hard earned wisdom."
  2026-10-01, Dollyfile 6: "the assertions are the explicit contract"
  (`tasks/20261013-144241-dollyfile-words/TASK.md`). Closed with nothing to change on 2026-10-14:
  `SLOP` and `RUN`, `COPY`, the words to retain, export and require, the roles, `runtime.h`,
  `SPAWN_INTERACTIVE`, the supervisor's tree and limit. This audit does not reopen them.
- 2026-11-03: one renderer owns things that belong together; never two mechanisms made to look
  alike (`memory/one-source-for-ui.md`).
- 2026-11-07: installed packages in the browser's store instead of kernel memory is paused: "it
  needs a lot more thought" (`tasks/20261104-191927-package-store/TASK.md`).

**A second backend.**
- 2026-11-11: "I'm interested in a native host in Rust with wasmtime. I want 0 javascript in the
  code." (`~/dev/donna/tasks/20261110-225114-native-host/TASK.md`); for a terminal, "something I
  can connect to" (`tasks/20261111-153644-console/TASK.md`). `AGENTS.md` states the secondary goal:
  the API "can be specialized independently of the backend".

**How to act on audits.**
- 2026-10-13: "The audit is too blunt. Some of the points are good but some are garbage... Create
  tasks to investigate each of your points more in detail without deciding if they should go or not".
- 2026-10-14: "If your investigation confirms they are fixes that improve things and aligh with
  the main goal of the project go ahead. If you're uncertain, give me a short description".
- 2026-11-04 and 2026-11-08: no approval queues; "Do not wait for me to approve these things."
  (`memory/decide-dont-ask.md`)

**Current direction, where it changed.** Agents were the purpose and are now one use. The module
list was "every image declares its base" until 2026-11-05 and is now "an application declares
what its packages need, nena enables the rest". The grammar had two parsers until `da086a4c6`
(2026-11-04) and has one, the page's. Since 2026-11-11 the contract must also serve a host with
no JavaScript; that is the newest yardstick and the one the code has been measured against least.

## 2. Architecture findings

### A1. "Host module" names seven mechanisms; three are kernel features with a manifest

Evidence: the 21 `host/*/module.json`, `docs/browser-boundary.md:72-94`, and where each module's
code runs.

| Shape | Modules | Channel |
| --- | --- | --- |
| Leased device | gpu, audio, microphone, nena | one `(address, size)` import, reply slots (`src/device-lease.c`, `host/runtime/lease-bridge.mjs`) |
| Dispatch import | http (10 parameters), download, html (`(op, address, size)`) | an import each, own framing |
| Mailbox | display, input, touch, upload, snapshot | atomic words in kernel memory, no import |
| Kernel exports the host calls | console | 9 exports (`host/console/dolly-console-0.wat`) |
| Kernel only, supervisor delivers | threads, pty, sockets | no import; supervisor exports |
| Process Worker | dso, stack | no kernel entry |
| Reserved URL on the broker | build, packages | `https://NAME.dolly.invalid` through `http@0` |

The first row is the owner's unit: a directory, a manifest, one import, and a kernel side of 18 to 47 lines
(`host/audio/kernel.c`, `host/gpu/kernel.c`) over the shared `src/device-lease.c`. The rest each invented a channel. The kernel links every
module's `kernel.c` always (`toolchain/CMakeLists.txt`, `dolly-kernel-modules.h`); a manifest
switches only the JavaScript side.

Why it matters: "one directory + module.json per host bridge" is true of files and not of
mechanism. A reviewer of a new module cannot ask "does it follow the pattern", because there are
seven. A second host implements seven.

Proposal: say in `host/README.md` that there are two kinds and name them. A *bridge* gives
browser authority through one import and follows the leased-device shape unless it streams bulk
bytes (http, download, upload, display frames). A *kernel feature* (threads, pty, sockets, console,
dso, stack) gives none and is part of `runtime@0`'s contract, declared by programs as today.
Then converge the bridges: html and download fit the leased-device packet as they are (one
caller, small packets, one reply); that removes two imports' private framing. Uncertain: whether
upload and snapshot should become imports; their mailboxes work and are bounded.

### A2. The core supervisor knows threads, pty and console by name

Evidence: `src/process-supervisor.mjs` imports `../host/threads/threads.mjs` and
`../host/threads/abi.mjs` (lines 5-6), calls `dolly_threads_attach`, `_dispatch`, `_unstarted`,
`_retired` (588, 781, 818, 886), `dolly_pty_take_signal` and `dolly_pty_taken_signal` (343-344)
and `dolly_console_spawn` (287); the word "thread" occurs 133 times in it and 33 in
`src/process-worker.mjs`. `host/runtime/runtime.mjs:1` imports the supervisor, so the dependency
runs both ways. The kernel core calls the display's and input's functions directly
(`src/dolly.c:156-212`, `src/process-kernel.c:1780`), declared in `src/process-kernel.h` under
"The terminal device, host/display/kernel.c".

Why it matters: owner, 2026-10-01: remove module-specific knowledge from `src/`. Disabling
`pty@0` or `threads@0` removes no code path from the supervisor or the kernel; the modules are
names for parts of one program. Donna's `supervisor.rs` (1,867 lines) carries all three.

Proposal: either move these three into `runtime@0`'s contract and stop calling them modules on
the host side (programs still record `threads@0`, `pty@0` for admission), or give the
supervisor one generic hook they use: a kernel export "next signal the kernel raised: pid,
signal" replaces `dolly_pty_take_signal` and `dolly_process_take_alarm` (both are "deliver this
signal to that pid", `process-supervisor.mjs:333-346`), and `console@0`'s spawn becomes an option
of `dolly_process_spawn_serialized`. The first is less code and matches what the code is.

### A3. Contracts by accident: what Donna had to type by hand

The WAT contracts and `dist/dolly-abi.json` (`scripts/abi-data.mjs`, `c5d773833`) are the best
part of the core: typed, hashed, generated for a non-JavaScript host. Outside them a host still
depends on:

1. **`malloc` and `free`.** The supervisor allocates each process's 1 MiB mailbox with
   `kernel.malloc` (`src/process-supervisor.mjs:659`, also `518`, `host/runtime/boot-files.mjs:10`).
   No host contract names them; they are exported because `abi/dolly-kernel-plugin-0.wat:16-19`
   lists them as the Ghostty plugin's imports. Donna calls both (`~/dev/donna/src/supervisor.rs:645,1246`,
   `kernel.rs:503-569`). Proposal: `dolly_process_worker_mailbox(pid, tid, 0)` allocates and returns
   the address, and its withdrawal frees it; boot files use the existing transfer ranges.
2. **Boot-control files.** The host writes or reads `/etc/dolly/recipe.locator`, `recipe.rows`,
   `upload.Dollyfile`, `image.manifest`, `artifacts/N`, `image`, `entry`, `environment`, `enabled`
   (`src/build-worker.mjs:57-59,82,137`, `host/nena/nena.mjs:13`, `src/worker-image.mjs:118`). Their
   paths and formats are in comments. Donna repeats them as string literals
   (`~/dev/donna/src/images.rs:445-448,652-687`, `nena.rs:26`, `supervisor.rs:346`). Proposal: the
   paths as constants of `abi/dolly-image-0.wat`'s data (they reach `dolly-abi.json` for free)
   and one paragraph per file in `abi/README.md`.
3. **The image directory.** `dist/dolly-images.json`, `dolly-NAME-system-snapshot.json`
   (`formatVersion: 2`, `identityVersion: 2`, `scripts/image-directory.mjs:41-42`), pack naming and
   the image build ID's computation are defined by `src/images.mjs`, `src/packaged-snapshot.mjs`
   and `src/image-inputs.mjs`. Donna's `images.rs` (681 lines) was written from those files.
   Proposal: `docs/` gets the format as a contract, with the fields a reader must check.
4. **The kernel-plugin contract** is "the exact surface required by the source-built Ghostty
   display driver" (`abi/dolly-kernel-plugin-0.wat:5-6`): 24 libc functions (`fopen`, `openat`,
   `unlinkat`, `realpath`...) as kernel exports. See K2.
5. **Mailbox words.** `DOLLY_TERMINAL_WORD_*` and `DOLLY_SESSION_WORD_*` are JavaScript-side
   constants with no `offsetof` check against the C that mirrors them (2026-11-07 audit 3.3; not re-read).

Why it matters: "The core interface must remain small, typed, inspectable, and versioned"
(`AGENTS.md`). These five are interface and are none of the four.

### A4. The host half of the process model is as large as the kernel half

Evidence: `abi/dolly-supervisor-0.wat` has 31 functions and `abi/dolly-image-0.wat` 14, before
the modules' own. `src/process-supervisor.mjs` is 1,098 lines and interprets five operations'
responses by number (SPAWN, EXEC, EXIT, SIGNAL, SIGNAL_ACKNOWLEDGE, `:795-845`) and holds
lifecycle policy as constants: 500 ms signal grace, 5 s spawn patience, 1 s mailbox seal, 56
Workers, 4 GiB budget, a 16 ms tick (`:31-86,207`). Process state is in two tables, the kernel's
`process_table` and the supervisor's `processes` map, kept in step by eleven calls
(`worker_started`, `_exited`, `_failed`, `_retired`, `exited`, `collect`, `parent`, `spawn_flags`,
`exec_commit`, `exec_refused`, `exit_signal`). Donna's supervisor is its largest file; its
request 5 had to ask which limits are contract (`a53be9e97` answered in `docs/process-model.md`).

Why it matters: AGENTS.md puts process bookkeeping in Wasm memory. The bookkeeping is there; the
policy that drives it is in the host and must be re-derived per backend. Every rule kept in the
host is a rule two implementations can disagree on.

Proposal (investigate, measure nothing first): the kernel returns the next action, the host
performs it. One export, `dolly_process_next_event() -> (kind, pid, value)` with kinds launch,
deliver-signal, arm-timer, terminate, retire, replaces the polls `next_launch`, `take_alarm`,
`take_interrupt`, `take_wakeup`, `deadline_remaining`, `deferred_milliseconds` and the pty pair;
the grace and patience values become kernel constants. The host keeps what only it can do:
compile, start and end Workers, sleep. This is a contract revision (`dolly-supervisor-1`), a
compiler round, and the owner's kind of decision.

### A5. `build@0` and `packages@0` ride the network edge

Evidence: `host/http/local-services.mjs`; `host/packages/module.json` and `host/build/module.json`
depend on `http@0`; `Dollyfile` (default) declares `http@0` and `packages@0`. Counted today over
217 recipes: `http@0` on 78, 18 of the 26 applications. Open and unranked since 2026-11-04:
`tasks/20261104-143110-modules-r5` (priority 60, "only if the owner wants"), `-r4` (SOURCE through
build inputs, so a build has no network edge), `-r3`.

Why it matters: the owner's sentence of 2026-11-04 is "the only place I expect to see @http is on
the pi-agent images". `AGENTS.md` calls `env.dolly_http_dispatch` "the sole intentional
agent-selected network edge"; today it also carries a package installer and a build service whose
requests never reach a network. A program with `packages@0` must hold the import that reaches
Fetch.

Proposal: do r4 and r5 as written; raise their priority above cleanup. With A1's leased-device
shape, `packages@0` is one import and a client of about 70 lines (the size of
`host/nena/client.c`), and `amy` no longer links an HTTP client.

### A6. Site machinery lives in `host/` and `src/` as if it were runtime

Evidence (2026-11-07 audit S1, S3, S4, all standing): `src/` is one directory for the kernel, the
page, the site's builder, session store and pack cache, and 48 guest programs. `host/build/ui.mjs`,
`host/packages/service.mjs` and `host/snapshot/snapshot.mjs` import `src/image-builder.mjs`,
`image-build.mjs`, `image-artifact.mjs`, `custom-image.mjs`, `images.mjs`, `packaged-snapshot.mjs`,
`session-store.mjs`. Fifteen runtime sources import `dist/` (`src/process-supervisor.mjs:1`,
`src/pack-store.mjs:10`, `host/dso/process.mjs:7`, ...), so an unbuilt checkout cannot import the
supervisor. `host/modules.mjs:108-116` holds `framePoint`, canvas geometry, in the registry.

Why it matters: a path does not say whether a file is perimeter (`src/libc-host.c`), trusted page
code or a guest program (`src/slop.c`). The trusted JavaScript is 8,732 lines under `host/` (426
generated) and 5,251 under `src/`; about 2,400 of the latter are the site's, not `boot()`'s.

Proposal: `kernel/`, `process/`, `page/` (boot's files), `site/` (builder, sessions, packs,
custom images), `programs/`. `host/build`, `host/packages` and `host/snapshot` keep their module
sides and import `site/`. File moves only; ranked below A1 to A5 (`tasks/README.md` ranks
reorganization last).

### A7. Smaller items

- **`runtime.h` has six spawn functions for one packet** (`include/dolly/runtime.h:55-85`:
  `dolly_spawn`, `_foreground`, `_timeout`, `_env_timeout`, `_env_cwd`, `_mapped`). Settled as
  "nothing to change" on 2026-10-14; recorded only because the count has grown since.
- **A runtime is "a module that provides the kernel"** (`host/README.md`, `host/modules.mjs:30-35,63,257-263`,
  `manifests.mjs:17`): the code handles several and there is one; the README's last paragraph
  says a second "needs its provider to name" the kernel, seed and contract paths that are fixed
  today. The owner liked the requirement line (2026-10-02). The plural machinery is "might be
  useful in the future"; about 15 lines.
- **Test hooks in shipped pages**: `src/route.mjs:20-21` reads `globalThis.DOLLY_HOST_MODULES`,
  `DOLLY_HTTP_POLICY`, `DOLLY_HTTP_RELAYS`; `scripts/page-image-build.mjs` reads
  `globalThis.DOLLY_HTTP_POLICY`. On the public site they are unset. Any script that runs in the
  page first sets the policy; that is inside "XSS is outside the model", and it is still the one
  place where the site's policy is chosen. A `<meta>` or the route's `data-` attributes, which
  `route.mjs` already reads for the image, would say it in the page's own source.

## 3. Security boundary findings

No escape from the sandbox was found. Spans are checked against the memory's current length and
copied before use in every provider read (`host/http/broker.mjs:57-79`,
`host/runtime/lease-bridge.mjs:51-52`, `host/html/html.mjs:224-233`, `host/download/download.mjs:120-145`);
the supervisor checks every value the kernel returns before using it as an address
(`src/process-supervisor.mjs:554-570,742-752,803-833`). Findings, most consequential first.

### S1. `dolly-build`'s relay gives build steps the build machine's network, without CORS

Evidence: `scripts/dolly-build.mjs:205-233` (`7a3793aaa`, 2026-11-11, the owner's CI complaint in
`tasks/20261111-071602-ci-image-builds`). The build page's broker fetches every admitted request
from `http://127.0.0.1:PORT/relay/SCHEME/HOST/PATH`; Node performs it with `redirect: "follow"`
(`:224`) and returns the body. The page's policy is `globalThis.DOLLY_HTTP_POLICY`
(`scripts/page-image-build.mjs:31`), which `dolly-build` never sets: every destination is
admitted. Guest headers pass except `host`, `connection`, `origin`, `referer`, `cookie`,
`accept-encoding`, `content-length` and `sec-*` (`:210,220`); `authorization` passes. The relay
has no token: any local process, and any page in a browser on the machine that finds the port,
can use it while a build runs.

What it widens: in a browser, a program cannot read a response from a host that sends no CORS
headers, and `docs/browser-boundary.md:202-203` leans on that for loopback and LAN ("responses
need CORS"). Through the relay a build step reads any HTTP service the build machine reaches:
`http://169.254.169.254/` (cloud instance credentials on a CI runner), `localhost` services, the
intranet; a public host can redirect there. The same default policy lets it send what it read
anywhere. The attacker is any code a recipe runs: a package's install script under
`SLOP pip install`, or a compromised package snapshot.

Confidence: high on the code path; not exercised. It replaced a worse state (a browser started
with web security off), so it is an improvement that left a hole.

`docs/browser-boundary.md` has no row for it; `docs/embedding.md:226-229` describes it as a
convenience. `AGENTS.md`: "no path around the HTTP broker"; this is the broker's fetch moved to a
process with more reach.

Proposal: (1) the relay refuses loopback, link-local and private addresses unless
`--allow-private` is given, checked on the resolved address and at each redirect hop
(`redirect: "manual"`, at most 10). Donna already has the rule (`denyPrivateAddresses`,
`~/dev/donna/tasks/20261110-230235-http/TASK.md:70-72`); (2) a random path token the page is
given, so only the build page uses the relay; (3) a `--http-policy FILE` option, so CI can pin a
build to PyPI; (4) a row in the review map. (2026-11-07 F3 also stands here: `:58-59` launches
Chromium with Playwright's default, no OS sandbox.)

### S2. `packages@0` with a guest-named directory: more than the admitted URL is fetched and kept

Evidence: since `0df7aa0b1` (Donna's request 1) `GET https://packages.dolly.invalid/v1/packages/SHA256/from/DIRECTORY`
reads a directory the guest names. `host/packages/service.mjs:52-56` asks the policy about one
URL, the directory's; `host/packages/worker.mjs:12-15` then imports `DIRECTORY/dist/dolly-images.json`
and `dolly-NAME-system-snapshot.json` as JSON modules (`src/images.mjs:10`,
`src/packaged-snapshot.mjs:61`) and fetches `DIRECTORY/dist/packs/SHA.snapshot.gz` with
`credentials: "same-origin"` (`:154`), none of them judged or counted by the policy. Each pack
read is written to origin-private storage and recorded (`src/packaged-snapshot.mjs:133-148`,
`src/pack-store.mjs:55-58`).

Consequences, by reading:
1. A rule that admits exactly `https://x/dir/` (`path`, not `pathPrefix`) still lets the page
   request files below it. Small: the URLs are fixed shapes and the bytes are served only when
   their digest matches.
2. `maxRequests` counts one request for a package of many packs.
3. Under the default policy a program can make the page store up to 64 snapshots of 2 GiB of
   bytes of its choosing in the origin's storage (content-addressed, so nothing is poisoned; it
   is disk, and it persists until another image read prunes it).
4. The catalog and metadata JSON have no size bound before `import()`.

`docs/browser-boundary.md:247` ("Only the page and its Workers write it, from trusted metadata...
bytes of the catalog and nothing else") and `src/pack-store.mjs:8-9` ("nothing of the guest
reaches it") are no longer true.

Confidence: medium; the Worker's `imageBase` is the guest's directory after
`loadImages(data.directory)`, which is what makes the store's record foreign.

Proposal: a foreign directory's packs are not kept (`noStore` for `imageBase !== page's`); the
service authorizes each URL it fetches through `admit`; fetch the two JSON files with a byte
bound and `JSON.parse` instead of `import()`. Correct the two sentences.

### S3. With `nena@0` on the site, the module list bounds nothing, and a switch is silent

Evidence: `src/site.mjs:20-29`: a route whose image declares `nena@0`, a custom image, a build
or a saved session gets every module the repository builds. `host/nena/nena.mjs:56-69` enables
any module that is not `fixed` on a packet; the page shows nothing (`showStatus` is called only
when a restored session re-enables, `:99`). `Dollyfile` (default, the image a visitor opens
first) declares `nena@0`.

This is the owner's design of 2026-10-13 ("freely configure") and the document says so
(`docs/browser-boundary.md:106-113`). Two consequences are worth a decision:
1. `gpu@0` is one unprompted call away for any program in `default`: the browser's shader
   compilers with guest WGSL, no user gesture (2026-11-07 F4 asked to keep it off by default; with
   nena it is off and reachable).
2. `microphone@0`: the browser's prompt is per origin and remembered. After one grant to the
   speech demo, any program in `default` enables the module and captures with no prompt
   (2026-11-07 F7, standing). `AGENTS.md` says "only after the browser's own permission prompt";
   that holds once per origin, not per session or image. The page's indicator shows while a capture is
   held (`host/microphone/microphone.mjs:25`), which is the only signal.

Proposal: the page says each switch in its status line ("this session enabled gpu@0"), as it
already does on restore; a module whose manifest says so (microphone) needs a click on that
line before its first OPEN in a session. Both are page-side and change no contract. Owner
decision: whether a nena switch may stay invisible.

### S4. Sessions: the saved Dollyfile names the modules; the check beside it proves nothing

Evidence: `host/snapshot/snapshot.mjs:32-36` compares `record.customImage.source` with
`record.customImage.artifact.recipeSha256`; both come from the same record, which an imported
`.dolly-session` file supplies. `src/site.mjs:54-58` then takes the host modules from that source.
The comment says "A custom save's Dollyfile names the boot's host modules: it must be its
image's."

Effect: an imported session of a custom image boots with whatever `REQUIRES HOST` lines its file
carries, `nena@0` and `microphone@0` among them. On the site that equals pasting a Dollyfile into
`/custom/`, so nothing is widened; the check reads as authentication and is integrity only.
The HTTP policy is handled correctly: `restrictDollyHttpPolicy` (`host/http/policy.mjs:270-296`)
intersects, and a missing inheritance throws (`:271-274`). An embedding's `boot({ session })`
cannot restore a custom image (`src/browser.mjs:52-53`), so its module list stays its own.

Proposal: reword the comment and `docs/sessions.md:55-59` ("a restore checks the Dollyfile
against the digest" proves the file is self-consistent, not where it came from). The sessions
page's Import could state the modules an imported save will have. 2026-11-07 F6 (saves are
unencrypted, unsigned, hold credentials and execute on load) stands.

### S5. The HTTP policy

Read whole (`host/http/policy.mjs`, `broker.mjs`, `http.mjs`, `local-services.mjs`). It is
enforced on the page, before Fetch, on a copy of the request; `credentials: "omit"`,
`referrerPolicy: "no-referrer"`, redirects only under the default policy and the guest's flag
(`broker.mjs:295-302`); reserved `*.dolly.invalid` URLs never reach Fetch (`local-services.mjs:28-35`);
the slot leak of 2026-11-07 is fixed (`host/http/kernel.c:123-136`). Standing, by design or open:
- The public site has no policy: everything in a session can be sent anywhere (F1, owner's
  decision of 2026-09-30).
- Credential stripping under a hardened rule is six header names (`policy.mjs:7-14`). A token in
  `PRIVATE-TOKEN`, `X-Auth-Token` or a query string leaves to any admitted origin (F12). Inverting
  it (a rule names the request headers that may leave) is about ten lines.
- A hardened rule does not bound the query string; an admitted origin is a channel.
- `admit(url)` (`http.mjs:44-51`) counts against `maxRequests` and is called once per package
  (S2).

### S6. `html@0` after its redesign

The frame changed on 2026-11-11 (`4d05b19dd`) from an opaque-origin frame that ran a script
under a nonce to `sandbox="allow-same-origin allow-forms"` with no script
(`host/html/html.mjs:59-125`). The page parses the document with `DOMParser` and copies allowed
elements and attributes into new elements; no `href`, `src`, `style`, `action`, `target` or event
attribute is in the lists (`:71-95`), and `password`, `file` and `image` inputs are refused.
By reading this is sound, and it no longer depends on the embedding's CSP. Residual:
- No visible, uncoverable line says the popup is a program's (F11 stands); `title` and
  `aria-label` say it to assistive technology only (`:181-184`).
- Fields named `email`, `tel`, `cc-number` may draw browser autofill offers in a same-origin
  frame. Not measured in either browser.
- A submission over 64 KiB is dropped without a word (`:121`): the user presses Submit and
  nothing happens.
- The 2 s quiet period follows a close, not a submit (`:219`); a program can show the next popup
  at once after a submit. The Close button always works, so this is nuisance only.

### S7. `console@0`

New since the last audit. `openConsole` is a member of the page's handle; no import, process
operation or packet lets a program open, read or write a console
(`host/console/dolly-console-0.wat`, `host/console/console.mjs`). It gives a program nothing.
One availability gap: the page side enqueues output without backpressure
(`console.mjs:34,46`, the Worker reads until empty on every tick, `:66-72`), so a program writing
to a console the embedding reads slowly grows the page's heap without bound. Proposal: the Worker
stops reading a console while more than a few MiB are unacknowledged (`ask` instead of `send`).
`console` has no `fixed`, so `nena enable console` adds `openConsole` to the handle of a nena
session; harmless.

### S8. The review map against the code

`docs/browser-boundary.md` has a row for each of the 21 modules and the rows match the manifests'
imports. Missing or stale:
1. `dolly-build`'s relay (S1): no row.
2. The pack store sentences (S2), `:247`.
3. `src/route.mjs`, new on 2026-11-11, is not in "Trusted files" (`:266-273`); it is the file
   that chooses the site's module list and HTTP policy.
4. The module table's `html@0` row is accurate after the redesign; the diagram at `:21-59` has
   no `console@0` (it has no guest edge, so this is cosmetic).
5. "A page gives an image the host modules its recipe lists" (`AGENTS.md`) and `:96-105` are
   right; they would be clearer with S3's sentence: on the site, for a nena image, a custom image
   and a session, the recipe's list is no bound.

### S9. Standing from 2026-11-07, not re-examined beyond the lines cited

F3 Chromium without its OS sandbox in `dolly-build` and the image builders
(`scripts/dolly-build.mjs:58-59`, `scripts/build-snapshot-browser.mjs:51`). F5 one origin for
every version and no Content-Security-Policy on the site (`scripts/export-cloudflare-pages.mjs:70-78`
sets COOP, COEP, CORP and caching only), although the page now runs under the strict policy
`docs/embedding.md:160-168` gives. F15 the display's page side checks `stride * height` against
the capacity and not each dimension (`host/display/display.mjs:263-266`). F8, F13 GPU and memory
availability. F9, F14 same-process and hardware channels.

## 4. Dollyfile findings

### D1. The language's only parser is page JavaScript

Evidence: `da086a4c6` (2026-11-04), `docs/dollyfile.md:5-7`: `src/dollyfile-view.mjs` (335 lines)
parses; the engine reads `/etc/dolly/recipe.rows`, NUL-separated fields
(`src/dollyfile-view.mjs:321-327`, `src/dollyfile.c:518`). The format is described in that one
comment.

This removed the two-grammars duplication the earlier audits named, and it is the right split
for a page that must read recipes anyway (graph, pins, lint, custom images). The cost appeared a
week later: a host without JavaScript must write a second parser, and a program inside Dolly
cannot build a Dollyfile without a host (`dollyfile-build` goes out through `build@0`).
Donna's build task (`~/dev/donna/tasks/20261110-230236-build/TASK.md`) lists what the host does
and does not mention parsing; it will meet it. `AGENTS.md`'s goal is building "inside the sandbox
itself".

Proposal: owner decision between (a) `recipe.rows` becomes a stated contract (a paragraph in
`abi/README.md`, a version field) and each host owns a parser, tested against shared cases as
`test/cases/*.json` does for commands; or (b) the parser moves into the engine in C and the page
asks the engine for a recipe's rows and graph (a `dollyfile inspect` run in a disposable kernel).
(b) is one implementation and slower page loads for the catalog; (a) is the state today, made
explicit. Uncertain which is smaller overall.

### D2. Retention: what a recipe wrote and did not keep disappears without a word

Measured on 2026-11-11 (`c99c553fc`): `SLOP pip install x` leaves nothing in the image without
`FOLDER /usr/lib/python3.14/site-packages` after it. `FOLDER` keeps "the members it has at this
row" (`docs/dollyfile.md:110`); exports are captured when the recipe finishes (`:222-223`). An
application `FROM` a base keeps the base's files and not new files in the base's directories.
The owner settled the words on 2026-10-14 ("four meanings in time"); the semantics stay.

The surprise is the silence. The engine already names what ENTRY needs and the image lacks, with
the row to add (`src/dollyfile.c:1892-1903`). Proposal, no language change: at sealing, one line
per directory for files a step created outside `/tmp` that no row retains: "412 files under
/usr/lib/python3.14/site-packages are not kept: FOLDER /usr/lib/python3.14/site-packages". A
recipe that means to drop them ignores the line. Cost: one walk the seal already makes
(`seal_manifest`, `:1944`).

### D3. `APPLICATION` with `FROM`: the npm path writes what the catalog's lint refuses

Evidence: `scripts/dolly-build.mjs:112-114` scaffolds `APPLICATION NAME` then `FROM pi-minimal`;
`scripts/lint-dollyfiles.mjs` refuses an application with `FROM` since R1 (2026-11-05), because
a kept base brings its executables' module stamps. The scaffold compensates by declaring the
union of the base's and the packages' modules (`:108`).

Why it matters: the documented way for a stranger to make an image is the form the project
moved its own 26 applications away from, for a reason that applies to the stranger too (the
owner's 2026-11-04 complaint). Proposal: `dolly-build init` writes `INSTALL` rows of the
packages `pi-minimal` is made of (it is itself assembled from packages) plus the user's; the
lint's rule then holds everywhere. Uncertain: whether `pi-minimal`'s own rows (`init.slop`,
configuration) are packaged; if not, that is the missing package.

### D4. Coherence

The language is small for what it does: 15 declarations, one page of text rules, pins inline.
Counted over 217 recipes: `REQUIRES` 2,305 rows (810 `HOST`, 1,180 `TOOL`, 209 `HEADER`, 105
`LIB`), `SLOP` 1,270, `FILE` 767, `EXPORTS` 742, `SOURCE` 487, `INSTALL` 327, `FROM` 178, `FOLDER`
125, `USE` 92, `COPY` 85, `RUN` 5 (all in `Dollyfile-system-build`, before Slop exists).
What a newcomer has to learn that the syntax does not show:
- `INSTALL` means three things by role: in an application it keeps the package; in a package it
  keeps nothing and records a row its installers follow; `USE` is the third. The table at
  `docs/dollyfile.md:103-105` says it in half a line each.
- `FROM` keeps everything in an application or toolchain and nothing in a package.
- `REQUIRES HOST` is inherited by nothing and required of everything: the same nine lines open
  most applications. That is the owner's explicit manifest (Dollyfile 6) and is not reopened.
- "only an image with ENTRY and `display@0` can be opened" (`docs/dollyfile.md:281-282`) is the
  site's rule; `console@0` and Donna's `run --headless` open images without a display. The
  sentence should say whose rule it is.

Nothing here asks for a change of the language. D1 to D3 are the findings.

## 5. Kernel and lifecycle findings

### K1. Two stream mechanisms, four byte queues, eight parallel descriptor arrays

Evidence: `src/process-kernel.c:73-82`: a process has `descriptors[]`, `descriptions[]`,
`descriptor_flags[]`, `pipes[]`, `pipe_directions[]`, `sockets[]`, `terminal_descriptors[]` and
`directories[]`, each 1,024 entries; every descriptor operation branches on which is set
(`:1337-1346,1384,1542,1723-1762,1829-1836,2207`). Pipes are built in (`dolly_kernel_pipe`, `:40-47`);
sockets, pseudo-terminal ends and console pipes implement `dolly_kernel_socket_kind`
(`src/process-kernel.h:67-80`), each with its own ring: `host/sockets/kernel.c:25-33`,
`host/pty/kernel.c:16-22`, `host/console/kernel.c:21-27` (`put`, `take`, `:49-63`).

Why it matters: this is "a second mechanism for one job". `console@0`'s pipe console wrote a
fourth queue the day it was added (`34178ba6b`) because the kernel's pipe is not a kind.

Proposal: one descriptor record `{ kind, object, flags }` and the pipe as a
`dolly_kernel_socket_kind`; console's three pipes are then kernel pipes with one end held by the
host. Estimated by reading: 150 to 250 lines fewer in `process-kernel.c` and `console/kernel.c`,
and `process_dispatch` loses its per-kind branches. Kernel-internal; no contract changes. It
needs the lifecycle suites and a round.

### K2. Two terminals

Evidence: the display's terminal is `terminal_descriptors[]` plus the line discipline in
`src/dolly.c:147-212`, output in `host/display/kernel.c`, input in `host/input/kernel.c`, drawn by
a plugin resident in kernel memory (`abi/dolly-kernel-plugin-0.wat`, `src/kernel-plugin.mjs`,
`dolly_input_decoder_install`). A pseudo-terminal is a `dolly_kernel_socket_kind` with a
`terminal` callback (`host/pty/kernel.c`), and `console@0` is a pseudo-terminal whose master the
host holds. They share `dolly_kernel_line_*` and nothing else; `process-kernel.c` asks "is this
the display's terminal or a stream that is a terminal" at `:682-702,1723-1762`.

Since `pty@0` (2026-10-13) and `console@0` (2026-11-11), the display's terminal could be a
pseudo-terminal whose master is the terminal emulator. Two steps, separable:
1. **Kernel-internal** (proposed): the display's terminal becomes a pty the kernel opens at boot,
   its master read and written by the display and input modules. `terminal_descriptors[]` and
   the special cases go; `stty`, SIGWINCH and the interrupt key have one path.
2. **The emulator as an ordinary program** on `display@0`, `input@0` and that master (as
   `ghostty-x11` and tmux already are): the kernel-plugin contract, its 24 libc exports, the
   loader and the decoder registration go. Unmeasured: echo latency (each key would cross two
   process calls) and whether terminal state survives as it does today. The owner asks for
   snappiness (2026-10-16, of Ghostty in X11: "it needs to be snappy"), so this is an
   investigation with a latency number, not a proposal; `docs/display.md:51-52` gives the
   present reason ("terminal state survives
   foreground replacement").

### K3. Lifecycle and failure isolation

By reading, the rules of `AGENTS.md` hold. A process is a Worker with a private memory and one
import; its Worker's failure, a trap, an invalid packet or a refused executable ends that process
with 126 and a line on its descriptor 2 (`process-kernel.c:2783-2791,2851-2858`,
`process-supervisor.mjs:742-752,980-993`); the 2026-11-07 audit measured this. A kernel trap
outside a system call ends the runtime Worker and the page says so (`src/browser.mjs:171-176`).
A parent cannot retire before its children (`dolly_process_worker_retired`, `:2871-2874`), and a
retiring parent disposes them: there are no orphans or daemons, which is the settled "supervisor's
tree".

Session save holds file-changing calls rather than all calls (`dolly_kernel_hold_calls`,
`process-kernel.c:117-124`), a good narrow rule. Not examined: whether every path that changes a
file is behind `change_waits` (mmap writeback, `host/upload/kernel.c`); `docs/sessions.md:42-43`
says an upload landing fails the save, so at least that one is detected rather than held.

### K4. Smaller kernel items, by reading

- SIGCHLD is set pending in the parent at default disposition
  (`process-kernel.c:2885-2889`); the waiting parent's WAIT then returns `-EINTR`, libc polls,
  discards and waits again: three extra round trips per child exit (2026-11-07 M8, unmeasured,
  standing). Pending only when `handled_signals` has it would remove them.
- `launching_pid` is one global (`:662,2778`) read when the supervisor writes about "the
  executable it prepares" (`:680`), while EXEC compiles outside the launch chain: two compiles
  in flight can address the wrong terminal (M9, standing).
- The supervisor ignores the result of `dolly_process_worker_exited` at
  `process-supervisor.mjs:544,892,998` (M9, standing).
- `process_dispatch` is 704 lines (`:1925`), 8 more than on 2026-11-07.

## 6. Implementation findings

Secondary, and thinner than the sections above: the 2026-11-07 core audit measured dead code
(about 110 lines), duplication (about 1,064 removable lines in 29 groups) and tests in detail
(`work/audit-core-2026-11-07/REPORT.md` 3.3 to 3.6, on that machine only). Not repeated here.
New or re-checked:

1. `host/console/console.mjs:34,46`: unbounded page queue (S7).
2. `host/html/html.mjs:121`: an oversized submission is dropped silently (S6).
3. `host/packages/service.mjs:59-60`: `served` counts a request before the package is found; 64
   misses (an offline server) spend the page's quota and every later `amy install` answers 429
   until reload. Count on success.
4. `host/gpu/worker.mjs` is the largest trusted provider (1,180 lines, 80 KB) and is written
   more densely than the rest of `host/` (several statements a line, `:1115-1128`; 12 lines over
   160 columns, none in the other large providers). `AGENTS.md` asks that browser authority
   decisions be "short and directly reviewable by a human"; this file decides what reaches
   WebGPU. Not audited line by line here, and that is the point: it is the provider least
   reviewed per line of authority. Proposal: split validation (packet to checked record) from
   execution (record to WebGPU call), one operation per function.
5. Comments that cite `tasks/2026...`: 4 remain in `src/` and `host/` (9 on 2026-11-07).
6. Tests: `test:artifacts` (the exact import allowlist) is still outside `npm test` by the
   2026-11-07 audit's reading of `package.json`; not re-read. No test covers S1's relay against a
   private address, S2's foreign directory writing the pack store, or S3's silent switch.

## 7. Status of earlier audit findings

**2026-09-13, 2026-09-30 and later** (57 tasks tagged `audit`): all closed but four: the audit of
the application recipes (`tasks/20261102-133232-recipes-apps`) and R3, R4, R5 below. Not
re-examined one by one.

**2026-10-13 reflection and its ten investigations**: closed 2026-10-14 by the owner's rule. The
"two parsers" point was later resolved the other way (D1). `runtime.h` stays unversioned by that
closure (2026-11-07 S6 raised it again; no task).

**2026-11-04 module audit**: R1 and R2 done (`693b9842f`, `e639ef32b`). R3 (the base holds the
toolchain, not conveniences), R4 (SOURCE through build inputs) and R5 (packages off the broker)
are open: `tasks/20261104-143110-modules-r3`, `-r4`, `-r5`. A5 argues R4 and R5 up.

**2026-11-07 core audit** (`work/audit-core-2026-11-07/REPORT.md`, at `9684c7334`). Tasks were
made for the bug and the documents only (owner: "Create tasks for the bug and the docs").

| Finding | Today |
| --- | --- |
| 3.8 HTTP slot leak | Fixed, `def4a5773`; `host/http/kernel.c:123-136` |
| 3.5 sixteen document contradictions | Closed, `tasks/20261107-063426-docs`; not re-checked |
| S1 flat `src/` | Stands (A6) |
| S2 2,944-line kernel file, 696-line switch | Stands: 2,968 and 704 (K1, K4) |
| S3 site in `host/`, runtime and supervisor import each other | Stands (A2, A6) |
| S4 runtime source imports `dist/` | Stands: 15 files |
| S5 Slop includes `commands/echo.c`, `printf.c`, `test.c` | Stands, `src/slop.c:26-28` |
| S6 `runtime.h` unversioned | Stands; closed as intended on 2026-10-14 |
| S8 two spawn encoders, literal offsets | Half fixed: offsets are `spawnField.*` now (`process-supervisor.mjs:156-167`); two encoders remain |
| Duplication 2, the grammar twice | Fixed, `da086a4c6` |
| Duplication 1, 3 to 29 | Not re-checked |
| M2 `slop.c` 5,911 lines in one file | Stands |
| M4 comments citing tasks | 4 left |
| M6 generated files without a currency check | Not re-checked |
| M7 the 16 ms tick as an undocumented net | Stands, `process-supervisor.mjs:207` |
| M8, M9 | Stand (K4) |
| 3.6 kernel and supervisor tested only through browser suites; prose assertions | Not re-checked |

**2026-11-07 security audit** (`work/audit-security-2026-11-07/REPORT.md`). No remedy has a task.

| Finding | Today |
| --- | --- |
| F1 everything is exfiltrable under the default policy | By design; stands |
| F2 the agent has every capability the sandbox grants | By design; stands |
| F3 untrusted images in a Chromium without its OS sandbox | Stands; S1 adds the relay |
| F4 engine features and the GPU compiler reachable | Stands; S3 |
| F5 one origin, every version, no CSP | Stands for the site; the page now runs under a strict CSP (`4d05b19dd`), so serving one is possible |
| F6 saves unencrypted, unsigned, executable | Stands; S4 |
| F7 remembered microphone grant plus nena | Stands; S3 |
| F11 the popup as a phishing surface | Stands; the frame was redesigned (S6) |
| F12 six-name credential list | Stands; S5 |
| F13 no page-side memory budget | Not re-checked |
| F15 display frame dimensions | Stands, `host/display/display.mjs:263-266` |
| F16 clipboard copy of an untrusted selection | Not re-checked |
| F8, F9, F10, F14, F17 | Not re-checked; inherent or accepted |

**`audits-from-sandbox/`** (agents' reports from inside an image, 2026-10-06): user-experience
findings; nothing on the core's structure that is not above.

## 8. Proposals

**Fix, no decision needed** (each small, page-side or script-side, no contract change):
1. S1: the relay refuses private addresses by default, follows redirects by hand, takes a token
   and an optional policy file; add its row to `docs/browser-boundary.md`.
2. S2: foreign directories' packs are not kept; every URL the service fetches is admitted; the
   two JSON files are fetched with a bound. Correct `docs/browser-boundary.md:247` and
   `src/pack-store.mjs:8-9`.
3. S8: add `src/route.mjs` to "Trusted files".
4. S7, S6, section 6 items 1 to 3: console backpressure; say when a submission is too large;
   count served packages on success.
5. S4: reword the comment and the sentence in `docs/sessions.md`.
6. D2: the sealing line for unretained files.
7. A3.1: the mailbox allocation behind `dolly_process_worker_mailbox`, so no host calls
   `malloc`; A3.2 and A3.3: the control files and the image directory written down as contract.
   (A3.1 changes the supervisor contract; batch it with the next compiler round.)
8. K4: the three small kernel items, after measuring M8.

**Simplify or merge** (kernel or supervisor internals; a round each, batch them):
1. K1: one descriptor record, the pipe as a stream kind. Removes the fourth queue and the
   per-kind branches.
2. K2 step 1: the display's terminal as a pseudo-terminal inside the kernel.
3. A2: threads, pty and console as parts of `runtime@0` on the host side, or one "next signal"
   export in place of the pty and alarm pairs.
4. A1: html and download on the leased-device packet.
5. A5: R4 (a build has no network edge) and R5 (`packages@0` its own import; `default` without
   `http@0`).
6. A6: the directory split.

**Remove**:
1. With K1, K2: `terminal_descriptors[]`, `host_pipe`, the display-terminal branches.
2. With R4: the HTTP client in `/bin/dollyfile`, `http@0` from `buildHost` and from the
   toolchains that declare it for the engine alone.
3. With R5: `host/http/local-services.mjs`'s package half; `packages@0`'s dependency on `http@0`.
4. A7: the plural-runtime code paths, if no second kernel is planned.

**The owner's decisions**:
1. **S3**: may a nena switch stay invisible, and may a remembered microphone grant be used by a
   module the session enabled itself without a click? (Suggested: a status line for every
   switch; a click for the microphone.)
2. **D1**: the Dollyfile parser: a stated `recipe.rows` contract with a parser per host, or the
   parser in the engine.
3. **A4**: a `dolly-supervisor-1` in which the kernel decides and the host executes, so a second
   host is a thin one. The largest change here and the one that most reduces what Donna copies.
4. **K2 step 2**: the terminal emulator as an ordinary program. Investigate with an echo-latency
   measurement first; nothing is proposed before that number exists.
5. **A5**: whether `default` keeps `http@0` (R5's standing question since 2026-11-04).
6. **S5**: invert credential stripping under a hardened policy (a rule names what may leave).
   It breaks embeddings that rely on unlisted headers passing.
7. **F5**: a Content-Security-Policy for the public site, now that the page runs under one.

## Closed (2026-11-12)

The audit is the record; its findings live in the tasks above, by the owner's instruction of
2026-11-12.
