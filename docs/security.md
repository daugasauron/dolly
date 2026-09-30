# Security model

Assume every program, file, credential and byte of Wasm userspace is compromised.
Containment must still hold: guest code can exercise only the authority supplied
by the trusted browser providers.

Private processes improve lifecycle and recovery, not this containment claim.
WebAssembly, the browser engine, page/Worker JavaScript and imported-function
implementations are trusted. Engine bugs, XSS and compromised application
JavaScript are outside the model. Ghostty and terminal parsing run inside Wasm.

## The perimeter

The canonical [outer contract](../abi/dolly-browser-0.wat) defines the exact
kernel imports and types. Builds reject drift. Capability-report JSON is not
the ABI source. The [review map](browser-boundary.md) points to each provider.

`env.dolly_http_dispatch` is the sole intentional agent-selected network
edge. Programs supply method, URL, headers and body; the browser enforces
policy and returns bounded bytes. It receives no WasmFS path or descriptor.
C/libcurl, Git, Python and Janis are adapters above that same edge, not
additional authority. No ambient Fetch, socket, native process, host filesystem,
DOM or JavaScript-evaluation API is exposed to programs.

The default demo permits arbitrary HTTP(S), sandbox-supplied credentials and
caller-requested redirects, with byte/time limits but no lifetime request quota.
It **does not prevent exfiltration of sandbox data**. An allowed request can also
cause external side effects; an allowlist bounds destinations, not intentions.
URLs must be absolute. The default denies the app's own origin except its exact
bootstrap sources, because that origin serves code, sessions and caches without
CORS. Loopback and LAN services are not blocked: a response needs CORS, but the
request itself still reaches them, so unauthenticated local services can be
triggered blind.

Restricted embeddings configure policy outside Wasm: exact destination/method
rules, permitted credential-header names, resource limits and any approval
requirements. Explicit destination rules reject redirects because browser Fetch
does not expose intermediate redirect destinations for validation.
Fetch always omits ambient browser credentials and referrers.
See [HTTP](http.md) for the configuration and transport contract.

## Other crossings

“One network edge” does not mean no other information crosses the boundary.

| Channel | Authority |
| --- | --- |
| Keyboard, pointer, resize and paste | Bounded user input; interpretation stays in Wasm |
| RGBA and bootstrap text | Visible local output, not HTML, links or terminal commands interpreted by the browser |
| Clipboard copy | Bounded selection text, only after a user copy gesture |
| Upload | User chooses one file; bytes only, no host name/path/handle; the picker stays closed briefly after a cancel |
| Download | One bounded copied file and checked basename, saved only by a user click; at most four waiting; no arbitrary host write |
| Named sessions | Explicit opaque filesystem deltas in browser storage, not a mounted filesystem |
| Image cache and fixed assets | Verified artifacts selected by trusted code; no arbitrary asset loader. Builds write the cache (at most 32 images, 8 GiB) and may evict other entries |
| Clocks, entropy, startup data | Inputs to the sandbox |
| Exit, abort, memory/CPU use | Availability effects |

Local inference runs in Wasm using the bounded generic GPU provider. Model
files and scheduling stay in the sandbox; downloads cross the ordinary HTTP
broker. Wasm-initiated image building is the separate `build@0` authority,
declared only by Dollyfile Studio: a reserved HTTP URL that starts an independent
Wasm worker (up to 8 GiB memory, 45 minutes) with inherited remote policy and no
local services, and writes the image cache. Without `build@0` the URL is denied;
an embedding can withhold it with `DOLLY_HOST_MODULES`. Only **Open image**
launches a result. See [Studio builds](image-build-service.md) and
`demos/local-llm/README.md`.

HTTP is not a route to these services via redirects. Remote rules cannot grant
local-service authority. Display/input, file transfer, storage and local services
must be reviewed alongside imports; counting imports alone is not a proof.

## Persistence and trust

Unsaved state dies with the tab. Saved compromise can survive in a named session,
exported session file or custom image. Delete or abandon it when trust is lost.
Sessions and exports may contain credentials and are neither encrypted nor signed.
Browser storage belongs to the origin, not the path: every site sharing an origin
(for example all of one account's `github.io` Pages sites) can read Dolly's
IndexedDB sessions and image cache. See [deployment](deployment.md).

System snapshots bind runtime, recipe, inputs and retained bytes to verified
identities. Standard workspace, temporary and Pi auth/session paths are excluded;
retention is **not a secret scanner**. Never deliberately place secrets in an
exported image path. A hash proves byte identity, not that an image is benign.

Boot and image loaders accept only their fixed/pinned artifacts. The resident
Ghostty loader links a closed map of actual kernel Wasm exports; it cannot
fetch dependencies or evaluate JavaScript. Static publication exposes verified
release files, not the checkout or browser-selected native paths.

Hosting is part of the trusted page supply chain. Injected analytics or HTML
rewriting changes the reviewed program; disable such transformations and verify
delivered bytes. See [deployment](deployment.md).

## Required checks

- Exact typed outer imports; no automatic allowance for new port requirements.
- Denied HTTP rules never reach Fetch; credentials, redirects, limits and
  cancellation remain enforceable after arbitrary guest mailbox writes.
- Span, frame, input, file-transfer and decompression bounds fail closed.
- All filesystem and process-shaped operations stay in Wasm; unsupported
  fork/socket/host operations fail without fallbacks.
- Fixed loaders cannot resolve guest-selected URLs, paths or JavaScript.
- Process failure and forced termination preserve kernel/shell state.

Worker termination and resource bounds help availability, but do not guarantee
protection from browser-wide memory pressure or engine failure. These are
testable design invariants, not a formal containment proof.
