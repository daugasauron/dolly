# HTTP and libcurl

## One outer capability

Programs do not import Fetch, sockets, DNS, or TLS. They call an in-Wasm C API,
which eventually reaches this one kernel-module import:

```wat
(import "env" "dolly_http_dispatch"
  (func (param i64 i64 i64 i64 i64 i64 i64 i64 i32 i32) (result i32)))
```

The arguments are pointer/byte-length pairs for method, URL, serialized headers
and body, followed by flags and request sequence. They are data supplied to one
browser broker. Admission returns zero or a negative target errno. The response returns through the version-4
atomic mailbox defined by `abi/dolly-http-0.wat`: effective URL, header lines,
body chunks, HTTP status, EOF, and an error code. Wasm blocks in its worker
while synchronous C clients wait for browser JavaScript to publish bounded
chunks. JavaScript runtimes instead poll the same mailbox cooperatively, so
their Promise jobs and timers continue to advance between chunks.

The complete browser transport is in `src/http-broker.mjs`, and authorization
is in `src/http-policy.mjs`. The import passes only span descriptors and a
reference to the kernel's shared memory; it performs no unbounded string scan
or body copy. Before decoding/copying, the browser validates every span against
that memory and fixed byte caps: method 32, URL 8 KiB, headers 64 KiB, body 8 MiB.
Metadata must be UTF-8 without NUL. Destination policy can impose smaller body
limits, but cannot relax these admission caps.

A private eight-byte browser acknowledgement, never mapped into Wasm, makes
admission synchronous. The worker cannot enqueue another descriptor until the
page has copied or rejected the current one. There is no unbounded host Promise
queue; overlapping requests fail `EBUSY`, and cancellation waits for the old
provider to settle before acknowledging. Fetch and response streaming remain
asynchronous. The host deadline includes mailbox backpressure,
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
not a second process, a socket API, or ambient browser `fetch`. Version 0 still
allows only one in-flight broker request. Janis queues overlapping `fetch()`
calls in Wasm and retries `EBUSY` on later event-loop turns; aborting a queued
request removes it without dispatching or cancelling someone else's transfer.
The C start API still reports `-EBUSY`; callers must handle contention. Response
chunks are eagerly queued inside the runtime, bounded per transfer by the
browser's response-byte policy, not by consumer demand. This is not a claim of
complete Fetch/Streams compatibility or a bound on all responses retained by
an application.

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
The trusted policy and transport remain together in two reviewable modules;
libcurl's larger compatibility surface is inside Wasm, not additional browser authority.

The byte-path follow-up removes the unused synchronous JS collector and keeps
uploads binary through QuickJS. Process and browser limits are distinct and
documented above. Remaining compatibility limits are intentional redirect denial
and eager response buffering: do not silently enable native Fetch redirects or
claim demand-driven backpressure.

The default budget remains 256 attempts reaching agent-request authorization,
including denied attempts; trusted exact bootstrap downloads are exempt.
Exhaustion now reports `EDQUOT`. This is not a bound on browser-managed preflight
traffic, total session CPU/memory, or native Fetch's internal allocations.

Evidence: the browser regression reproduced overlapping-request failure;
broker tests cover policy-before-Fetch, explicit credentials, redirect denial,
byte limits, non-consuming deadlines and cancellation fencing. Version-4 span
admission, a stalled-admission flood, and typed failures pass in Chrome and
Firefox 153; C/libcurl and Janis retain denial diagnostics in browser tests.
A disposable
Chrome sandbox on local port 9000 fetched OpenRouter's catalog through curl
and Janis, and upstream Pi received a verified `deepseek/deepseek-v4-pro` reply.
Firefox 153 reproduced a separate provider bug: calling unbound native Fetch
as a broker method throws before networking. Binding it to the browser global
fixes the real Pi `/login` and chat flow; the regression tests now exercise the
default provider instead of hiding it behind an injected arrow function.
Pi's optional `pi.dev` catalog refresh still fails browser CORS independently
of OpenRouter; see [Pi networking](pi-agent-plan.md#network-and-credentials).
Safari remains unverified. The broader findings above are source review unless
a reproducer is explicitly stated; this is not a formal proof.

## Git transport

The boot build compiles upstream Git 2.55.0 sources into `/usr/lib/libgit.a`,
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
