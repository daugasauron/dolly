# HTTP

`env.dolly_http_dispatch` is Dolly's only agent-selected network edge. Programs
never import Fetch, sockets, DNS or TLS; libcurl, Git, Python and Janis all sit
above one kernel slot pool and one browser broker whose policy the embedding
sets. Authority is summarized in the [browser boundary](browser-boundary.md).

```mermaid
flowchart LR
  prog["Process: libcurl, Janis, Python"] -- "HTTP_BODY_WRITE, HTTP_START, HTTP_POLL" --> kernel["Kernel slot pool<br/>16 x 64 KiB"]
  kernel -- "env.dolly_http_dispatch spans" --> broker["broker.mjs"]
  broker -- "authorize" --> policy["policy.mjs"]
  broker -- "reserved *.dolly.invalid" --> local["local-services.mjs"]
  broker -- "other allowed URLs" --> fetch(("Fetch"))
  broker -- "URL, headers, body chunks" --> kernel
```

## Transport

- Contract: [`host/http/dolly-http-0.wat`](../host/http/dolly-http-0.wat); kernel side in
  [`host/http/kernel.c`](../host/http/kernel.c); browser side in
  [`host/http/http.mjs`](../host/http/http.mjs) and [`host/http/broker.mjs`](../host/http/broker.mjs).
- The import passes span descriptors only. The broker checks them against fixed
  caps before copying: method 32 B, URL 8 KiB, headers 64 KiB, body 8 MiB.
  Policy can lower these caps, never raise them. Metadata is literal UTF-8
  without NUL.
- URLs must be absolute `http:` or `https:`; nothing resolves against the page.
- Reserved `*.dolly.invalid` origins never reach Fetch: an enabled `build@0` or
  `packages@0` admits its own requests there
  ([`local-services.mjs`](../host/http/local-services.mjs)); any other fails
  with `EACCES`.
- A private host acknowledgement admits one request at a time; transfers then run
  concurrently in 16 fixed slots. A handle encodes slot and generation, so stale
  handles never touch a successor. `EBUSY` means the slot is occupied.
- Terminal errors are target errnos: `EACCES` policy, `EDQUOT` quota, `E2BIG`
  size, `ETIMEDOUT` deadline (which includes guest backpressure), `ECANCELED`,
  `EIO` transport. Errors never echo URLs, headers or credentials, and cannot
  distinguish CORS, DNS, TLS or redirect failures.
- Process exit, signal termination and forced termination cancel only that
  process's requests.
- Processes stage request bodies in the kernel with `HTTP_BODY_WRITE` packets of
  at most 1 MiB before `HTTP_START`. Each process or thread has one pending
  body; replacement, a failed start, discard or exit frees it.

## Policy

Without a policy object (the public demo) the broker permits any HTTP(S) URL,
the app's own origin included, keeps caller credential headers, follows redirects
on request, and applies a 10-minute deadline (so reasoning and conversation
summaries can finish), no request quota and no response cap. **This does not
prevent exfiltration.** Restricted embeddings set a policy
before `browser.mjs` loads; the broker consumes and deletes the global:

```js
globalThis.DOLLY_HTTP_POLICY = {
  maxRequests: 64,                       // default 256
  rules: [{
    origin: "https://openrouter.ai",     // exact origin
    path: "/api/v1/chat/completions",    // or pathPrefix, matched by whole segments
    methods: ["POST"],                   // default GET and HEAD
    credentialHeaders: ["authorization"],
    maxRequestBytes: 2 * 1024 * 1024,
    maxResponseBytes: 16 * 1024 * 1024,
    timeoutMilliseconds: 120_000,
  }],
};
```

- Credential headers not listed for the matched rule are removed. The broker
  never stores, injects or rewrites credentials; they are ordinary sandbox state.
- Explicit rules and bootstrap sources reject redirects: Fetch hides intermediate
  destinations. `DOLLY_HTTP_FOLLOW_REDIRECTS` works only under the default policy,
  where cross-origin redirects strip `Authorization` as Fetch does, not as native
  curl does; other explicit headers and 307/308 bodies reach the next destination.
- Bootstrap sources (the recipes and `SOURCE` files a release publishes) are
  exact credential-free GETs of their `https://daugasauron.com` URLs with pinned
  byte bounds, fetched from the page's own release instead. Under an explicit
  policy the N sources share a budget of 4×N requests, separate from
  `maxRequests`.
- Fetch always uses `credentials: "omit"` and no referrer. The broker drops
  browser-owned headers such as `User-Agent` and `Accept-Encoding`: engines
  disagree on whether to ignore them or preflight them (Firefox preflights a
  `User-Agent`).

## CORS

Dolly cannot turn CORS off; `no-cors` gives unreadable responses. Prefer
endpoints that send CORS headers. Otherwise run a reviewed relay on its own
origin that sends CORS headers, with an exact upstream allowlist and limits; it
is one more allowed destination and widens authority accordingly. The default
policy admits the app's own origin, so a same-origin relay needs no rule. Never send
credentials through a public CORS proxy. Browser flags or extensions that
disable web security are not a deployable fix. Firefox hides CORS details from
Fetch, so a generic transport failure alone does not identify its cause.

## In-Wasm clients

- C: [`host/http/http.h`](../host/http/http.h) provides `dolly_http_start`, `_poll`,
  `_cancel` and the synchronous `dolly_http_perform`.
- libcurl: official curl 8.21 headers over
  [`libcurl-fetch.c`](../src/libcurl-fetch.c), linked with `-lcurl`. It covers
  easy and multi handles, header lists, common methods, read/write/header/debug
  callbacks, `HTTPAUTH` basic and info queries: the subset real ports need, not
  every libcurl behavior. `USERAGENT` and `ACCEPT_ENCODING` are accepted and
  ignored; they are request metadata, and the browser owns those wire headers.
  Fetch owns TLS, DNS, pooling, compression and redirects, so proxies, cookies,
  certificates, disabling TLS verification and transfer timeouts return
  `CURLE_NOT_BUILT_IN` rather than being silently remembered; unknown options
  return `CURLE_UNKNOWN_OPTION`. A relative URL fails with `CURLE_URL_MALFORMAT`
  and a disallowed redirect with `CURLE_COULDNT_CONNECT`.
- Git: upstream `git` and `git-remote-http(s)` link that libcurl
  ([`Dollyfile-system-tools`](../Dollyfile-system-tools)): clone, fetch and push over HTTP. Clean/smudge
  filters are not ported. Cancelling an exchange does not undo a ref update the
  remote already accepted.
- Janis `fetch()` polls slots cooperatively so timers and promises keep running.
- Python (demo): the built-in `_dolly_http` module carries `urllib.request` and
  `requests` (pip's vendored copy included), so stock `pip` installs through the
  broker; sockets and `ssl` stay unavailable.
