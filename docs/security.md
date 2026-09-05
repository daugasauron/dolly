# Security model

## Core containment thesis

Dolly assumes that the complete in-Wasm userspace may be compromised. An agent
may run arbitrary code, exploit a command, inspect every shared filesystem
file, or even find a way to corrupt kernel Wasm state. None of those events
should grant a capability that the browser did not explicitly import into the
main Dolly WebAssembly instance.

The security boundary is therefore:

```text
possibly compromised Dolly userspace | trusted browser capability providers
```

Private process memories are valuable lifecycle and reliability boundaries,
but they are not the host-containment claim. ABI validation is valuable for
compatibility and defense in depth; containment must still hold if an attacker
bypasses it and compromises the complete userspace.

WebAssembly, the browser engine, the page and worker JavaScript, and the
implementations of every imported function are trusted. Browser-engine bugs,
XSS, and compromised application JavaScript are outside this model. Ghostty,
the font rasterizer, and terminal state now run inside the assumed-compromised
userspace; trusted presentation code is only the bounded RGBA blitter and
browser event capture.

## Capability closure

Core WebAssembly has no ambient filesystem, process, DOM, or network access.
The maximum authority of a compromised Dolly instance is the transitive
authority of the imports supplied when `dist/dolly.wasm` is instantiated.

The build records the complete generated import allowlist in
`config/browser-imports.json` and rejects name drift. Most current imports are
Emscripten loader, clock, entropy, bootstrap, memory-growth, and progress-output
mechanics. Their trusted implementations must remain incapable of opening a
host filesystem, starting a native process, evaluating agent-controlled
JavaScript, or performing an agent-selected network request.

There is one intentional autonomous network edge:

```wat
(import "env" "dolly_http_dispatch"
  (func (param i64 i64 i64 i64 i64 i32 i32)))
;; method, URL, header block, body, body length, flags, request sequence
```

Commands normally reach it through `dolly_http_perform` or the Fetch-backed
`libcurl.a`. The browser receives only explicit request data, then exchanges
status, effective URL, response headers, and bounded body chunks through the
versioned shared-memory mailbox in `abi/dolly-http-0.wat`. The browser never
receives the command's WasmFS output path or descriptor.

The seven arguments do not represent seven capabilities. They are the schema
of one broker call. Adding libcurl, curl, or Git inside Wasm does not widen this
outer boundary: those layers only prepare data for the same import. Native
socket, DNS, TLS, and `fork` calls are not browser imports. Raw sockets fail
inside the process runtime. Spawn, wait, pipes, `system`, `popen`, and the
supported exec-shaped behavior stay inside the Wasm kernel.

If the entire userspace is compromised, the attacker may reach this outer edge
by any internal route. That does not weaken the model: policy belongs at the
browser implementation of `dolly_http_dispatch`, where compromised Wasm cannot
bypass it.

## Communication channels

HTTP is the only intentional agent-controlled network channel, but it is not
literally the only information crossing the Wasm boundary:

| Channel | Direction | Security meaning |
| --- | --- | --- |
| Display input mailbox | browser to Wasm | Explicit raw key/text/resize/pointer input; interpretation occurs in Wasm |
| Clipboard paste buffer | browser to Wasm | Bounded text from an explicit local-user paste gesture; Ghostty applies terminal paste rules |
| Clipboard copy buffer | Wasm to browser | Bounded plain text for Ghostty's active selection; only an explicit local-user copy gesture writes the system clipboard |
| Shared RGBA framebuffer | Wasm to browser | Explicit, user-visible pixels; the browser validates bounds and only blits |
| Bootstrap text callback | Wasm to browser | Source-build progress before the resident renderer exists; ignored for normal terminal output after activation |
| HTTP dispatch and mailbox | both | Autonomous external communication and the principal confidentiality/integrity boundary |
| Explicit file download | Wasm to local user | Bounded, user-visible export of one regular WasmFS file; no host path or filesystem handle enters Wasm |
| Named session mailbox | Wasm to/from browser storage | Explicit opaque filesystem snapshot; browser stores bytes but receives no path-level operation or mount |
| Build-module cache | WasmFS to/from trusted worker storage | Exact expected content-addressed output layers during rebuild only; no guest-selected storage operation or browser object enters Wasm |
| Clocks, timezone, entropy, startup environment | browser to Wasm | Inputs, not network egress |
| Seed, exact recipe/source responses, and system snapshot | browser to Wasm | Fixed application inputs or policy-authorized broker responses, not ambient guest authority |
| Dynamic Wasm loader | WasmFS to browser loader | Code instantiation; it must not turn an agent-controlled path into a network fetch |
| Exit, abort, memory growth, CPU use | Wasm to browser runtime | Availability effects, not data egress |

Display pixels and bootstrap progress can reveal data to the local user. They
are intentional, visible UI channels rather than autonomous remote
exfiltration. VT parsing and glyph rasterization are not privileged: corruption
there can draw arbitrary pixels or corrupt the disposable sandbox, but the
browser presenter does not interpret cells, escape sequences, links, image
URLs, autonomous clipboard requests, or DOM commands.

File download is similarly explicit rather than ambient filesystem access.
`dolly_download_file` reads one regular file from WasmFS, derives only its base
name, applies a 64 MiB limit, and calls `env.dolly_download_dispatch` with a
copied byte range. The worker and page independently check the name, size, and
buffer type before the page starts an ordinary browser download. The guest
cannot choose a host path, enumerate host storage, obtain a file handle, or
read a result back. A compromised userspace can request downloads, so an
embedding that needs approval, quotas, or disabled export must enforce that in
this browser provider. This is a local-user output capability, not a network
capability and not a substitute for HTTP policy. The exact contract is in
[`download.md`](download.md).

The worker creates the shared `WebAssembly.Memory`, and trusted page JavaScript
can inspect it. Dolly protects the browser host from agent code; it does not try
to hide Dolly state from the application embedding it.

Worker termination is the availability backstop. Ctrl+C becomes a PID-targeted
kernel `SIGINT`; blocked calls wake with `EINTR` and cooperative runtimes can
poll it. A command can still omit every safepoint, so after a 500 ms grace
period the trusted supervisor terminates only the affected private process
Worker and records status 130. Kernel-owned filesystem state and the shell
survive. This adds no Wasm import and grants the guest no authority.

GitHub Pages cannot configure the COOP and COEP response headers required for
shared WebAssembly memory. `coi-serviceworker.js` is therefore part of the
trusted Pages embedding: it adds COOP, COEP, and same-origin resource policy
only to same-origin static responses. It ignores cross-origin requests and has
no Wasm-selected routing or persistence API. Deployments that already serve
the headers never register it.

The public Pages environment pages intentionally run the no-configuration broker
mode. A completely compromised Wasm userspace can send readable sandbox data
and sandbox-supplied credential headers to any HTTP(S) destination that accepts
the browser's CORS request. Browser ambient credentials and referrers remain
omitted, redirects remain rejected, and finite size, time, and request-count
limits still apply. This is useful for general-purpose agent tools but is not
an exfiltration-safe deployment policy. A stricter embedding can set
`DOLLY_HTTP_POLICY` before loading `browser.mjs` without changing the Wasm
runtime or adding another network edge.

## Static system snapshot

The precompiled system image is a deployment artifact, not mutable browser
state. A headless browser runs each image's `/rebuild/` route during `npm run build`; only that
build harness has an HTTP endpoint that can copy the captured bytes back to the
host `dist` directory. The production server has no corresponding write route.
Normal `/default/` or `/gamedev/` boot performs fixed same-origin reads of the
selected image's metadata and snapshot under `dist/`, checks the
build ID, format, byte length, SHA-256, exact raw recipe-chain identity, entry
record, and retained-path manifest, and only then copies the opaque bytes into
the checked Wasm restore region. It does not fetch Dollyfile `SOURCE` inputs. A
rebuild route gives the broker an exact credential-free GET rule for every
repository `HOST` input. `/bin/dollyfile` requests each one sequentially,
verifies its declared SHA-256, publishes it to WasmFS, and only then parses the
next row.

Those fixed startup fetches are trusted application asset loading, not an
agent-selected communication capability and not a Wasm import. Compromised
Wasm cannot choose their URL, observe browser credentials through them, or use
them to send data. The snapshot has the same trust status as `dolly.wasm` and
`dolly.data`: compromising the build artifact or trusted page JavaScript is a
supply-chain/application compromise outside the in-Wasm threat model.

The captured manifest is an exact sorted file list derived from image-visible
module exports, exact `FILE` roots, and bounded `FOLDER` expansion at the point
each root becomes visible. It includes runtime data
needed by Pi, Zig, Git, and the display, but excludes mutable `/workspace`,
`/tmp`, model credentials, conversation state, and installed session
extensions. After restore, all mutable filesystem state still lives only in
Wasm memory and dies with the worker.

Rebuild mode may persist module output layers in a separate same-origin
IndexedDB database. The trusted worker derives the allowed keys from the
packaged recipe graph, hashes every loaded layer, and exposes only opaque bytes
for those exact keys to the Dollyfile builder. A compromised userspace cannot
enumerate the database, inspect cookies or local storage, run JavaScript, or
select an arbitrary cache key. It can corrupt a layer it is currently
producing, which can at most poison that same build identity and is within the
assumed userspace compromise. Runtime build IDs invalidate old layers.

## Ephemeral and saved compromise

WasmFS has only a memory backend. There is no host-directory mount or native
subprocess facility. Closing the page destroys unsaved state. An explicit
`Ctrl+Shift+S` can serialize the in-Wasm tree into an opaque, bounded stream
that trusted page code compresses into same-origin IndexedDB. Browser storage
is not mounted and the guest cannot name IndexedDB operations; details are in
[`sessions.md`](sessions.md).

Consequently, corruption or persistence within Dolly is not itself a sandbox
escape. A saved compromise can survive a reload inside that named session, so
users must delete or abandon it when trust is lost. The main
confidentiality risk is exporting data before termination through an allowed
channel. The main integrity risk is using an allowed network request to trigger
an external side effect. The main availability risks are CPU loops, memory
growth, output flooding, and excessive requests. Worker termination and
resource quotas are therefore useful even though they are not confidentiality
boundaries.

## HTTP policy is the security policy

A network-capable agent can encode any readable WasmFS data into a URL. A GET
can also have side effects, target local services, or carry ambient browser
credentials. Merely wrapping `fetch` does not make it safe; the browser-side
broker must define the authority granted to the agent.

A hardened embedding should decide and enforce at least:

- an exact origin or domain allowlist;
- allowed schemes and ports;
- `credentials: "omit"` and a no-referrer policy unless explicitly required;
- redirect rejection or validation of every redirect destination;
- local/private-network policy;
- request and response size limits, concurrency limits, and timeouts;
- cancellation, audit logging, and optional user approval.

Different embeddings may supply different policies without changing the Wasm
runtime. For example, one could allow only a model provider and a read-only
source mirror, while another could disable HTTP completely. With no provider
for `dolly_http_dispatch`, a network-capable Dolly artifact must not instantiate.

`src/http-policy.mjs` supplies the hardened provider mode. Before
`browser.mjs` loads, the trusted embedding may set `DOLLY_HTTP_POLICY` to exact
origin/path/method rules with finite request, response, timeout, and total
request limits. The policy is consumed and deleted during boot. Credentials
remain in Wasm; a matched rule explicitly names the common credential headers
it permits for that destination, and all others are removed. The browser never
injects secret values. Fetch omits ambient browser credentials and referrers,
and redirects are rejected so no intermediate request can reach an
unvalidated destination.

The no-configuration demo mode still accepts arbitrary HTTP(S) destinations,
including sandbox-supplied credential headers, so it is not an
exfiltration-safe deployment policy. It retains finite limits. A production
embedding must provide an explicit allowlist.

## Required invariants

The containment claim depends on continuously testing and auditing these
properties:

1. `env.dolly_http_dispatch` remains the sole agent-selected network import.
2. No socket, host-filesystem, native-process, DOM, or JavaScript-evaluation
   provider enters the runtime import closure.
3. Loader and preload helpers cannot resolve an agent-controlled path through
   the network or host filesystem.
4. The root remains the in-Wasm memory backend. The bootstrap text sink cannot
   perform network, filesystem, DOM-selection, or code-evaluation actions, and
   normal terminal output switches to the in-Wasm renderer after activation.
5. Process-shaped operations terminate in the in-Wasm kernel, and raw sockets
   fail without a host fallback; `system`, `popen`, `spawn`, `wait`, `fork`, and
   `socket` are representative checks.
6. The browser owns and enforces HTTP policy even after total Wasm compromise.
7. The download provider accepts only a bounded copied buffer and sanitized
   base name; it never accepts a host path or filesystem handle. Its local
   export policy remains enforceable after total Wasm compromise.
8. New browser imports are reviewed as capabilities, not accepted merely to
   make a port compile.
9. Frame index, dimensions, stride, and byte ranges are checked before every
   blit; input records remain fixed-size and bounded.
10. The system snapshot remains a fixed, digest-verified build artifact; normal
   serving has no endpoint that can persist Wasm-selected bytes to the host.

Under those assumptions, arbitrary corruption inside Dolly changes ephemeral
sandbox state but cannot acquire new authority. The browser capability boundary,
especially its single HTTP network-egress edge and explicit local-output
providers, remains the security perimeter.
