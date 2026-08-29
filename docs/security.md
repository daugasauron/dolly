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
XSS, compromised application JavaScript, and bugs in a browser-facing terminal
renderer are outside this model.

## Capability closure

Core WebAssembly has no ambient filesystem, process, DOM, or network access.
The maximum authority of a compromised Dolly instance is the transitive
authority of the imports supplied when `dist/dolly.wasm` is instantiated.

The build records the complete generated import allowlist in
`config/browser-imports.json` and rejects name drift. Most current imports are
Emscripten loader, clock, entropy, bootstrap, memory-growth, and output-device
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
| Terminal input mailbox | browser to Wasm | Explicit user input |
| Terminal output callbacks | Wasm to browser | Explicit, user-visible output; the terminal renderer is trusted |
| HTTP dispatch and mailbox | both | Autonomous external communication and the principal confidentiality/integrity boundary |
| Clocks, timezone, entropy, startup environment | browser to Wasm | Inputs, not network egress |
| Preloaded immutable assets | browser to Wasm | Startup input selected by the application, not by the agent |
| Dynamic Wasm loader | WasmFS to browser loader | Code instantiation; it must not turn an agent-controlled path into a network fetch |
| Exit, abort, memory growth, CPU use | Wasm to browser runtime | Availability effects, not data egress |

Terminal output can reveal data to the local user and can attack a buggy
terminal parser. Under the trusted-renderer assumption it is an intentional,
visible UI channel rather than autonomous remote exfiltration.

The worker creates the shared `WebAssembly.Memory`, and trusted page JavaScript
can inspect it. Dolly protects the browser host from agent code; it does not try
to hide Dolly state from the application embedding it.

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

The current demo broker is not yet that hardened policy. It accepts HTTP(S),
uses `credentials: "omit"`, selects follow/manual redirect behavior from the
request, and has no origin allowlist, quota, timeout, or redirect-destination
validation. It demonstrates the single typed network edge and streaming
mailbox, not a production security policy.

## Required invariants

The containment claim depends on continuously testing and auditing these
properties:

1. `env.dolly_http_dispatch` remains the sole agent-selected network import.
2. No socket, host-filesystem, native-process, DOM, or JavaScript-evaluation
   provider enters the runtime import closure.
3. Loader and preload helpers cannot resolve an agent-controlled path through
   the network or host filesystem.
4. JavaScript-backed WasmFS hooks remain limited to explicit output devices;
   the root remains the in-Wasm memory backend.
5. Native process and raw-socket operations fail without reaching a host
   fallback; `system`, `popen`, `fork`, `exec`, and `socket` are representative
   checks.
6. The browser owns and enforces HTTP policy even after total Wasm compromise.
7. New browser imports are reviewed as capabilities, not accepted merely to
   make a port compile.

Under those assumptions, arbitrary corruption inside Dolly changes ephemeral
sandbox state but cannot acquire new authority. The browser capability boundary,
especially its single HTTP egress edge, remains the security perimeter.
