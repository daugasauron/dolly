# HTTP and libcurl

## One outer capability

Programs do not import Fetch, sockets, DNS, or TLS. They call an in-Wasm C API,
which eventually reaches this one kernel-module import:

```wat
(import "env" "dolly_http_dispatch"
  (func (param i64 i64 i64 i64 i64 i32 i32)))
```

The arguments identify method, URL, serialized headers, request bytes and
length, flags, and request sequence. They are data supplied to one browser
broker, not seven capabilities. The response returns through the version-3
atomic mailbox defined by `abi/dolly-http-0.wat`: effective URL, header lines,
body chunks, HTTP status, EOF, and an error code. Wasm blocks in its worker
while synchronous C clients wait for browser JavaScript to publish bounded
chunks. JavaScript runtimes instead poll the same mailbox cooperatively, so
their Promise jobs and timers continue to advance between chunks.

The complete browser transport is in `src/http-broker.mjs`, and authorization
is in `src/http-policy.mjs`. The host deadline includes mailbox backpressure,
not only the Fetch operation. If the guest stops consuming data, the provider
aborts the request and publishes terminal failure (atomic state 3), without
waiting for another acknowledgement or overwriting the current chunk. The
guest acknowledges chunks with compare-exchange so it cannot accidentally
erase this failure. See the [boundary review guide](browser-boundary.md).

The page-side provider optionally accepts a `globalThis.DOLLY_HTTP_POLICY`
object before `browser.mjs` loads. A hardened policy contains exact-origin
rules, an exact path or path prefix, allowed methods, byte/time limits, and the
names of credential headers that may reach that destination. The module
consumes and deletes that global during boot. It always uses
`credentials: "omit"`, a no-referrer policy, and rejects redirects rather than
allowing a request body to reach an unvalidated redirect destination.

```js
globalThis.DOLLY_HTTP_POLICY = {
  maxRequests: 64,
  rules: [{
    origin: "https://openrouter.ai",
    path: "/api/v1/chat/completions",
    methods: ["POST"],
    credentialHeaders: ["authorization"],
    maxRequestBytes: 2 * 1024 * 1024,
    maxResponseBytes: 16 * 1024 * 1024,
    timeoutMilliseconds: 120_000,
  }],
};
```

Credential values are ordinary Dolly state. Pi may store them in its in-memory
home directory or environment and sends its own authorization header, just as
it does on a conventional machine. The broker never owns, injects, or rewrites
the value. With no policy object, including in the public Pages demo, it
preserves those headers and permits generic HTTP(S), while still enforcing
finite request, response, timeout, and request-count limits. It is therefore
useful but not safe against exfiltration. Embeddings that need containment
should supply an explicit destination rule set and list only the
credential-header names each destination needs. This policy remains effective
after total compromise of the shared Dolly userspace because Wasm cannot
replace its imports.

## In-Wasm request API

`include/dolly/http.h` exposes two views of the same one-request transport:

- `dolly_http_start` dispatches a copied request and returns its sequence;
- `dolly_http_poll` nonblockingly acknowledges at most one URL, header, body,
  EOF, or error record;
- `dolly_http_perform` is the synchronous C/libcurl convenience layer that
  waits and drains those same primitives.

A request contains:

- method and URL;
- RFC-style request-header lines;
- a fixed request body;
- redirect-intent and fail-on-status flags;
- body and response-header callbacks.

The browser receives none of the caller's filesystem paths, descriptors,
allocator state, or process state. Callback execution and all writes to files
remain inside Wasm.

QuickJS exposes only `httpStart`/`httpPoll` to the Dolly JavaScript prelude.
Its `fetch()` returns a `Response` as soon as response headers arrive and
enqueues each body record into an in-Wasm `ReadableStream`. Janis calls the HTTP
pump alongside Promise jobs and timers, using at most a 10 ms terminal wait
while a request is active. This is cooperative re-entry in the existing worker,
not a second process, a socket API, or ambient browser `fetch`. Version 0 still
allows only one in-flight broker request. Janis queues overlapping `fetch()`
calls in Wasm and retries `EBUSY` on later event-loop turns; aborting a queued
request removes it without dispatching or cancelling someone else's transfer.
The C start API still reports `-EBUSY`; callers must handle contention.

HTTP ownership ends at the nested command boundary. If an asynchronous runtime
returns with a request pending or with an unread final mailbox record, Dolly
advances the request sequence, clears the mailbox, and cancels that request in
the page-side provider through the existing `dolly_http_dispatch` import. A
finished or interrupted command therefore cannot leave the next command with a
permanent busy mailbox or let it consume stale response bytes.

Version 0 records follow-redirect intent for curl source compatibility but the
browser provider rejects redirects unconditionally. A future implementation
may follow manually only if every hop is separately authorized by policy; the
native Fetch redirect algorithm must never bypass destination validation.

## Fetch-backed libcurl

The build pins curl 8.21.0 and installs its official public headers under
`/usr/include/curl`. Dolly compiles `src/libcurl-fetch.c` inside the runtime and
archives it as `/usr/lib/libcurl.a`. Consumers therefore include normal curl
headers and link with `-lcurl`; they do not use a Git-specific HTTP API.

The implemented compatibility surface currently includes:

- global initialization and version queries;
- easy handles, duplication, options, perform, information queries, escaping,
  error strings, and cleanup;
- header lists;
- GET, HEAD, POST, PUT, and custom HTTP methods;
- fixed request bodies and read callbacks with exact declared lengths;
- write, header, read, error-buffer, and debug callback plumbing;
- status, effective URL, content type, retry-after, range, protocol restrictions,
  and basic authorization;
- the multi calls used by Git, implemented synchronously over the one-request
  version-0 broker.

This is deliberately not a claim that browser Fetch can reproduce every
libcurl behavior. The official headers make the interface source-compatible,
while the implementation provides the subset established by real ports. Fetch
owns DNS, connection pooling, HTTP versions, TLS, decompression, forbidden
headers, and redirect mechanics. The broker removes browser-owned transport
headers such as `User-Agent` and `Accept-Encoding` before calling Fetch; this
also avoids engine-specific CORS preflights while leaving application headers,
including `Authorization`, intact. `USERAGENT` and `ACCEPT_ENCODING` supply
request metadata, not authority over those browser-owned wire headers.

`CURLOPT_PROTOCOLS_STR` accepts case-insensitive HTTP/HTTPS lists, `ALL`, or NULL
to restore both. Unsupported or empty lists fail without replacing the current
restriction. The adapter rejects a forbidden scheme before dispatch; a relative
URL requires both schemes because only the browser knows its base URL. Duplicated
handles retain the restriction. `HTTPAUTH` supports NONE and BASIC; NONE disables
automatic credentials. Negotiated authentication (including ANY), OAuth token
options, cookies, proxies, certificate/key/pinning configuration, protocol/version
selection, low-speed/connection/transfer timeouts, socket controls, upload seeking,
and per-transfer redirect limits return `CURLE_NOT_BUILT_IN` at setopt. Unknown
options return `CURLE_UNKNOWN_OPTION`. Callers must check these results.

TLS verification is mandatory: enabling peer/hostname verification succeeds,
disabling it fails. `FOLLOWLOCATION` accepts only boolean intent, as described
above; the browser still rejects every redirect. Redirect protocol and method
controls are unsupported, not silently remembered for a future implementation.
Zero-sized uploads do not consume input; short uploads and read-callback aborts
fail before dispatch. A custom write callback receives its exact context, even NULL.
Rejecting body or header data cancels the HTTP operation immediately rather than
draining the rest of the response before reporting failure.
Transfer deadlines remain available through browser policy or the process
`timeout` command. None of these options can relax browser-owned policy. There
is no raw-socket API, FTP, SSH transport, custom TLS backend or asynchronous fd set.

The important property is architectural: `libcurl.a` is an adapter above the
same typed broker. It does not widen the browser import closure.

## HTTP audit checkpoint (2026-09-06)

Keep the architecture: one browser-authorized exchange, byte-oriented request
and response data, and ordinary runtime adapters above it. One import describes
authority, not a requirement for one simultaneous request. A serial transport
is sufficient if its callers queue honestly and cancellation stays responsive.
The trusted policy and transport total 436 lines; libcurl's larger compatibility
surface is inside Wasm, not an additional browser authority.

Remaining findings, in priority order:

1. **Bounds must precede host allocation.** `dolly_http_dispatch` currently
   scans NUL-terminated method/URL/headers and copies the body before browser
   policy runs. Normal processes have a 1 MiB packet ceiling, but that is not
   a defense against total kernel compromise. Use bounded spans at the outer
   import, checked before decoding/copying. Bound pending host messages too.
   This is an availability gap, not a demonstrated destination-policy escape.
2. **Errors lose their meaning.** The broker catches policy denial, quota,
   timeout and Fetch failure and publishes the same state 3. C turns it into
   generic I/O failure; libcurl mostly reports "could not connect". Preserve
   a small typed terminal reason plus request ID through every layer. Do not
   log credentials or pretend the browser distinguishes CORS from DNS/TLS.
3. **Byte semantics and limits disagree.** Janis decodes `Uint8Array` uploads
   into text before dispatch; arbitrary binary uploads are not preserved.
   The process packet ceiling is 1 MiB including metadata, versus the default
   broker body limit of 8 MiB. `maxRequestBytes` counts only the body, not URL
   or headers; a direct policy probe accepted 16 KiB of URL/header data under
   a one-byte setting. Define separate metadata/body caps and expose truthful
   effective upload limits. Keep binary data binary through QuickJS.
4. **Some supported-looking behavior is not implemented.** Redirect intent is
   accepted but every redirect fails; the Fetch facade also buffers incoming
   chunks regardless of consumer demand. Keep redirect denial explicit and
   document eager bounded buffering; do not introduce sockets or silently
   enable Fetch's redirect following. The C header's promise of exclusively
   negative errors also disagrees with positive fail-on-status results.
5. **The lifetime budget is easy to mistake for a broken connection.** The
   default 256 agent requests includes failed/denied attempts; trusted exact
   bootstrap downloads are exempt. Report exhaustion clearly, and distinguish
   this Fetch-call budget from a bound on browser-managed preflight traffic
   or total session CPU/memory.

Evidence: the browser regression reproduced overlapping-request failure;
broker tests cover policy-before-Fetch, explicit credentials, redirect denial,
byte limits, non-consuming deadlines and cancellation fencing. A disposable
Chrome sandbox on local port 9000 also fetched OpenRouter's catalog through
both curl and Janis, and upstream Pi received a verified reply from
`deepseek/deepseek-v4-pro`. That does not establish Firefox/Safari parity or
explain every reported login failure. The broader findings above are source
review unless a reproducer is explicitly stated; this is not a formal proof.

## Git result and remaining gap

The boot build compiles upstream Git 2.55.0 sources into `/usr/lib/libgit.a`,
links `/usr/bin/git` with zlib, and separately links upstream
`git-remote-http`/`git-remote-https` with `-lgit -lcurl -lz`. The real-browser
test proves local repository operations and checks that `git-remote-http` sends
a protocol-v2 discovery GET, including `Git-Protocol: version=2`, through the
Fetch provider.

Full `git clone https://...` remains unproven at the helper-launch layer, not
at HTTP linking. Git normally exchanges protocol data with a remote helper over
bidirectional pipes. Dolly now has immediate spawn, real pipes, nonblocking wait
and signals; Git's fork-oriented launcher still needs to use those operations.
The next gate is a real clone/fetch over the existing broker, with no host
subprocess or socket fallback.

A browser probe also verifies the packaging distinction: `git --exec-path`
is `/usr/libexec/dolly` and `git-remote-http` exists there. Dolly has no Unix
permission model, so the Git target patch treats any regular file as eligible
during its pre-spawn PATH lookup; execute bits are not introduced as policy.
With that false gate removed, the remaining work belongs to the helper-launch
adapter rather than filesystem permissions or a new browser capability.
