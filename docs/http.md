# HTTP and libcurl

## One outer capability

Programs do not import Fetch, sockets, DNS, or TLS. They call an in-Wasm C API,
which eventually reaches this one main-module import:

```wat
(import "env" "dolly_http_dispatch"
  (func (param i64 i64 i64 i64 i64 i32 i32)))
```

The arguments identify method, URL, serialized headers, request bytes and
length, flags, and request sequence. They are data supplied to one browser
broker, not seven capabilities. The response returns through the version-2
atomic mailbox defined by `abi/dolly-http-0.wat`: effective URL, header lines,
body chunks, HTTP status, EOF, and an error code. Wasm blocks in its worker
while browser JavaScript publishes bounded chunks.

The current demo provider accepts only HTTP(S), sets `credentials: "omit"`,
and makes redirect behavior explicit per request. A production embedding can
replace it with a provider that validates origins, ports, redirects, sizes,
quotas, and approvals. That policy remains effective after total compromise of
the shared Dolly userspace because Wasm cannot replace its imports.

## In-Wasm request API

`include/dolly/http.h` exposes `dolly_http_perform`. A request contains:

- method and URL;
- RFC-style request-header lines;
- a fixed request body;
- follow-redirect and fail-on-status flags;
- body and response-header callbacks.

The browser receives none of the caller's filesystem paths, descriptors,
allocator state, or process state. Callback execution and all writes to files
remain inside Wasm.

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
headers, and redirect mechanics. Git options for those browser-owned choices
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
