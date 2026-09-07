# Reviewing the browser boundary

Assume every program, file, credential, and byte of Wasm memory is compromised.
The question is then small: **what can the browser be asked to do?** Internal
command isolation is not the answer; the browser providers are the boundary.

## Start with the actual imports

[`dolly-browser-0.wat`](../abi/dolly-browser-0.wat) lists all 28 kernel imports,
including memory, with exact types and comments describing their authority.
The build compares that contract against the finished `dolly.wasm`: missing,
additional, renamed, or differently typed imports fail the build.
`config/browser-imports.json` only groups names for capability reports; it does
not define the ABI.

There is one agent-selected network operation, not one import altogether:

```text
Wasm request data
  → env.dolly_http_dispatch
  → browser authorization
  → fetch with explicit options
  → bounded response mailbox in Wasm memory
```

## Follow one request

Read these pieces in order:

1. [`src/dolly.c`](../src/dolly.c), `dolly_http_dispatch`: the short import
   supplies four pointer/length pairs, flags, sequence and the actual memory.
   It scans/copies no guest bytes.
2. [`src/http-broker.mjs`](../src/http-broker.mjs), `createHttpAdmission`:
   the runtime worker forwards one descriptor and waits for a private browser
   acknowledgement. Wasm cannot mutate it or flood an unbounded message queue.
3. `NetworkTransport.dispatch`: checks every span before copying, with fixed
   method/URL/header/body caps of 32 B/8 KiB/64 KiB/8 MiB. Then `request`
   parses the URL and headers, calls `policy.authorize`, and calls Fetch.
   UTF-8 fields are literal; `Headers` performs header validation and value
   whitespace normalization without an extra Unicode trimming pass.
   This is the complete request/response transport, separate from the UI.
4. [`src/http-policy.mjs`](../src/http-policy.mjs), `DollyHttpPolicy.authorize`:
   the trusted embedding's destination, method, credential-header, and quota
   rules. The policy comes from trusted page configuration, not Wasm.

The fetch call always omits ambient browser credentials and referrers and
rejects redirects. Credentials supplied by the sandbox remain ordinary request
data; the browser never injects secrets. Request and response limits and the
deadline belong to the browser. A guest that stops consuming mailbox records
cannot keep the request alive beyond that deadline. Terminal failure uses a
separate atomic state, so a late guest acknowledgement cannot erase it.
Failures carry target errno codes, never request contents or credentials.

The demo deliberately permits arbitrary HTTP(S). That is useful for agents,
but it **does not prevent exfiltration of sandbox data**. An embedding needing
a restricted network must install explicit rules; see [HTTP policy](http.md).
An allowed destination can itself relay data or have external side effects:
an allowlist bounds authority, not the intent of each request.

## Check for other authority

The remaining imports supply clocks, entropy, startup data, memory growth,
abort, and bounded local output/device operations. They do not grant host
paths, native processes, sockets, DOM access, or JavaScript evaluation.
User input, framebuffer output, file downloads, and explicit opaque session
storage are additional visible channels; see the [security model](security.md).
Download names use literal UTF-8; basename, character and size checks remain
independent of the browser's final filename choice.
Input packets and copied selections also preserve literal UTF-8 across packet
boundaries. Image identity checks do not discard leading characters.
"One network edge" does not mean "no other information crosses the boundary."
For saves, Wasm owns base fingerprints and filesystem delta encoding; the page
copies bounded opaque chunks to local IndexedDB. `/session/` lists metadata and
`/session/NAME` boots the verified base before Wasm applies the delta. No new Wasm
import or path-level host filesystem API is involved; see [sessions](sessions.md).
For a rebuilt image, the page's first save reads the selected image's fixed
snapshot metadata and checks the complete rebuilt base digest before allowing
a delta save. It cannot substitute a guest-selected metadata URL.

Boot reads fixed application assets. `runtime-worker.mjs` accepts only the
fixed `dolly.wasm` and `dolly.data` artifact names for the generated runtime.
Other startup snapshots and recipe assets have their own fixed identities;
these reads are not guest-selected URLs.
Regression commands live in `test/fixtures`, not in the shipped page; there is
no URL-triggered shell test runner. The harness drives normal image startup.
V3 artifact loading lives in [`src/image-artifact.mjs`](../src/image-artifact.mjs).
Local cached bytes are bound to the runtime ID, pinned root recipe, snapshot
hash, and direct input artifact digests. Published artifacts also validate the
release's complete recipe inventory.
Dependency selection reads small descriptors; only a worker's direct inputs
load payloads, whose full hashes are checked against those selected descriptors.
Cache metadata, bytes and old-version cleanup commit in one IndexedDB transaction.
[`src/image-build.mjs`](../src/image-build.mjs) resolves only image identities
present in the release and reads module sources from the generated static-source
allowlist. That allowlist includes the release's nonempty regular `modules/*.dm` files,
including unused modules; it does not admit arbitrary checkout paths or stage
their dependencies. Source hashes and byte lengths remain exact.
Missing dependencies run sequentially in disposable Wasm workers;
`browser.mjs` gives each worker the same HTTP policy and bounded broker handshake.
Their entry programs never start. Artifacts are opaque build results in IndexedDB;
restoration and all filesystem mutations happen in Wasm. This adds no kernel import
or guest-selected browser filesystem operation.

The development server is also an HTTP destination. `scripts/serve.mjs` and
the browser harness serve application assets, not the host checkout. The local
server serves only manifest-listed files from verified whole-app releases;
HTML pins assets under `/_dolly/RELEASE_DIGEST/`. This is static application
delivery, not a guest-selected host filesystem capability. Documentation links
are packaged from an explicit public-source allowlist and checked before release;
links cannot publish arbitrary checkout files. The harness confines documentation
requests to `docs/`. Tests request encoded parent paths and require 404.

Only `dist/packs/HEX_DIGEST.snapshot.gz` also has a release-independent URL.
That lookup searches digest-verified published manifests, then checks the selected
file against its manifest hash. It never serves loose cache/build files. Old
published packs remain available for release-pinned tabs after publication.

Mouse and touch forward the same bounded press/drag/release records. The host
has no phone mode, gesture interpretation, or application command menu.
Phone-oriented images own their controls and gesture handling inside Wasm;
they use the same framebuffer and input contract as desktop images.

Display mailbox v5 permits a graphics owner to request captured mouse input.
The host calls `requestPointerLock` only inside a user's canvas press handler,
never from a Wasm callback or background message. Escape and lease release undo
capture; only bounded relative deltas and capture-state records enter Wasm.
This grants no network, DOM, filesystem or process handle to the program.

The kernel has **no general browser dynamic-loader import**. It is statically
linked with dynamic JavaScript execution disabled. Ghostty remains source-built
inside Dolly: boot copies its bounded WasmFS bytes and passes them to
[`src/kernel-plugin.mjs`](../src/kernel-plugin.mjs). That small loader accepts
bytes, not paths or URLs, and links only an explicit list of real kernel Wasm
exports plus memory/table globals. It cannot fetch dependencies or evaluate
JavaScript. The ABI stamp checks compatibility; the closed import map, not
trust in the stamp or plugin code, limits authority. Ordinary commands and
process-local DSOs use the separate process boundary.

That process boundary uses the same byte-level validator in the build tools
and browser supervisor (`src/process-abi.mjs`). A minimal executable needs
only its declared memory, the typed syscall import, and `_start`; optional
DSO/FFI support is not a prerequisite for running a program.
The optional DSO profile is `abi/dolly-process-dso-0.wat`; library symbols are
resolved only from typed process-local Wasm exports, never browser globals.
Binary name readers preserve literal UTF-8, including leading U+FEFF; validation,
dynamic-link metadata and symbol lookup must agree with the Wasm engine's names.

The supervisor executes the image's ENTRY without selecting programs or recovery
policy. Foreground roles live in Wasm process records. The internal
[`dolly-supervisor-0.wat`](../abi/dolly-supervisor-0.wat) exports let the supervisor
read those roles and acknowledge Worker retirement before a child becomes
waitable; they add no browser import or network authority.
Signal handlers execute in process Wasm at syscall boundaries. The supervisor
keeps its termination timer until userspace acknowledges completed delivery,
not merely receipt, and a rapid second Ctrl-C forces cancellation. Handler
cleanup adds no browser capability; the syscall packet ABI binds the handshake.
SIGWINCH reports an in-Wasm terminal layout change through that same signal
path. Unlike cancellation, it never starts a forced-termination timer.

## Recheck mechanically

```sh
node scripts/dolly-abi.mjs validate-browser build/dolly-browser-0.wasm dist/dolly.wasm
node --test test/http-broker.test.mjs test/dolly.test.mjs
DOLLY_BROWSER_MODE=boundary ./scripts/test-browser.sh
```

The browser check boots Ghostty, checks the actual import set, rejects
incompatible plugins, exercises policy denial and a non-consuming mailbox,
checks typed quota/deadline errors, floods invalid admissions from a worker,
and runs both denied and allowed `curl` requests from Slop.

This is a review map, not a formal security proof. The browser engine, trusted
page/worker code, policy, and Emscripten bootstrap/device glue still matter.
Argument decoding and shared-memory allocation still consume browser resources;
the HTTP limits are not a total CPU or memory budget for the sandbox.
Keep the authority decisions here small enough to read; do not hide a new
capability in an adapter just to make an upstream program compile.
