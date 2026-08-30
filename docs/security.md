# Security model

## Core containment thesis

Dolly assumes that the complete in-Wasm userspace may be compromised. An agent
may run arbitrary code, exploit a command, corrupt libc, inspect every WasmFS
file, and take control of the shared linear memory and function table. None of
those events should grant a capability that the browser did not explicitly
import into the main Dolly WebAssembly instance.

The security boundary is therefore:

```text
possibly compromised Dolly userspace | trusted browser capability providers
```

It is not a boundary between commands. Commands intentionally share memory,
libc, the allocator, WasmFS, descriptors, and loader state. Command ABI
validation is valuable for compatibility and maintenance, but containment must
still hold if an attacker bypasses it and compromises the complete userspace.

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
socket, DNS, TLS, `fork`, and `exec` calls are not browser imports; target-side
compatibility wrappers return `ENOSYS`.

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
| Voice prompt control | browser to Wasm | A direct local-user click or keyboard gesture starts browser speech recognition; only a bounded transcript is injected as terminal input, and Wasm cannot start capture |
| Shared RGBA framebuffer | Wasm to browser | Explicit, user-visible pixels; the browser validates bounds and only blits |
| Bootstrap text callback | Wasm to browser | Source-build progress before the resident renderer exists; ignored for normal terminal output after activation |
| HTTP dispatch and mailbox | both | Autonomous external communication and the principal confidentiality/integrity boundary |
| Clocks, timezone, entropy, startup environment | browser to Wasm | Inputs, not network egress |
| Preloaded immutable assets and system snapshot | browser to Wasm | Fixed startup input selected by the application, not by the agent |
| Dynamic Wasm loader | WasmFS to browser loader | Code instantiation; it must not turn an agent-controlled path into a network fetch |
| Exit, abort, memory growth, CPU use | Wasm to browser runtime | Availability effects, not data egress |

Display pixels and bootstrap progress can reveal data to the local user. They
are intentional, visible UI channels rather than autonomous remote
exfiltration. VT parsing and glyph rasterization are not privileged: corruption
there can draw arbitrary pixels or corrupt the disposable sandbox, but the
browser presenter does not interpret cells, escape sequences, links, image
URLs, autonomous clipboard requests, or DOM commands.

The worker creates the shared `WebAssembly.Memory`, and trusted page JavaScript
can inspect it. Dolly protects the browser host from agent code; it does not try
to hide Dolly state from the application embedding it.

GitHub Pages cannot configure the COOP and COEP response headers required for
shared WebAssembly memory. `coi-serviceworker.js` is therefore part of the
trusted Pages embedding: it adds COOP, COEP, and same-origin resource policy
only to same-origin static responses. It ignores cross-origin requests and has
no Wasm-selected routing or persistence API. Deployments that already serve
the headers never register it.

The public Pages embedding is not development mode. Before it imports the
browser runtime it installs an exact policy for OpenRouter's `/api/v1/models`
GET and `/api/v1/chat/completions` POST endpoints, with only the
`Authorization` credential-header name permitted. A completely compromised
Wasm userspace can spend the finite request quota and send readable sandbox
data to that provider, because model prompting inherently grants that
authority; it cannot select another origin or path. General-purpose network
tools are intentionally denied in that deployment.

The optional voice control is deliberately not a Wasm import or a request
mailbox. It can be entered only through the trusted page's phone-menu click or
`Ctrl+Shift+M` handler, which calls the browser speech-recognition API while the
user gesture is live. Dolly output cannot trigger that handler. The browser
normalizes and bounds the recognized text, then injects an ordinary
`/voice-prompt` terminal command; the Pi extension turns it into a user
message. Raw audio, microphone objects, and permission handles never enter
Wasm. A browser may implement speech recognition using a remote service, so an
embedding that requires strictly local speech processing should disable this
control or supply a trusted on-device recognizer. This remains a user-selected
host UI action, never agent-selected network authority; autonomous agent
networking still has exactly one edge, `env.dolly_http_dispatch`.

## Static system snapshot

The precompiled system image is a deployment artifact, not mutable browser
state. A headless browser runs `/rebuild` during `npm run build`; only that
build harness has an HTTP endpoint that can copy the captured bytes back to the
host `dist` directory. The production server has no corresponding write route.
Normal `/` boot performs fixed same-origin reads of
`dist/dolly-system-snapshot.mjs` and `dist/dolly-system.snapshot`, checks the
build ID, format, byte length, and SHA-256, and only then copies the opaque bytes
into the checked Wasm restore region.

Those fixed startup fetches are trusted application asset loading, not an
agent-selected communication capability and not a Wasm import. Compromised
Wasm cannot choose their URL, observe browser credentials through them, or use
them to send data. The snapshot has the same trust status as `dolly.wasm` and
`dolly.data`: compromising the build artifact or trusted page JavaScript is a
supply-chain/application compromise outside the in-Wasm threat model.

The captured manifest contains the built system directories and base
configuration but excludes mutable `/workspace`, `/tmp`, model credentials,
conversation state, and installed session extensions. After restore, all
mutable filesystem state still lives only in Wasm memory and dies with the
worker.

## Ephemeral compromise

WasmFS currently has only a memory backend. There is no host-directory mount,
browser persistence backend, or native subprocess facility. Terminating the
worker or closing the page destroys mutable Dolly state.

Consequently, corruption within Dolly is not itself a sandbox escape. The main
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
5. Native process and raw-socket operations fail without reaching a host
   fallback; `system`, `popen`, `fork`, `exec`, and `socket` are representative
   checks.
6. The browser owns and enforces HTTP policy even after total Wasm compromise.
7. New browser imports are reviewed as capabilities, not accepted merely to
   make a port compile.
8. Frame index, dimensions, stride, and byte ranges are checked before every
   blit; input records remain fixed-size and bounded.
9. The system snapshot remains a fixed, digest-verified build artifact; normal
   serving has no endpoint that can persist Wasm-selected bytes to the host.

Under those assumptions, arbitrary corruption inside Dolly changes ephemeral
sandbox state but cannot acquire new authority. The browser capability boundary,
especially its single HTTP egress edge, remains the security perimeter.
