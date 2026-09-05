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
broker, not seven capabilities. The response returns through the version-2
atomic mailbox defined by `abi/dolly-http-0.wat`: effective URL, header lines,
body chunks, HTTP status, EOF, and an error code. Wasm blocks in its worker
while synchronous C clients wait for browser JavaScript to publish bounded
chunks. JavaScript runtimes instead poll the same mailbox cooperatively, so
their Promise jobs and timers continue to advance between chunks.

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
allows only one in-flight broker request.

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
- fixed request bodies and read callbacks;
- write, header, read, error-buffer, and debug callback plumbing;
- status, effective URL, content type, retry-after, range, user-agent,
  accept-encoding, and basic authorization;
- the multi calls used by Git, implemented synchronously over the one-request
  version-0 broker.

This is deliberately not a claim that browser Fetch can reproduce every
libcurl behavior. The official headers make the interface source-compatible,
while the implementation provides the subset established by real ports. Fetch
owns DNS, connection pooling, HTTP versions, TLS, decompression, forbidden
headers, and redirect mechanics. The broker removes browser-owned transport
headers such as `User-Agent` and `Accept-Encoding` before calling Fetch; this
also avoids engine-specific CORS preflights while leaving application headers,
including `Authorization`, intact. Git options for those browser-owned choices
are accepted where required for source compatibility but cannot override the
browser. Certificate public-key pinning returns `CURLE_NOT_BUILT_IN`; unknown
options return `CURLE_UNKNOWN_OPTION`; non-HTTP(S) URLs return
`CURLE_UNSUPPORTED_PROTOCOL`. There is no raw-socket API, FTP, SSH transport,
custom TLS backend, proxy socket, socket callback, or asynchronous fd set.

The important property is architectural: `libcurl.a` is an adapter above the
same typed broker. It does not widen the browser import closure.

## Git result and remaining gap

The boot build compiles upstream Git 2.55.0 sources into `/usr/lib/libgit.a`,
links `/usr/bin/git` with zlib, and separately links upstream
`git-remote-http`/`git-remote-https` with `-lgit -lcurl -lz`. The real-browser
test proves local repository operations and checks that `git-remote-http` sends
a protocol-v2 discovery GET, including `Git-Protocol: version=2`, through the
Fetch provider.

Full `git clone https://...` is blocked at the next layer, not at HTTP linking.
The main Git command normally starts a remote helper and exchanges protocol
data with it concurrently over pipes. Dolly version 0 invokes modules
synchronously and intentionally maps native `fork`/`exec` to `ENOSYS`. The next
experiment is the smallest in-Wasm helper-protocol adapter or serial/spooled
integration that preserves clone semantics. A general scheduler is warranted
only if that concrete path cannot work; adding a host subprocess escape would
violate the sandbox contract.

A browser probe also verifies the packaging distinction: `git --exec-path`
is `/usr/libexec/dolly` and `git-remote-http` exists there. Dolly has no Unix
permission model, so the Git target patch treats any regular file as eligible
during its pre-spawn PATH lookup; execute bits are not introduced as policy.
With that false gate removed, normal clone reaches the real remaining issue:
upstream `start_command()` asks for a concurrently connected helper, while
Dolly version 0 has only synchronous in-Wasm spawn/wait.
