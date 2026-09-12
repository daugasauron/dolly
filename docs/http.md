# HTTP and libcurl

## One outer capability

Reserved `*.dolly.invalid` addresses use separately admitted browser-local
[model](browser-local-models.md) and [build](image-build-service.md) services
through this same broker. They never reach Fetch. The policy below governs
ordinary remote HTTP destinations.

Programs do not import Fetch, sockets, DNS, or TLS. They call an in-Wasm C API,
which eventually reaches this one kernel-module import:

```wat
(import "env" "dolly_http_dispatch"
  (func (param i64 i64 i64 i64 i64 i64 i64 i64 i32 i32) (result i32)))
```

The arguments are pointer/byte-length pairs for method, URL, serialized headers
and body, followed by flags and request sequence. They are data supplied to one
browser broker. Admission returns zero or a negative target errno. Responses use
the version-5 pool defined by `abi/dolly-http-0.wat`: 16 independent 64 KiB slots
with effective URL, header lines,
body chunks, HTTP status, EOF, and an error code. Wasm blocks in its worker
while synchronous C clients wait for browser JavaScript to publish bounded
chunks. JavaScript runtimes instead poll their slots cooperatively, so
their Promise jobs and timers continue to advance between chunks.

The complete browser transport is in `src/http-broker.mjs`, and authorization
is in `src/http-policy.mjs`. The import passes only span descriptors and a
reference to the kernel's shared memory; it performs no unbounded string scan
or body copy. Before decoding/copying, the browser validates every span against
that memory and fixed byte caps: method 32, URL 8 KiB, headers 64 KiB, body 8 MiB.
Metadata is literal UTF-8 without NUL: leading U+FEFF is not discarded as a BOM.
Fetch's `Headers` validates names and normalizes value whitespace; the broker
does not apply Unicode trimming. Destination policy can impose smaller body
limits, but cannot relax these admission caps.

A private eight-byte browser acknowledgement, never mapped into Wasm, makes
admission synchronous. The worker cannot enqueue another descriptor until the
page has copied or rejected the current one. Transfers then run concurrently.
The browser owns a fixed 16-entry provider table; forged guest state cannot
increase that limit. `EBUSY` means a slot is occupied. Cancellation aborts only
the exact handle and acknowledges immediately; the host slot remains occupied
until its provider settles. Slow cancellation cannot block other admissions or
accumulate unbounded providers. All slots share the same policy and quota.
The host deadline includes each slot's backpressure,
not only the Fetch operation. If the guest stops consuming data, the provider
aborts the request and publishes terminal failure (atomic state 3), without
waiting for another acknowledgement or overwriting the current chunk. The
guest acknowledges chunks with compare-exchange so it cannot accidentally
erase this failure. See the [boundary review guide](browser-boundary.md).

The error word is a positive target errno published before terminal state 3:
`EACCES` policy denial, `EDQUOT` request quota, `E2BIG` byte limit, `ETIMEDOUT`
deadline, `ECANCELED` cancellation, or `EIO` transport failure. These constants
come from the pinned target's `<errno.h>`, not the host platform. C preserves
the negative errno; Janis errors retain `code`, `errno`, and the admitted request's
`requestId`. Libcurl maps to its standard error codes and supplies a specific
`CURLOPT_ERRORBUFFER` message. No error includes request credentials or claims
to distinguish browser-hidden CORS, redirect, DNS, or TLS failures.

The page-side provider optionally accepts a `globalThis.DOLLY_HTTP_POLICY`
object before `browser.mjs` loads. A hardened policy contains exact-origin
rules, an exact path or path prefix, allowed methods, byte/time limits, and the
names of credential headers that may reach that destination. The module
consumes and deletes that global during boot. It always uses
`credentials: "omit"` and a no-referrer policy. Explicit destination policies
reject redirects so a request body cannot reach an unvalidated destination.

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
the value. Explicit policies default to 256 authorization attempts, including
denied attempts; exact trusted bootstrap downloads are exempt. With no policy
object, including in the public Pages demo, it
preserves those headers and permits generic HTTP(S), including caller-requested
redirects, without a lifetime request-count limit. Request/response byte caps
and deadlines still apply. It is therefore
useful but not safe against exfiltration. Embeddings that need containment
should supply an explicit destination rule set and list only the
credential-header names each destination needs. This policy remains effective
after total compromise of the shared Dolly userspace because Wasm cannot
replace its imports.

## In-Wasm request API

`include/dolly/http.h` exposes synchronous and asynchronous request operations:

- `dolly_http_start` dispatches a copied request and returns its sequence;
- `dolly_http_poll` nonblockingly acknowledges at most one URL, header, body,
  EOF, or error record;
- `dolly_http_cancel` aborts only the matching request;
- `dolly_http_perform` is the process-local synchronous C/libcurl convenience
  layer that waits and drains those same primitives.

Received status and effective URL survive a failed or callback-cancelled
transfer. Callers always release the response with `dolly_http_response_dispose`.

A request contains:

- method and URL;
- RFC-style request-header lines;
- a fixed request body;
- redirect-intent and fail-on-status flags;
- body and response-header callbacks.

The browser receives none of the caller's filesystem paths, descriptors,
allocator state, or process state. Callback execution and all writes to files
remain inside Wasm.

Janis uses QuickJS's `httpStart`/`httpPoll` bridge.
Request bodies stay binary: strings are UTF-8 encoded once, and ArrayBuffers,
typed-array views (including Buffer), and DataViews are copied at `fetch()`
invocation with their exact byte offset and length. Queued requests therefore
cannot observe later caller mutations. The native bridge accepts only byte
arrays or null; there is no duplicate synchronous `Dolly.http()` adapter.

Process clients (Janis, Python, curl, Git) have a stricter upload limit than
the outer broker: method, URL, serialized headers, and body must fit in the
1 MiB process packet **including its 24-byte header**. Thus the maximum body
is `1048576 - 24 - methodBytes - urlBytes - headerBytes`. Metadata counts UTF-8
bytes without trailing NULs. Oversized packets fail `E2BIG` before network
dispatch (Janis `requestId: 0`). The broker's independent 8 MiB body cap also
covers direct kernel callers; neither cap overrides a smaller host policy.

Its `fetch()` returns a `Response` as soon as response headers arrive and
enqueues each body record into an in-Wasm `ReadableStream`. Janis calls the HTTP
pump alongside Promise jobs and timers, using at most a 10 ms terminal wait
while a request is active. This is cooperative re-entry in the existing worker,
not a socket API or ambient browser `fetch`. Requests overlap both within a
process and across processes. Janis queues calls only when the pool is full,
retrying `EBUSY` while continuing to poll active transfers. Aborting a queued
request removes it without dispatching or cancelling someone else's transfer.
The C start API still reports `-EBUSY`; callers must handle contention. Response
chunks are eagerly queued inside the runtime, bounded per transfer by the
browser's response-byte policy, not by consumer demand. This is not a claim of
complete Fetch/Streams compatibility or a bound on all responses retained by
an application.

The kernel tracks every process's handles. Exit, signal termination and forced
Worker cleanup cancel its requests, not its peers'. Whole-runtime teardown
aborts all providers. A handle encodes slot and generation; reused slots advance
the generation, never wrapping. Late responses and stale cancellation cannot
touch a successor. Each slot occupies 64 header bytes plus 64 KiB of Wasm memory;
the entire pool occupies 1,049,600 bytes.

`DOLLY_HTTP_FOLLOW_REDIRECTS` permits Fetch's native redirect handling only under
the unrestricted policy. Without caller intent, with an explicit destination
policy, or for exact trusted bootstrap inputs, redirects fail. An opened custom
image follows only when both parent and embedding policies permit it. This
requires no new Wasm import or flag. Browser `redirect: "manual"` hides redirect
headers, so it cannot implement per-hop allowlist checks. CORS still applies;
cross-origin redirects strip Authorization according to Fetch, not native curl.
Other explicit headers and 307/308 bodies can reach the next destination.

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
- the multi calls used by Git, admitting and polling independent transfers
  without waiting for one response to complete before starting another.

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
above. Redirect protocol and method
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


## Git transport

The Git module compiles pinned upstream sources into `/usr/lib/libgit.a`,
links `/usr/bin/git` with zlib, and separately links upstream
`git-remote-http`/`git-remote-https` with `-lgit -lcurl -lz`. The real-browser
test proves local operations, HTTP v0/v2 discovery and clone/fetch, checkout,
shallow/deepen, and HTTP push with remote ref/content verification. It checks
packs larger than the pipe buffer, remote rejection, damaged-pack/HTTP failures,
transfer cancellation and successful recovery.

The launcher uses existing mapped spawn and pipes. Sideband receive writes to
an immediately unlinked in-Wasm file before ordinary index-pack runs; it adds
no browser operation. Git's PATH probe ignores execute bits, and ordinary libc
exit runs its cleanup handlers. Push sends its pack before receiving sideband
status into an unlinked in-Wasm spool, then uses upstream status parsing.
Configured clean/smudge filters remain outside the validated port. Cancelling
an HTTP exchange does not undo a ref update already accepted by the remote.

The test's native Git is only a remote HTTP reference server. Every client
command runs in browser Wasm. Real remotes must permit Fetch/CORS and satisfy
the embedding's HTTP policy; there is no hidden proxy or socket fallback.
