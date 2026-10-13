# The HTTP broker's six credential header names: the investigation

Read on `work/rust` (`integrate/round-1013`, head `6325aece`, 2026-10-14; history shared with `main`). Nothing was built or run; every statement comes from `git`, `grep` and the files. Line numbers are of this tree unless a commit is named. Where a fact is browser behaviour rather than something in the tree, it is marked so. No credential value appears below; the tests' fixture tokens are described, not copied.

## Summary (findings, no advice)

1. The six names were born complete in the first commit, `aa0e63c0` (2026-08-31, author kallur, no message body): the set, the `credentialHeaders` rule field validated against that same set, the refusal of a `credential` value in a rule, the comment "which common credential headers", and the deny-list mechanism. No name was added or removed since. The list's one later use is the relay (`907c1340`, 2026-10-06), which strips the same six unless the mapping names them.
2. The broker never injected a key. From `aa0e63c0` a rule carrying `credential` is a `TypeError` ("Dolly HTTP credentials belong inside the sandbox; use credentialHeaders", today `host/http/policy.mjs:80-84`), and that day's document said "The broker never owns, injects, or rewrites the value". No allow list of request headers existed at any point; `allowHeaders` occurs only in the audit; no task or commit weighs deny list against allow list.
3. The word "common" stood in the public documents from `aa0e63c0` to `d8fa8c47` (2026-09-30, the docs rewrite): "a matched rule explicitly names the common credential headers it permits for that destination, and all others are removed" (`docs/security.md`, merged away that day). Since then `docs/http.md:83` says "Credential headers not listed for the matched rule are removed" and no document says what a credential header is; the word survives only in the code comment (`policy.mjs:243-245`). No document, before or after, listed the six.
4. Today, per mode: a hardened rule deletes the six names it does not list (`policy.mjs:246-250`); a bootstrap source deletes all six (`:216`); a relay deletes the six its mapping does not name (`:171-173`); a reserved local service deletes every header (`host/http/local-services.mjs:27`); development mode deletes none (`credentialHeaders: null`, `:232`). Six browser-owned transport names are deleted in every mode (`:22-29`, `broker.mjs:216`). Fetch runs with `credentials: "omit"`, no referrer, and `redirect: "error"` except in development mode with the program's follow flag (`broker.mjs:225-232`).
5. The audit's claims hold: lines 8-15 are the six; a hardened rule passes every header not in the six to its destination (tests show `content-type` and `git-protocol` passing, `test/http-policy.test.mjs:48`, `test/http-broker.test.mjs:499`); the comment says "common" (`:243-245`). The document says the same as the code only in effect, not in content: a reader of `docs/http.md` learns the set only from the validator's error or the source.
6. Tests cover: `cookie` removed and `authorization` kept under a hardened rule naming it (`http-policy.test.mjs:46-47`, `http-broker.test.mjs:134-135`); `authorization` removed for a bootstrap source (`:143`) and for an unnamed relay (`:201`, broker `:498`); `authorization` and `x-api-key` kept in development mode (`:79-80`); a response `authorization` header withheld (broker `:136`); a relay naming `x-custom` refused (`:222`). Not tested: hardened removal of `x-api-key`, `api-key`, `x-goog-api-key`, `proxy-authorization`; no test names a secret in a non-list header.
7. Who sets a hardened policy: nobody in production. The public sites run the default (owner, 2026-09-30, `eecab3df`: "The owner wants every HTTP(S) destination reachable by default, with DOLLY_HTTP_POLICY as the configurable restriction"; `907c1340`: "the public sites, being static files, configure none"). The first and only public-site policy, two OpenRouter paths with `authorization` in `index.html` of `aa0e63c0`, was removed the same day (`13fd1ad8`, "Permit generic network access in the public demo"). About thirty test and script files set a policy; ten name `credentialHeaders`, nine of them `authorization` only, one (`closed-source-agent`) `x-api-key` and `authorization`.
8. What the catalog's programs send, from the fixtures that observe them: Pi to OpenRouter `authorization: Bearer` (`demos/pi/test/pi-browser.mjs:26,248`); Codex `authorization: Bearer` plus `chatgpt-account-id`, and its OAuth refresh token in a POST body to a rule with no `credentialHeaders` (`demos/codex/test/fixtures/codex-login.mjs:21-22,67-68,100-104`); Claude Code `x-api-key` (`demos/closed-source-agent/test/closed-source-agent-browser.mjs:150`) beside `anthropic-version`, `anthropic-beta`, `anthropic-dangerous-direct-browser-access` (`:151`), `x-stainless-*`, `x-app`, `x-claude-code-session-id` (`tasks/20261005-133044-claude-code/TASK.md:95-98`); libcurl `Authorization: Basic` from `-u` or URL userinfo and any header from `CURLOPT_HTTPHEADER` (`src/libcurl-fetch.c:239-270,377-397,543`); the shell's `curl -H` (`src/commands/curl.c:161`); Python passes headers verbatim (`demos/python/cpython-transport.py:38`); Cargo fetches crates.io without a credential (`tasks/20260930-231102-cargo-native/TASK.md:456-460`). No program or configuration in the tree sends `private-token`, `x-auth-token`, `openai-api-key`, `x-functions-key` or `ocp-apim-subscription-key`; the only non-list identity header in use is `chatgpt-account-id`, an account id, not a secret.
9. A second gate already exists outside Dolly for cross-origin destinations: the destination's own CORS `Access-Control-Allow-Headers` decides which non-safelisted request headers the browser sends after a preflight. The tree records it: OpenRouter's preflight refuses `anthropic-version`, `anthropic-beta`, `x-app` (`claude-code/TASK.md:95-99`); Firefox preflights `User-Agent` (`policy.mjs:17-21`); every fixture answers `Access-Control-Allow-Headers: *` (`codex-login.mjs:61`). It does not gate same-origin requests, a relay (which answers its own preflight, `docs/http.md:133-137`) or the preflight request itself.
10. Not found: any owner statement naming the six or the deny-list form; the reason for exactly these six (the commit has no body; `api-key`, `x-goog-api-key` and `proxy-authorization` have had no user in the tree at any commit); any measurement; any record of a credential leaving by a non-list header.

---

## 1. History

### 1.1 Birth: `aa0e63c0`, 2026-08-31 00:13 JST, "Build the browser-native Dolly agent userspace"

The commit (author kallur, no body, no co-author line) added `src/http-policy.mjs` (149 lines), `docs/http.md`, `docs/security.md`, `include/dolly/http.h` and an `index.html`. `git show aa0e63c0:src/http-policy.mjs` holds, already in their final form:

- the set: `authorization`, `cookie`, `proxy-authorization`, `x-api-key`, `api-key`, `x-goog-api-key`;
- `isDollyCredentialHeader(name)`;
- `normalizeRule`: exact origin, `path` or `pathPrefix`, `methods` (default GET, HEAD), the refusal `if (rule.credential !== undefined) throw new TypeError("Dolly HTTP credentials belong inside the sandbox; use credentialHeaders")`, and `credentialHeaders` validated against the set ("invalid Dolly HTTP credential header");
- `authorize`: hardened rule or the development rule `{ credentialHeaders: null, ... }`, then the comment "Credentials are ordinary sandbox state. Development mode preserves them. A hardened destination rule must explicitly name which common credential headers may leave for that exact destination." and the loop deleting the six names not in `rule.credentialHeaders`;
- `consumeDollyHttpPolicy`: reads and deletes `globalThis.DOLLY_HTTP_POLICY`.

`git log -S` for each of `credentialHeaderNames`, `x-goog-api-key`, `"api-key"`, `proxy-authorization` and `which common` finds `aa0e63c0` as the first and, for the names, only commit that introduced them. `DOLLY_HTTP_POLICY` likewise first appears there.

That day's `docs/http.md` (`aa0e63c0:docs/http.md:22-28,45-54`):

> "A hardened policy contains exact-origin rules, an exact path or path prefix, allowed methods, byte/time limits, and the names of credential headers that may reach that destination. … It always uses `credentials: "omit"`, a no-referrer policy, and rejects redirects rather than allowing a request body to reach an unvalidated redirect destination."
>
> "Credential values are ordinary Dolly state. Pi may store them in its in-memory home directory or environment and sends its own authorization header, just as it does on a conventional machine. The broker never owns, injects, or rewrites the value. With no policy object the development demo preserves those headers and permits generic HTTP(S), while still enforcing finite request, response, timeout, and request-count limits. It is therefore useful but not safe against exfiltration. Production embeddings should supply an explicit destination rule set and list only the credential-header names each destination needs. This policy remains effective after total compromise of the shared Dolly userspace because Wasm cannot replace its imports."

That day's `docs/security.md` (`aa0e63c0:docs/security.md:188-200`):

> "Credentials remain in Wasm; a matched rule explicitly names the common credential headers it permits for that destination, and all others are removed. The browser never injects secret values. … The no-configuration demo mode still accepts arbitrary HTTP(S) destinations, including sandbox-supplied credential headers, so it is not an exfiltration-safe deployment policy. It retains finite limits. A production embedding must provide an explicit allowlist."

("allowlist" there is of destinations, the rules; not of headers.)

The same commit's `index.html` set the only hardened policy a public page ever had (`git show 13fd1ad8 -- index.html`, the removal diff): for `location.hostname.endsWith(".github.io")`, two rules, `GET /api/v1/models` and `POST /api/v1/chat/completions` on `https://openrouter.ai`, each `credentialHeaders: ["authorization"]`, with the comment:

> "The public demo grants one deliberately narrow autonomous network capability. Credentials still originate and remain in WasmFS; only this header name may leave for these exact OpenRouter paths."

So the one provider the list was written against is OpenRouter (`authorization`). `x-api-key` matches Anthropic's convention, `x-goog-api-key` Google's, `api-key` Azure OpenAI's (my knowledge, not the tree's): the tree at `aa0e63c0` had no program sending any of those three, and none does today (`grep -rn` over `src host demos`: the three names occur only in `policy.mjs`).

### 1.2 The same day: the public site loses its policy (`13fd1ad8`, 07:59)

"Permit generic network access in the public demo" removed the `index.html` block above and rewrote `docs/security.md` to its "The public Pages embedding intentionally runs the no-configuration broker mode. A completely compromised Wasm userspace can send readable sandbox data and sandbox-supplied credential headers to any HTTP(S) destination that accepts the browser's CORS request." (`13fd1ad8:docs/security.md:104-112`). No message body gives the reason. From here on, the hardened mode exists for embeddings and tests; no public page has set `DOLLY_HTTP_POLICY` since (`grep -rn DOLLY_HTTP_POLICY --include=*.html`: nothing).

### 1.3 Bootstrap sources (`9e013dd9`, 2026-08-31 21:52)

"Define declarative Dolly images and harden the agent runtime" added `normalizeTrustedSource` and the bootstrap branch of `authorize`, with its own `for (const name of credentialHeaderNames) headers.delete(name)` and the comment "Recipe and source URLs are build inputs selected by the embedding page, not capabilities granted by an untrusted Dollyfile. They are exact, read-only, credential-free URLs with byte-for-byte response limits." (`git show 9e013dd9 -- src/http-policy.mjs`). The second use of the set, same shape.

### 1.4 The broker extracted (`c3f5b1fd`, 2026-09-05) and the response side

"Make the browser capability boundary explicit and reviewable … Extract the HTTP broker" moved the response-header filter `if (!isDollyCredentialHeader(name))` into the broker (`git log -S'isDollyCredentialHeader(name)'`: `aa0e63c0`, `c3f5b1fd`). The set has been applied to response headers since birth.

### 1.5 The documents: "common" leaves (`18275741` 09-08, `d8fa8c47` 09-30)

`18275741` ("Refresh and condense documentation") kept "names of credential headers that may reach that destination" and "list only the credential-header names each destination needs" in `docs/http.md` (`18275741:docs/http.md:61,92`) and "names the common credential headers it permits" in `docs/security.md`. `d8fa8c47` ("Rewrite the core docs as short references with diagrams … Merged security.md into browser-boundary.md") replaced all of it with today's two sentences: "Credential headers not listed for the matched rule are removed. The broker never stores, injects or rewrites credentials; they are ordinary sandbox state." (`docs/http.md:83-84`; `git log -S'Credential headers not listed for the matched rule'`: `d8fa8c47` only). `docs/browser-boundary.md` today has no sentence on which headers are credential headers (`grep -n -i common docs/*.md`: one hit, "common methods", unrelated).

### 1.6 The default mode decided by the owner (`0ff7e26d`, `eecab3df`, 2026-09-30)

The takeover audit's `tasks/20260930-100000-audit-16` found that under the default policy Wasm reads any same-origin path. `0ff7e26d` ("Deny the app origin and relative URLs to Wasm HTTP") denied the app origin by default; `eecab3df` the same day reverted that part:

> "The owner wants every HTTP(S) destination reachable by default, with DOLLY_HTTP_POLICY as the configurable restriction. Revert the default-policy denial of the app origin and the absolute-URL requirement from 0ff7e26; keep its generated constants, whole-segment prefixes and bootstrap quota." (`eecab3df`, message)

The task's resolution: "By design. The default HTTP policy has no restrictions, the page origin included; DOLLY_HTTP_POLICY restricts it (owner, 2026-09-30; eecab3d)." (`audit-16/TASK.md:34`). `0ff7e26d` is also where `pathWithin` (whole segments, encoded separators refused) and the bootstrap quota of 4 per source came from. Neither commit touched the header set.

### 1.7 The Claude relay, added and removed (`dbe223d9` 09-30, `131e2120` 10-01)

`tasks/20260930-220100-claude-relay`: "Owner goal: a local Claude proxy … a local HTTP service outside the sandbox that holds the credential, admits only exact local origins and a relay-only bearer token" (`:7-9`). Removed the next day: "The owner asked to remove the relay. An API key was the only permitted credential (Anthropic does not allow routing requests through Free, Pro or Max subscription credentials or intermediating Claude.ai sign-in …), and the key's account had no credits. `dbe223d` is reverted; the Codex relay and OpenRouter remain." (`:24-28`). This is the one recorded owner decision about a credential's path: a key stays the user's and goes from the user's browser to the provider; a service holding a key on the user's behalf was taken out. `tasks/20261007-085236-claude-code-image/TASK.md:64-68` restates it for the Claude Code image: "No relay (`131e2120` removed the last one), no shared key, no key in the image, the tests or the evidence. Requests go from the user's browser to Anthropic through the broker, which 'never stores, injects or rewrites credentials' (`docs/http.md`)." The owner, shown the readings: "All of this is fine." (`:98-100`). On keys in evidence: "The key goes into no file, log or task." (`tasks/20261012-232215-owner-answers/TASK.md:22`); "the key is read from `~/.openrouter` at run time and never written anywhere" (`:30`).

The Codex relay that remains (`demos/game-agent/codex-relay.mjs`, "Local development inference service; never part of Dolly's browser host") is the one place in the repository with an allow list of request headers: `forwardedHeaders = ["accept", "content-type", "content-encoding", "openai-beta", "originator", "session-id", "x-client-request-id"]` (`:12`), `allowHeader: name => [...forwardedHeaders, "authorization", "chatgpt-account-id"].includes(name)` (`:33`), and the relay answers 403 "Header not allowed" to any other (`demos/game-agent/local-relay.mjs:31`). It replaces the client's `authorization` with its own (`codex-relay.mjs:39`). That is a Node service for a demo, outside the boundary.

### 1.8 The broker relay (`907c1340`, 2026-10-06): the set's third use

`tasks/20261005-131649-git-fetch` ("Decision (2026-10-06, delegated by the owner)") chose a relay as embedding configuration. Its text on credentials: "no `Authorization` forwarding (a token must never cross a third party, as `docs/http.md` says of public CORS proxies)" (`:105-107`, of the first shape), then for the chosen shape "the broker withholds every credential header the mapping does not name" (`:215-216`) and "'No new remote service' (the owner's instruction for the public sites): they are static files, so they get no relay" (`:234-236`). The commit: "the relay receives no credential header the mapping does not name, a relayed request follows no redirect … Nothing is configured by default, and the public sites, being static files, configure none." `normalizeRelay` validates the mapping's `credentialHeaders` against the same six (`policy.mjs:159-163`); `relayUrl` deletes the six not named (`:168-175`).

### 1.9 Why a deny list of names and not an allow list of headers: what is recorded

Nothing explicit. No commit message, task or document weighs the two forms; `git log -S'allowHeaders'` finds only the audit commit `99c535b2`; `git grep -i "allowed headers\|header allowlist"` over `tasks docs host src` finds only `boundary.md:43`. What the record holds indirectly:

- The design sentence, from the first day: "Credential values are ordinary Dolly state … The broker never owns, injects, or rewrites the value." The broker's job is stated as withholding named secrets from destinations, not as shaping requests.
- The one other header list in the policy exists for a different reason, browser variance, and says so: "Fetch owns these transport headers. Forwarding native libcurl values is not merely ineffective: engines disagree about whether to discard them or turn the request into a CORS preflight. In particular Firefox preflights a caller-supplied User-Agent, which makes otherwise CORS-enabled PyPI GETs fail." (`policy.mjs:17-21`).
- The local services do the opposite, delete everything, with a comment that says why: "Remote rules never grant these services" and a service takes no headers (`local-services.mjs:9-14,27`).
- The documents' example rules list only `credentialHeaders`, never the application headers a request carries (`docs/http.md:64-75`): `content-type`, `accept`, `anthropic-version` and the rest are nowhere a rule author's concern today.

### 1.10 What "development mode" is

The name is the code comment's ("Development mode preserves them", `policy.mjs:243`). It is the policy with `configuration === undefined` (`:181`): no rules, no quota (`maxRequests: Infinity`, `:185-189`), `credentialHeaders: null` (`:232`), `followRedirects: true` (`:231`), 8 MiB request, unbounded response, 10 minutes (`:40-45`). `docs/http.md:56-60` calls it "Without a policy object (the public demo)" and says in bold "This does not prevent exfiltration." It is the mode of every public site (§1.6) and of every demo test that sets no `policy:` (for example `demos/pi`'s phone and voice tests, `demos/javascript`'s default page). The owner's reason, as recorded by `eecab3df`: every destination reachable by default; the restriction is the embedding's.

---

## 2. What happens today

### 2.1 The life of one request

1. A program calls `dolly_http_perform` (`host/http/http.h:94`, `client.c:142`), which calls `dolly_http_start` (`client.c:25`). The header block is one string of `Name: value\r\n` lines the program composed (libcurl's header list, Python's `headers` tuples, Janis's `fetch` init, the shell `curl`'s `-H`).
2. The client stages a body larger than one packet with `HTTP_BODY_WRITE` packets (`client.c:58`), then sends an `HTTP_START` packet (`:83`).
3. The kernel decodes method, URL and headers from the packet (`kernel.c:205-238`, NUL refused `:222`) and calls the import `env.dolly_http_dispatch` with spans into kernel memory (`:76-78`; `dolly-http-0.wat:6`). The kernel reads no header name.
4. The Worker binding posts the spans to the page and blocks on the admission word (`http.mjs:56-61`, `broker.mjs:17-25`). The page's `NetworkTransport.dispatch` checks every span against the fixed caps before copying any byte (method 32 B, URL 8 KiB, headers 64 KiB, body 8 MiB; `broker.mjs:84-107`), decodes the text and refuses NUL (`:99-103`).
5. `HttpTransfer.run` (`:197`): the URL is resolved (`target`, `:54-59`; a site path to the page's own site); `http:`/`https:` only (`:203`); userinfo refused outright, `EINVAL` (`:205-206`); the header block is parsed into a `Headers` object (`:209-215`); the six browser-owned transport names deleted (`:216`); then `policy.authorize(target, method, headers, bodyLength)` (`:218`), which may delete more names from the same `Headers` object and returns the rule.
6. Fetch: `{ method, headers, body, credentials: "omit", redirect: flag 2 && rule.followRedirects ? "follow" : "error", referrerPolicy: "no-referrer", signal }` (`:225-232`); the URL is the bootstrap mirror, the relay URL, or the target (`:233-234`).
7. Back to Wasm: the URL record (the program's own URL for a relay or a site path, else `response.url`, `:240`), the status line, every response header Fetch exposes except the six names (`:243-246`), then body chunks counted against `maxResponseBytes` (`:248-266`).

### 2.2 Where the destination is matched, and what a rule can say

`policy.authorize` (`policy.mjs:200-253`). First the bootstrap table: exact `href`, GET, empty body, no userinfo, no query, no fragment (`:202-206`). Else the quota (`:218`), then in hardened mode the first rule with `candidate.origin === target.origin`, path exact (`rule.path`) or `pathWithin(pathname, pathPrefix)` by whole segments with `%2f`/`%5c` refused (`:113-118`), and `methods.has(method)` (`:222-227`); none: `EACCES` (`:228`). A rule holds: `origin` (exact, `http(s)`, `:59-62`), `path` xor `pathPrefix` (`:63-73`), `methods` (uppercase tokens, default GET and HEAD, `:74-79`), `credentialHeaders` (a subset of the six, `:85-91`), `maxRequestBytes`, `maxResponseBytes`, `timeoutMilliseconds` (`:98-109`). A hardened rule has no `followRedirects` field, so `broker.mjs:229` yields `"error"`. The size check is before the header stripping (`:239-241`).

### 2.3 What is removed from the request, by mode

| Mode | Where decided | Deleted from the request |
| --- | --- | --- |
| every mode | `broker.mjs:205-206` | a URL with userinfo is refused (`EINVAL`), not rewritten; libcurl turns userinfo into `Authorization: Basic` before the broker sees it (`src/libcurl-fetch.c:377-397`; `docs/http.md:166-168`) |
| every mode | `policy.mjs:22-29`, `broker.mjs:216` | `accept-encoding`, `connection`, `content-length`, `host`, `transfer-encoding`, `user-agent` |
| every mode | `broker.mjs:228-230` | browser cookies and HTTP auth cache (`credentials: "omit"`), the referrer |
| development | `policy.mjs:230-236,246` | nothing further (`credentialHeaders: null`) |
| hardened rule | `:246-250` | each of the six names not in `rule.credentialHeaders` |
| bootstrap source | `:216` | all six |
| relay, after the rule | `:171-173,251` | each of the six not in the mapping's `credentialHeaders` |
| reserved local service | `local-services.mjs:27` | every header |
| inherited (a result tab) | `:290-294` | each policy strips in turn on the same object: the intersection |

Nothing in any mode reads a header name outside the two fixed sets. A header named `private-token`, `x-auth-token` or `x-anything` passes every mode to whatever destination the rule admits.

Browser behaviour, not in the tree and not run here: `cookie` and `proxy-authorization` (and the five transport names other than `user-agent`) are forbidden request-header names in Fetch; a page cannot send them whatever it sets, so their deletion is a no-op in the browser. The tree's own evidence for this class of fact is the comment at `policy.mjs:17-21` (Firefox preflights `User-Agent`, which is not forbidden).

### 2.4 What a relay sees

The policy judges the real URL first (`:222-228`); `relayUrl` applies only to an admitted request (`:251`) and returns `through + host + pathname + search` (`:174`). Headers to the relay: the request's headers after the rule's stripping, minus the six names the mapping does not list; everything else, including `git-protocol`, goes (`http-broker.test.mjs:495-499`). `followRedirects: false` (`:252`). `DOLLY_HTTP_RELAYS` is consumed and deleted with the policy (`:261-263`); a result tab keeps the page's relays and inherits the policy (`:288-289`). `docs/http.md:125-128`: "The relay sees the whole request. Credential headers are removed unless the mapping lists them, whatever the rule allows, so pushing or cloning a private repository through a relay is a decision to trust its operator with the token."

### 2.5 Redirects

Hardened rules, bootstrap sources and relays: `redirect: "error"`, so a redirect ends the request with `EIO` and no second request leaves (`broker.mjs:229`; `http-broker.test.mjs:165-168`). Development mode with `DOLLY_HTTP_FOLLOW_REDIRECTS` (`http.h:16`; set by libcurl when the program asked to follow, `libcurl-fetch.c:768`): Fetch follows, and the broker never sees the intermediate request. `docs/http.md:86-88`: "cross-origin redirects strip `Authorization` as Fetch does, not as native curl does; other explicit headers and 307/308 bodies reach the next destination." So in development mode a destination that redirects can send `x-api-key`, `private-token` and the body, but not `authorization`, to any origin; in every hardened case nothing follows.

### 2.6 What comes back

Every response header Fetch exposes, minus the six (`broker.mjs:243-246`; the test at `http-broker.test.mjs:128,136` plants an `authorization` response header and checks it never reaches the records). Browser behaviour, not in the tree: for a cross-origin response Fetch exposes only the CORS-safelisted response headers plus those in `Access-Control-Expose-Headers`; `set-cookie` is a forbidden response-header name and is never visible to script. Errors carry an errno only, never a URL or header (`docs/http.md:39-41`).

### 2.7 Bootstrap sources

The recipes and `SOURCE` files of the release, named by site path, each with its byte length (`normalizeTrustedSource`, `policy.mjs:123-142`), built by the page from the registry (`src/browser.mjs:103-108`). Exact GET, no query, no body, no userinfo, all six names deleted, fetched from the page's own copy (`mirror`), 4×N budget under a hardened policy (`:195,213-216`).

### 2.8 Under the threat model

Inputs to the decision that come from the page: `DOLLY_HTTP_POLICY`, `DOLLY_HTTP_RELAYS`, the bootstrap list, the inherited configurations of a result tab. From Wasm: method, URL, the header block, the body, the flags, the sequence. The kernel is in Wasm and is part of the compromise; it adds nothing the broker trusts.

A compromised userspace can compose any header name and value it holds. With them it can reach:

- development mode: any `http(s)` origin, every header kept, redirects followed on request; a credential in any header, in the query or in the body reaches any destination. `docs/http.md:59`, `docs/browser-boundary.md:159-161` and `README.md:65-67` say so in bold.
- hardened mode: only the origin, path and method of some rule, with no redirect. In a header outside the six, a credential reaches that destination. In one of the six, it reaches that destination only if the rule names that header. In the query or body, it reaches that destination. Through a relay: the relay's operator sees everything the rule let through, minus the six it was not named for.
- bootstrap and local services: no credential in any of the six (bootstrap) or in any header (local); the destination is fixed by the page.

What the list protects, read from the code and the documents: a value in one of six named headers against reaching a destination that the embedding admitted for another reason. The pattern in every real rule set is a page that admits a provider's endpoint with `authorization` and, beside it, fixture or registry GETs without (`demos/pi/test/pi-browser.mjs:68-72`: the OAuth token endpoint, the provider fixture with `authorization`, the fixtures and `amy-index.txt` without; `closed-source-agent-browser.mjs:74-78`: the npm tarball without, Anthropic `/v1/` with `x-api-key` and `authorization`, Anthropic `/api/` and the platform hello without). So the stated purpose is: the user's key for OpenRouter or Anthropic does not leave to the other origins the same page admits, and not to a relay the page did not entrust. It does not protect against the admitted destination itself, against a key renamed into another header, or against a key in a query or body (§5).

---

## 3. Who sets a policy, counted; what programs send

### 3.1 Policies in the tree

Production pages: none. The public sites' `index.html` files and `config/` set no `DOLLY_HTTP_POLICY` or `DOLLY_HTTP_RELAYS` (`grep` over `*.html`, `*.yml`, `*.toml`, `*.sh`: nothing). `docs/http.md:56` ("Without a policy object (the public demo)"), `docs/http.md:141-142`, `907c1340`. The owner's decision is §1.6.

Hardened policies, all in tests and scripts (files that set `DOLLY_HTTP_POLICY` or pass `policy:` to the harnesses `test/browser.mjs:30` and `demos/browser.mjs:38`):

| Where | Mode | Destinations | `credentialHeaders` |
| --- | --- | --- | --- |
| `demos/pi/test/pi-browser.mjs:68-72` | hardened, 256 | `auth.openai.com/oauth/token` POST; the test server's `/fixture/pi/` POST, `/fixture/` GET, `/amy-index.txt` GET | `authorization` on the provider fixture only |
| `demos/codex/test/fixtures/codex-login.mjs:21-25`, used by `codex-browser.mjs:29` | hardened, 256 | the OAuth issuer's device-auth and token paths POST; the backend's `codex/models`, `codex/responses`, `wham/usage` | `authorization` on the three backend paths |
| `demos/closed-source-agent/test/closed-source-agent-browser.mjs:74-78` | hardened, 64 | npm tarball GET (32 MiB); Anthropic `/v1/` POST (4 MiB); Anthropic `/api/` GET; platform `/v1/oauth/hello` GET | `x-api-key`, `authorization` on `/v1/` |
| `demos/classicube/test/classicube-browser.mjs:48-58` | hardened, 1024 | fixtures; OpenRouter `/api/v1/models`, `/api/v1/key`, `/api/v1/auth/keys`, `/api/v1/chat/completions`; or the Codex relay's `/codex/responses` | `authorization` on `key`, `chat/completions`, the relay |
| `demos/bhop/test/bhop-browser.mjs:26-35` | hardened, 1024 | the same OpenRouter paths or the Codex relay | `authorization` likewise |
| `demos/rts/test/rts-browser.mjs:38-51` | hardened, 1024 / 256 | OpenRouter three paths or relay providers; the fixture's `chat/completions` | `authorization` |
| `test/network-browser.mjs:73-80` | hardened | a forge origin through a relay (`DOLLY_HTTP_RELAYS`), a no-CORS origin, the fixtures | `authorization` on the forge and the libcurl contract |
| `test/image-build-service.test.mjs:19`, `test/http-policy.test.mjs`, `test/http-broker.test.mjs` | unit | examples | `authorization` |
| `demos/studio`, `cmake`, `javascript`, `llvm` (2), `rust`, `mojo` (2), `python`, `sdl2`, `xonotic`, `wine`, `zero-ad` (6), `test/custom-session-browser.mjs`, `test/gpu-render-browser.mjs`, `scripts/build-snapshot-browser.mjs` | hardened | fixture GETs, relay POSTs for 0 A.D.'s ENet | none |
| `demos/pi` phone and voice, `demos/javascript` default page, the Studio image's own tests without `policy:` | development | any | kept |

`tasks/20260930-231102-cargo-native/TASK.md:456-460` records the policy Cargo was tested under: `index.crates.io` `/` GET and `static.crates.io` `/crates/` GET, no `credentialHeaders`, and a relay for the index.

### 3.2 Credential-carrying headers the catalog's programs send

From the fixtures that observe real requests and from the clients' sources:

| Program | Header or carrier | Evidence | In the six? |
| --- | --- | --- | --- |
| Pi to OpenRouter | `authorization: Bearer` | `pi-browser.mjs:26,248` (every model request carries the typed key) | yes |
| Pi OAuth (OpenAI device flow) | code and tokens in POST bodies to `/oauth/token`, no header | `pi-browser.mjs:69,173-176` | not a header |
| Codex to the backend | `authorization: Bearer`, `chatgpt-account-id` | `codex-login.mjs:67-68` | `authorization` yes; `chatgpt-account-id` no (an account id) |
| Codex OAuth refresh | `refresh_token` in the POST body to a rule with no `credentialHeaders` | `codex-login.mjs:21-22,100-104` | not a header |
| Claude Code to Anthropic | `x-api-key` (API key) or `authorization` (OAuth); `anthropic-version`, `anthropic-beta`, `anthropic-dangerous-direct-browser-access`, `x-app`, `x-stainless-*`, `x-claude-code-session-id` | `closed-source-agent-browser.mjs:75,150-151`; `claude-code/TASK.md:95-98,192-193` | the two credentials yes; the rest are not credentials |
| libcurl (Git, the `curl` command, any C program) | `Authorization: Basic` from `-u`, `USERPWD` or URL userinfo (`CURLAUTH_BASIC` only); any header via `HTTPHEADER`; `XOAUTH2_BEARER` is `CURLE_NOT_BUILT_IN` | `src/libcurl-fetch.c:239-270,377-397,533,543,663`; `network-browser.mjs:93-101` (`-u` reaches the named rule) | Basic yes; a custom header no |
| the shell's `curl` | `-u` Basic, `-H` any header | `src/commands/curl.c:24,154,161` | as above |
| Git over HTTPS with a token | Basic through libcurl; `http.extraHeader` would go through `HTTPHEADER` | as libcurl; no Git configuration in the tree uses a token | Basic yes; an extra header no |
| Python `urllib`/`requests`/`pip` | headers passed as given; `requests` turns URL userinfo into Basic (library behaviour) | `demos/python/cpython-transport.py:38,140` | depends on the header |
| Janis `fetch` (npm, Claude Code's download) | headers passed as given; the npm tarball fetch carries none | `demos/javascript/dolly-node.js`; `closed-source-agent-browser.mjs:74` | — |
| Cargo | no credential to crates.io | `cargo-native/TASK.md:456-462` | — |
| Mojo's and Wine's sources | "Basic" in `prepare-*.sh` and recipes refers to build steps, not HTTP auth | `demos/mojo/Dollyfile-mojo-llvm:12,103` | — |

Names the audit cites (`private-token`, `x-auth-token`) and the task's others (`openai-api-key`, `x-functions-key`, `ocp-apim-subscription-key`): not in any source, configuration, recipe, test or document of the tree (`grep -rn -i` over `src host demos docs Dollyfile*`).

---

## 4. Each claim of the audit, checked

**"Credential stripping is a six-name list (`host/http/policy.mjs:8-15`)."** True. The lines are exact; the deletion loops at `:216`, `:247-249`, `:171-173` iterate that set and nothing else.

**"A hardened rule without `credentialHeaders` still lets `private-token`, `x-auth-token` or a bearer in a custom header leave, to that rule's destination only."** True by the code: `authorize` touches only names in the set; `broker.mjs:209-215` appends every other line unchanged. Demonstrated, for non-credential names, by `http-policy.test.mjs:48` (`content-type` kept) and `http-broker.test.mjs:499` (`git-protocol` kept to a relay). "To that rule's destination only": true; `redirect: "error"` for every hardened rule (`broker.mjs:229`), tested at `http-broker.test.mjs:165-168`. One qualification: for a cross-origin destination the browser's own CORS preflight also has to allow the custom name (§5, CORS), so "leaves" means "leaves the page" for a same-origin or `Access-Control-Allow-Headers: *` destination, and otherwise ends in a failed preflight; the value then still left for the preflight's `Access-Control-Request-Headers` only as a name, never as a value.

**"The code says 'common' (`policy.mjs:244`)."** True; the comment spans `:243-245` and dates from `aa0e63c0`.

**Does `docs/http.md:83` say the same as the code?** In effect, yes: "Credential headers not listed for the matched rule are removed" describes the loop. In content, no: a reader does not learn that "credential headers" is a closed set of six, nor which; the example names `authorization` (`:70`) and the relay example an empty list (`:116`). The only places a reader meets the set are the validator's message `invalid Dolly HTTP credential header: NAME` when a rule names a seventh (`:88`, `:161`) and the source. Between `aa0e63c0` and `d8fa8c47` the documents said "the common credential headers"; none ever enumerated them.

**Is the stripping tested, for which names, in which mode?** Unit (`test/http-policy.test.mjs`): hardened with `authorization` named keeps `authorization`, drops `cookie`, keeps `content-type` (`:46-48`); development keeps `authorization` and `x-api-key` (`:79-80`); bootstrap drops `authorization` (`:143`); an unnamed relay drops `authorization` (`:201`), a named relay keeps it and drops `cookie` (`:210-211`); `x-custom` in a relay mapping is a `TypeError` (`:222`); `isDollyCredentialHeader` true for `Authorization`, false for `content-type` (`:68-69`). Broker (`test/http-broker.test.mjs`): `authorization` kept, `cookie` and `user-agent` dropped, `credentials: "omit"`, `redirect: "error"`, `no-referrer`, response `authorization` withheld (`:123-136`); redirect mode per policy kind (`:165-181`); relay drops `authorization`, keeps `git-protocol` (`:495-499`). Browser (`test/network-browser.mjs`): `-u` Basic reaches the named fixture and only there (`:93-101`); the relay received no `authorization` (`:131`); `test/boundary-browser.mjs` covers bootstrap parts, not headers. Not tested anywhere: hardened removal of `x-api-key`, `api-key`, `x-goog-api-key`, `proxy-authorization`; that a seventh header name passes a hardened rule (only non-credential names are shown passing); `x-api-key` kept when named (the `closed-source-agent` browser test asserts the fixture received it, `:150`, which covers it end to end for that demo).

---

## 5. What a change would mean, on real cases

Observations only. "Today" is §2.

### (a) A sentence in `docs/http.md`

What it would state is in §2.3: the six names, the three places they apply, and that any other header passes to the admitted destination. The code already holds the fact in one place (`policy.mjs:8-15`); a sentence would be a second copy of the list, in prose, which the 2026-09-30 rewrite removed the previous version of (§1.5). The validator's error is the only message today that tells a rule author the set is closed.

### (b) An allow list of request headers per rule (everything not named removed)

What each real rule set would have to list, by the headers the fixtures and tasks record:

- **Pi to OpenRouter** (`/api/v1/chat/completions` POST): `authorization`, `content-type`, `accept`; the OpenRouter attribution headers `http-referer` and `x-title` if pi-ai sends them (not recorded in the tree; the fixture reads only `authorization`, `pi-browser.mjs:26`). A missing `content-type` on a JSON POST is a provider 400 or 415; a missing `accept` changes a streaming response's content negotiation; neither is visible to the rule author except as Pi's error text.
- **Claude Code to Anthropic** (`/v1/` POST): `x-api-key` or `authorization`, `content-type`, `accept`, `anthropic-version` (required by the API), `anthropic-beta`, `anthropic-dangerous-direct-browser-access` (required by Anthropic's CORS for a browser origin, `closed-source-agent-browser.mjs:151`), `x-app`, `x-stainless-arch`, `-lang`, `-os`, `-package-version`, `-retry-count`, `-runtime`, `-runtime-version`, `-timeout`, `x-claude-code-session-id`, and whatever a new SDK version adds (`claude-code/TASK.md:95-98,192-193` list those seen). Missing `anthropic-version`: a 400 from the API; missing `anthropic-dangerous-direct-browser-access`: a CORS failure the broker reports as `EIO`, the class `docs/http.md:41-43` says Fetch cannot tell apart from "unreachable".
- **Codex to its backend**: `authorization`, `chatgpt-account-id`, `content-type`, `accept`, `openai-beta`, `originator`, `session-id`, `x-client-request-id` (the demo relay's own list, `codex-relay.mjs:12,33`, is the one measured allow list in the repository and already needs nine names). Its device-auth and token POSTs: `content-type` only.
- **`curl`, `git`, `pip`, `npm`, `cargo` against registries**: Git sends `git-protocol`, `pragma`, `content-type`, `accept` (`docs/http.md:137`); pip's `requests` sends `accept`, `user-agent` (dropped anyway), `cache-control`; npm sends `accept`, `npm-*` headers; Cargo sends `accept`, `if-none-match`/`if-modified-since` for the sparse index and `cargo-protocol`-style headers. None of these is recorded in the tree; a rule author would have to capture them per tool and per version. A missing conditional header costs cache validation silently; a missing `accept` on Git's smart HTTP changes the server's answer from protocol v2 to v0 or to an error.
- **A relay**: the relay's `credentialHeaders` would become a full list too, or the rule's list would apply before the mapping; today the relay sees everything but the unnamed six (`:171-173`), and the documented relay protocol expects "the same method, headers and body" (`docs/http.md:131-137`).
- **A custom recipe's page** (an embedding of its own): the author today writes origin, path, method and which of six names may leave; with (b) they would also enumerate the application headers of a client they did not write.
- **Who maintains the lists**: the embedding, per destination, per client version; the repository has one such list and it is in a demo's Node relay, maintained by hand (`codex-relay.mjs:12`), answering 403 to anything else (`local-relay.mjs:31`).

What (b) would add under the threat model: a compromised userspace could no longer carry a secret in a header the rule did not name, to the admitted destination; it could still carry it in the body, the query or the path (§5, below), and the admitted destination still receives everything the rule allows. What already does part of (b) outside Dolly: for a cross-origin destination, the destination's `Access-Control-Allow-Headers` (browser behaviour; the tree's evidence is `claude-code/TASK.md:95-99`, where OpenRouter's preflight refuses Claude Code's headers, and `policy.mjs:17-21`). That gate is the destination's choice, not the embedding's; `*` admits every custom name; it does not apply to same-origin rules (`{ origin: location.origin, path: "/amy-index.txt" }`, `docs/http.md:79-82`) or to a relay on the page's origin. Local services already run form (b) with an empty list (`local-services.mjs:27`).

### (c) Leaving it: what a rule's author must know today

That `credentialHeaders` may name only `authorization`, `cookie`, `proxy-authorization`, `x-api-key`, `api-key`, `x-goog-api-key` (anything else is a `TypeError` at page load, `policy.mjs:87-88`); that a rule with none still admits a request whose secret is in any other header, in the query, or in the body; that a relay mapping has the same six and is stripped after the rule; that a hardened rule never follows a redirect; and that the destination itself receives the whole admitted request. The documents say the second point nowhere; they say the fourth (`docs/http.md:85`) and the relay's (`:125-128`).

### Credentials outside any header

A key in the query string (`?key=`; Google's style), in the path, or in the body (OAuth `client_secret`, `refresh_token`: the Codex and Pi flows in the tree, `codex-login.mjs:100-104`, `pi-browser.mjs:173-176`; a JSON `api_key` field) is outside the reach of any header rule, present or proposed. The policy sees `target.search` only to refuse it for bootstrap sources (`policy.mjs:204`) and the local services (`local-services.mjs:18`); for rules it is not matched (`:222-227`) and a relay forwards it (`:174`). The body is counted, never read (`:239`). So the stripping's purpose, read from the code, can only be the narrow one in §2.8: a secret that a client puts in one of six conventional headers does not go to a destination admitted for other reasons. The destination the client is talking to gets what the client sends.

### Where the present arrangement is the only place a fact is held

- The six names: `host/http/policy.mjs:8-15` only. No document, test fixture or manifest repeats the set; tests name four of them (`authorization`, `cookie`, `x-api-key` in assertions; `x-custom` as a refused seventh).
- That "credential header" in `docs/http.md:83`, `:116` and `docs/browser-boundary.md:174` means that set: the validator at `policy.mjs:85-91,159-163`.
- Which headers each real client sends: the fixtures that assert on them (`pi-browser.mjs:26`, `codex-login.mjs:67-68`, `closed-source-agent-browser.mjs:150-151`) and the Claude Code task's notes; no document.
- The reason the public sites run development mode: the message of `eecab3df` and `audit-16/TASK.md:34`.

---

## 6. What could not be found out by reading

- Why these six and not five or seven: `aa0e63c0` has no body; no task of 2026-08-31 exists (`tasks/` begins in September); the names `api-key`, `x-goog-api-key`, `proxy-authorization` have had no sender in the tree at any commit.
- Any owner statement on the list, on "common", or on deny versus allow lists; the owner's recorded words concern the default mode (§1.6), relays and who holds a key (§1.7), and keys in evidence.
- Whether any credential has ever left through a non-list header in a hardened embedding: there is no hardened embedding in production, and no log.
- The exact header sets Pi's, pip's, npm's and Cargo's clients send through the broker: not recorded; a capture in a browser would be needed.
- Browser behaviours stated above as such (forbidden request headers, `Authorization` on cross-origin redirect, `Access-Control-Allow-Headers: *` and `Authorization`, `set-cookie` never exposed): known Fetch rules, not verified in this tree or run tonight; the tree's own statements are `docs/http.md:86-88` and `policy.mjs:17-21`.