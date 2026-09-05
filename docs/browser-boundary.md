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
   implementation copies method, URL, headers, and body into request data.
2. [`src/runtime-worker.mjs`](../src/runtime-worker.mjs), `httpDispatch`:
   forwards that data to the page. No caller-selected JavaScript runs.
3. [`src/http-broker.mjs`](../src/http-broker.mjs), `NetworkTransport.request`:
   parses the URL and headers, calls `policy.authorize`, then calls Fetch.
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
"One network edge" does not mean "no other information crosses the boundary."
For saves, Wasm owns base fingerprints and filesystem delta encoding; the page
copies bounded opaque chunks to local IndexedDB. `/session/` lists metadata and
`/session/NAME` boots the verified base before Wasm applies the delta. No new Wasm
import or path-level host filesystem API is involved; see [sessions](sessions.md).

Boot reads fixed application assets. `runtime-worker.mjs` accepts only the
fixed `dolly.wasm` and `dolly.data` artifact names for the generated runtime.
Other startup snapshots and recipe assets have their own fixed identities;
these reads are not guest-selected URLs.

The development server is also an HTTP destination. `scripts/serve.mjs` and
the browser harness serve application assets, not the host checkout. Their
documentation check confines the resolved path to `docs/`; a URL-prefix check
alone is insufficient. Tests request encoded parent paths and require 404.

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

## Recheck mechanically

```sh
node scripts/dolly-abi.mjs validate-browser build/dolly-browser-0.wasm dist/dolly.wasm
node --test test/http-broker.test.mjs test/dolly.test.mjs
DOLLY_BROWSER_MODE=boundary ./scripts/test-browser.sh
```

The browser check boots Ghostty, checks the actual import set, rejects
incompatible plugins, exercises policy denial and a non-consuming mailbox,
and runs both denied and allowed `curl` requests from Slop.

This is a review map, not a formal security proof. The browser engine, trusted
page/worker code, policy, and Emscripten bootstrap/device glue still matter.
Argument decoding and shared-memory allocation still consume browser resources;
the HTTP limits are not a total CPU or memory budget for the sandbox.
Keep the authority decisions here small enough to read; do not hide a new
capability in an adapter just to make an upstream program compile.
