# Define host modules through headers, libraries and versioned contracts

- STATUS: CLOSED
- PRIORITY: 260
- TAGS: architecture,runtime,abi

User wants images to declare host requirements such as threads, with each module
exposed through one public host JS module paired with one public C header.
Establish this before implementing
20260926-181716-codex-threads. Initial DOLLY 4 implementation verified on September 26.

Starting point:

- `include/dolly/{runtime,display,gpu,http,download}.h` already expose separate
  interfaces. `abi/` holds typed WAT contracts for these and other bridges.
- The GPU extension owns process-call operation 128 and a separate contract;
  adding it did not change the base process ABI digest.
- `src/runtime-worker.mjs` and `src/browser.mjs` wire providers centrally.
  `src/image-builder.mjs` separately boots a headless build configuration.
- Dollyfile REQUIRES previously checked userspace tools, files and environment;
  it did not declare host capabilities, and artifact metadata lacked a required
  host-module set.

Program interface:

The public pairing is `src/host/<name>.mjs` and `include/dolly/<name>.h`, backed
by `abi/dolly-<name>-<revision>.wat`.
Private implementation files, generated ABI headers and Worker scripts can sit
behind that pair. One public module does not mean forcing all implementation
into one file. The C header is the guest API; the JS entry point implements the
host side of the same versioned contract through the kernel/supervisor adapters.

Give each JS entry point the same small lifecycle interface: module identity and
ABI revision, availability check, binding/initialization and disposal. Inject
only its required trusted resources. A fixed registry composes providers and
routes their declared imports/mailboxes/messages; it does not own their behavior.
Use ordinary ES module exports, not a class hierarchy or guest-loadable plugins.

```c
#include <dolly/gpu.h>
#include <dolly/http.h>
```

Headers declare types and functions; programs link small Wasm client libraries
(`-ldolly-gpu`, `-ldolly-http`). Libraries marshal calls into
the existing process/kernel substrate. They contain no browser implementation.
Keep the canonical wire contract in WAT/Wasm; generate or verify header layouts
against it. Preserve typed imports, packet sizes and explicit ABI versions.
Do not introduce a string-named generic host-call escape hatch.

Linking a module must record its required ABI in the executable. Merely including
a header must not require a host provider. Define and verify the stamping rule
for selected archive members, transitive libraries and linker garbage collection;
do not assume arbitrary Wasm custom sections merge correctly. Dynamic modules
need equivalent validation at load time. Requirements are compatibility claims,
not trusted proof of what compromised Wasm can call.

Ordinary upstream programs keep their standard APIs. For example, pthread.h and
`-pthread` select the threaded libc/CRT above dolly/threads.h; Box3D should not
need Dolly-specific thread calls. The stable substrate stays below libc.

Image declaration (DOLLY 4):

```text
REQUIRES HOST display@0
REQUIRES HOST gpu@0
REQUIRES HOST threads@0
```

Runtime is the mandatory base. Explicit image requirements describe what must
be available for the intended entry/workflow; executable ABI references also get
checked at command launch. An installed but unused tool must not force every
host capability into an image's boot requirements. Store image requirements in
artifact metadata and revalidate cached/custom images and restored sessions.
Do not enable host authority from mutable files inside the image.

The embedding host chooses permitted providers and their policies. A fixed
trusted registry maps module IDs/ABI versions to implementations with dependency,
probe, bind and disposal operations. An image cannot name a JS file or Worker URL.
Missing, denied or incompatible mandatory providers fail before ENTRY with an
actionable error; use metadata for early checks before large snapshot downloads.
Do not add a general package/plugin loader or optional-feature framework.

Runtime owns the base execution bridge; display owns presentation/input; GPU owns
device operations; HTTP owns broker admission; threads owns parallel process
execution resources. Assign upload/download/snapshot and all existing mailbox,
export and message surfaces explicit ownership too. Each module's contract must
cover more than function imports. Compute-only GPU must work without a canvas;
GPU presentation uses display. All mutable userspace state remains in Wasm.

Provider selection never grants unrestricted networking or Workers. Preserve
`env.dolly_http_dispatch` as the sole agent-selected network edge and enforce
quotas/policy in trusted browser code even after complete userspace compromise.
Initially retain one kernel binary; absent optional providers get typed denial
bindings and no live resources. Do not require a separate kernel build per image.
Provider teardown must cancel pending work and retire resources on boot failure,
reload and exit. Update the browser boundary review map when code changes.

Build and run requirements are distinct. Compiling a GPU program must work on a
headless builder without a GPU. FROM inherits base runtime requirements; COPY
must not import a donor image's ENTRY requirements. Define USE propagation
explicitly and keep compiler-only dependencies out of the final runtime set.
Actual build-time execution uses the builder's permitted providers. Do not try
to infer all runtime dependencies from arbitrary shell scripts or file copies.

Implementation and completion criteria:

1. Extract existing host wiring into the fixed registry with exact ownership
   checks for the complete outer ABI. Preserve current behavior and catalog.
2. Add header/library requirement stamping, Dollyfile declarations, metadata and
   startup/command checks. Keep existing serial images compatible. Avoid image
   rebuilds for host-only changes that preserve the actual ABI/cache contract.
3. In real Chrome and Firefox verify existing GPU/display/HTTP workflows, a
   headless build, compute without display, missing/denied/version-mismatched
   providers, restored-image checks, forged guest calls and resource cleanup.
   Compile the client programs inside Dolly. No native fallback.
4. Track threads as the first new module through the linked task. Keep its
   pthread/TLS/lifecycle and Box3D performance verification separate.

Verified implementation:

- Fixed runtime/display/HTTP/GPU/download/upload/snapshot providers own their
  bindings, handshakes, service hooks and teardown. Public JS/header pairing and
  typed WAT contracts replace the duplicate browser-import classification file.
- DOLLY 4 declarations propagate through FROM/USE, exclude COPY, and survive
  artifact caching and session restore. Missing providers fail before large image
  downloads. DOLLY 3 remains readable; threads@0 is not implemented yet.
- Selected Wasm client archive members stamp linked ABI revisions. Unused
  archives and headers do not. Executables and DSOs reject unsupported revisions
  before entry/constructors. Linked records check ABI compatibility; Dollyfile
  declarations demand enabled providers. Disabled outer imports return ENOSYS, allowing
  general-purpose runtimes such as QuickJS to use their other APIs headlessly.
- Removed display initialization from snapshot bootstrap. GPU Workers explicitly
  acknowledge readiness before synchronous calls and refresh shared memory after
  growth. Failed GPU opens retire their scope before publishing completion;
  Firefox's immediate-retry test exposed the old ordering race.
- Blockwalker and its twelve dependencies compiled inside Dolly. Fluid rebuilt
  in 17.1 seconds with cached dependencies. The final kernel change preserved
  the image build identity, avoiding another dependency rebuild.
- 282 source checks, 40 pinned recipes and six targeted artifact/ABI checks pass:
  `build/host-modules-source-final.log`, `build/host-modules-recipes-final.log`,
  `build/host-modules-outer-abi-final.log`. Capability fingerprint generation also
  passes (`build/capability-fingerprint-blockwalker.json`).
- Chrome and Firefox pass real in-Dolly compile/link, transitive archive, DSO,
  forged GPU call, network denial, early image rejection and session reload:
  `build/host-modules-contract-{chrome,firefox}/proof.json`.
- A DOLLY 4 compute image built inside Dolly runs a shader and validates its
  output with only runtime/GPU providers, no canvas or display, in both browsers:
  `build/host-compute-{chrome,firefox}/proof.json`.
- System image passes C/C++, process/DSO ABI, shared filesystem, rg/fd, HTTP and
  cancellation in Chrome and Firefox: `build/host-modules-system-core.log`.
- Blockwalker passes rendering, edits, typing, held-key release, fullscreen,
  design/world restore, repeated saves and preservation after failed saves:
  `build/blockwalker-session/result.json`,
  `build/blockwalker-session-firefox/result.json`.
- Fluid passes both browsers: controls, solver output matched against direct GPU
  replay, no normal-frame readback, two interrupt/restarts, malformed packets,
  quotas, ownership, scope reuse, validation recovery and memory growth, with and
  without a canvas: `build/fluid-proof/results.json`,
  `build/host-modules-fluid-browser-final.log`.

Draft preview: http://127.0.0.1:9098/blockwalker/ via
`dolly-host-modules-draft.service`. Frozen image44 remains on port9099 via
`dolly-blockwalker-checkpoint44.service`. No production deployment or merge.
Threads and the outstanding Lua/performance work remain separate tasks.
