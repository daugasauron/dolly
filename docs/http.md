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
  `EIO` transport. Errors never echo URLs, headers or credentials. `EIO` is one
  class: the browser could not fetch, because the response was blocked (no
  CORS headers, a redirect) or the host was unreachable (DNS, TLS, offline).
  Fetch does not tell these apart, and every client's message says so
  ([`dolly_http_error_message`](../host/http/http.h)); a policy refusal reads
  differently. `curl` exits with curl's own status: 7 for `EIO`, 9 for a
  policy refusal, 28 for a deadline.
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

## CORS and relays

Dolly cannot turn CORS off; `no-cors` gives unreadable responses. A page can
read only hosts that send CORS headers, and Git's smart-HTTP endpoints on
`github.com`, `gitlab.com` and `codeberg.org` send none. Browser flags or
extensions that disable web security are not a deployable fix. Firefox hides
CORS details from Fetch, so a generic transport failure alone does not
identify its cause.

An embedding that wants such a host maps its origin to a relay it trusts,
next to the policy and before `browser.mjs` loads; the broker consumes and
deletes the global:

```js
globalThis.DOLLY_HTTP_RELAYS = [{
  origin: "https://github.com",            // exact origin programs ask for
  through: "https://example.org/relay/",   // URL prefix ending in /
  credentialHeaders: [],                   // default: the relay sees none
}];
```

- Programs keep asking for the real URL (`git clone https://github.com/OWNER/REPO`
  with unchanged Git and no Git configuration). The policy judges that URL
  first: a relay admits nothing, and rules, quotas and limits name the real
  destination. An admitted request is then fetched from `through` + host +
  path + query, and the program is told the URL it asked for.
- The relay sees the whole request. Credential headers are removed unless the
  mapping lists them, whatever the rule allows, so pushing or cloning a private
  repository through a relay is a decision to trust its operator with the
  token. A relayed request never follows a redirect.
- The mapping is page configuration, like the policy: Wasm cannot set, read or
  change it, and a result tab does not inherit it.
- Relay protocol: for `METHOD through/HOST/PATH?QUERY` the relay sends the same
  method, headers and body to `https://HOST/PATH?QUERY` and returns the status,
  `Content-Type` and body. It answers itself and never with a redirect, which
  the broker would not follow. This is the URL shape of isomorphic-git's
  `cors-proxy`. On another origin than the page it must also answer CORS
  preflights for the methods and request headers it accepts (Git sends
  `Git-Protocol`, `Pragma` and its own `Content-Type`). Its own allowlist is its
  operator's duty: exact upstream hosts, for Git only
  `GET …/info/refs?service=git-upload-pack` and `POST …/git-upload-pack`
  unless pushes are intended, a response cap and a rate limit.
- The public sites are static files and configure no relay: there,
  `git clone` from `github.com` fails at once with the `EIO` message. Never
  send credentials through someone else's public CORS proxy.

## In-Wasm clients

- C: [`host/http/http.h`](../host/http/http.h) provides `dolly_http_start`, `_poll`,
  `_cancel` and the synchronous `dolly_http_perform`.
- libcurl: official curl 8.21 headers over
  [`libcurl-fetch.c`](../src/libcurl-fetch.c), linked with `-lcurl`. It covers
  easy and multi handles, header lists, common methods, read/write/header/debug
  callbacks, `HTTPAUTH` basic and info queries: the subset real ports need, not
  every libcurl behavior. `USERAGENT` and `ACCEPT_ENCODING` are accepted and
  ignored; they are request metadata, and the browser owns those wire headers.
  `TIMEOUT` and `TIMEOUT_MS` (`curl -m`) are a deadline kept in the client,
  which cancels the request. Credentials in a URL (`https://user:token@host/`)
  become Basic credentials and are removed from the URL, which Fetch would
  refuse. Fetch owns TLS, DNS, pooling, compression and redirects, so proxies,
  cookies, certificates, disabling TLS verification and connect timeouts return
  `CURLE_NOT_BUILT_IN` rather than being silently remembered; unknown options
  return `CURLE_UNKNOWN_OPTION`. A relative URL fails with `CURLE_URL_MALFORMAT`
  and a disallowed redirect with `CURLE_COULDNT_CONNECT`.
- Git: upstream `git` and `git-remote-http(s)` link that libcurl
  ([`Dollyfile-system-tools`](../Dollyfile-system-tools)): clone, fetch and push over HTTP, from
  hosts that send CORS headers or through a relay (see [CORS and relays](#cors-and-relays)).
  `github.com` sends none on its Git endpoints, so cloning from it fails with
  the `EIO` message unless the embedding maps it to a relay. There is no
  transport over a forge's REST API: it could only imitate a clone, without
  history, fetch or push. Clean/smudge
  filters are not ported. Cancelling an exchange does not undo a ref update the
  remote already accepted.
- Janis `fetch()` polls slots cooperatively so timers and promises keep running.
- Python (demo): the built-in `_dolly_http` module carries `urllib.request` and
  `requests` (pip's vendored copy included), so stock `pip` installs through the
  broker; sockets and `ssl` stay unavailable.
