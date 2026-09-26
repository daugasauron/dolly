# Reviewing the browser boundary

Assume all Wasm memory is compromised. What can it ask the browser to do?
This is the code-reading map; [security](security.md) explains the threat model
and [HTTP](http.md) specifies the transport.

## Start with the actual imports

[abi/dolly-browser-0.wat](../abi/dolly-browser-0.wat) is the typed outer import
allowlist. The build compares it with the finished kernel; capability-report
JSON does not define it.

The fixed registry in [src/host/modules.mjs](../src/host/modules.mjs) assigns
every outer import to exactly one provider. Each public `src/host/NAME.mjs`
pairs with `include/dolly/NAME.h` and its typed WAT contract. Providers own their
handshake, mailbox/message handlers and resource cleanup; the registry handles
dependencies and lifecycle. Kernel imports for disabled providers receive
denial functions. No image can select a JavaScript source or Worker URL.

`DOLLY 4` host requirements are compatibility demands, not grants. The embedding
selects providers separately; HTTP policy still authorizes every request. Image
requirements propagate through FROM and USE, not COPY, and are checked before
ENTRY. Artifact requirements are derived from digest-checked retained recipes.
Commands and DSOs can also carry the `dolly.host` records specified in
[abi/dolly-host-0.wat](../abi/dolly-host-0.wat); these check ABI compatibility at load time. A disabled provider still has its
typed denial binding; image declarations demand actual availability. Removing or forging records never enables a denied host provider. A headless
builder supplies runtime and HTTP independently of the image it is compiling.

```text
guest spans → env.dolly_http_dispatch → browser policy → Fetch
                                                   → bounded Wasm response
```

Follow these pieces:

1. [src/host/http.mjs](../src/host/http.mjs), `env.dolly_http_dispatch`: forwards span
   descriptors and shared memory, without scanning or copying guest strings.
2. [src/http-broker.mjs](../src/http-broker.mjs), `createHttpAdmission`:
   one private acknowledgement prevents an unbounded dispatch-message queue.
3. `NetworkTransport.dispatch`: checks spans before copying
   (32 B method, 8 KiB URL, 64 KiB headers, 8 MiB body). `HttpTransfer.run`
   parses the copy, calls the policy, then invokes the admitted provider.
4. [src/http-policy.mjs](../src/http-policy.mjs), `DollyHttpPolicy.authorize`:
   trusted destination, method, credential-header and quota decisions.

Policy is supplied by the embedding, never Wasm. Fetch omits ambient credentials
and referrers; the browser does not inject secrets. Explicit destination rules
and bootstrap grants reject redirects. Unrestricted policy follows only on
caller request; inherited policies intersect that permission.

One import does not mean one active request. The broker owns a fixed 16-slot
provider table, independent of the guest's claimed free slots. Each transfer has
its own Wasm response buffer, generation, deadline and abort controller. All
transfers share authorization and quota. Cancelling an exact handle acknowledges
immediately but retains its host slot until the provider settles. Forged slot
state and repeated cancellation therefore cannot grow an unbounded host queue.

[src/static-asset.mjs](../src/static-asset.mjs) reassembles oversized static
downloads only for embedding-selected bootstrap URLs or pinned snapshot packs.
The manifest contains sizes and hashes, never destinations. Parts are fixed
siblings of the original URL, fetched without guest headers, credentials or
redirects, under the original deadline and byte bound. An ordinary remote
response cannot activate this path. Inherited policies must all identify the
request as a bootstrap grant; sibling URLs gain no independent guest grant.
Image snapshots and static multipart assets are bounded at 1 GiB to accommodate
the bundled 580 MB model. The decoder also enforces the caller's byte limit;
ordinary HTTP responses have no default total byte ceiling. Explicit finite
response quotas still apply, including inherited restrictions and exact source
bounds. Delivery remains in bounded mailbox chunks with backpressure and checked
byte counts. Session deltas remain bounded at 512 MiB.
The Dollyfile viewer's `src/source-download.mjs` uses the same decoder after a
user clicks a large, registry-listed source link, verifying its pinned hash
before offering the original archive as a download.

Deadlines include mailbox backpressure. A guest that stops reading cannot keep
a request alive indefinitely. Atomic terminal failure cannot be erased by a late
acknowledgement. Errors expose target errno, not request contents or credentials.

The default permits arbitrary HTTP(S) and has no lifetime request quota.
Request-byte bounds and deadlines remain, but this is **not an exfiltration-safe policy**.
Allowlists also do not prevent allowed destinations from relaying data.

The headless [image-build page](../src/image-build-page.mjs) consumes the same
embedding policy and registry bootstrap grants. It calls the existing
[build worker](../src/image-builder.mjs) with that restricted transport; it adds
no host imports or local services. Cancelling closes the worker and broker.

## Thread provider

[`threads.mjs`](../src/host/threads.mjs) owns the optional `threads@0` Worker
budget: at most 16 Workers per threaded process and 64 across the provider.
It instantiates only the already admitted executable with that process's memory;
guest packets select neither code nor Worker URLs. The two process imports and
the outer browser import allowlist are unchanged. The separately stamped
[`dolly-threads-0.wat`](../abi/dolly-threads-0.wat) fixes the child entry and
packet operations; its internal supervisor exports have their own typed contract.

[`process-supervisor.mjs`](../src/process-supervisor.mjs) binds each Worker context
to PID/TID and an independent syscall acknowledgement. Thread IDs, join results,
files, environments and per-thread HTTP staging remain in kernel Wasm. HTTP
requests retain process-wide ownership and the existing broker policy/quotas.
`process-worker.mjs` rejects DSO/FFI operations in the static thread profile.
Normal thread completion unwinds Wasm before the trusted wrapper reports it;
that wrapper never re-enters guest code. Only then can WAIT make its stack
reclaimable. A trap or process exit terminates all the process's Workers.
Kernel-queued signals go to the oldest live thread; a blocked receiver is woken,
and unhandled terminating signals retain the existing process termination timer.

## Experimental GPU provider

[`dolly-gpu-0.wat`](../abi/dolly-gpu-0.wat) adds exactly one typed outer
`env.dolly_gpu_dispatch` import for bounded command packets. Follow
[`gpu-kernel.c`](../src/gpu-kernel.c) for process lifecycle and reply matching,
[`gpu-bridge.mjs`](../src/gpu-bridge.mjs) for the private admission handshake,
and [`gpu-worker.mjs`](../src/gpu-worker.mjs) for copied packet validation,
private handles/quotas, queue completion, and revocation. GPU buffers and
textures are explicit external device resources; CPU userspace state remains
in Wasm. Guest bytes cannot choose URLs, DOM nodes or JavaScript operations.
Provider startup waits for its Worker to acknowledge configuration before guest
calls can synchronously submit packets. The Worker receives the shared Wasm
memory and refreshes its buffer after growth. The main thread may transfer one
embedding-created canvas; compute needs none. Normal frames reach the compositor
directly. [GPU details](gpu.md) lists the prototype limits and
its real-browser checks. Existing CPU framebuffer and network paths remain.

The fluid workload adds bounded vertex layouts (one buffer, eight attributes)
and at most sixteen buffer bindings. Structural validation precedes allocation;
WebGPU still checks shader compatibility and device limits. Batch completion
awaits both device error scopes before replying; out-of-memory errors retain
priority over validation errors. Optional timestamp
queries use three private 512-query sets and 24 KiB of fixed staging buffers per
scope, retired with its other resources. Presented dimensions also drive
browser pointer scaling, independently of the dormant CPU framebuffer. INFO returns limits and counters,
not browser objects. These additions introduce no further outer imports.

CAPTURE_FRAME copies a rectangle from the calling scope's current batch render
texture to its own buffer. It requires the exclusive surface lease, an earlier
render in that batch, in-bounds coordinates and sufficient writable buffer space.
It cannot capture another scope, canvas, DOM content or browser chrome. Mapping
and chunked readback use the existing buffer operations and quotas.

CAPABILITIES returns a fixed typed feature/limit record. Compute pipelines may
carry at most sixteen named finite numeric specialization constants. Limits are
clamped to the device: at most 4,096 objects, 1 GiB per buffer and 4 GiB aggregate
buffer allocations across the provider. The browser owns these bounds; guest declarations
cannot raise them. Optional f16/subgroup features change shader validation only.

Local llama.cpp inference runs inside an ordinary private process. Its C adapter
uses this same generic provider; optional model downloads use the remote HTTP broker.
There is no browser model loader, inference service, URL allowlist exception or
model-specific outer import. See [local models](browser-local-models.md).

## Local services

[src/local-services.mjs](../src/local-services.mjs) is the explicit admission
table for reserved URLs. These never reach Fetch; redirects cannot enter them.

- **Builds:** [image-build-service.md](image-build-service.md) identifies the
  implementation of `POST https://build.dolly.invalid/v1/builds`.
  One bounded build starts immediately in an independent Wasm worker, inheriting
  remote policy but no local services. Cancellation/deadline terminates it.
  No request opens a tab: only the user's **Open image** click launches ENTRY.

A remote HTTP rule does not grant the local build capability. Result tabs retain
inherited browser restrictions; recipe bytes cannot set browser policy.

## Other authority to inspect

| Provider / reference | What to verify |
| --- | --- |
| [Display contract](../abi/dolly-display-0.wat), [display.md](display.md) | Checked complete RGBA frames and bounded semantic input; no privileged VT/OSC/HTML parsing |
| Fullscreen handler in `src/browser.mjs` | Keyboard initiated; F11 toggles fullscreen for every image, including while a dialog is open |
| Clipboard handlers in `src/browser.mjs` | Gesture-only copy; native paste into Dolly's keyboard or game canvas/body only. Bounded literal text becomes graphics text input or terminal paste; other browser fields retain native paste |
| Pointer-lock handlers in `src/browser.mjs` | Capture only on a trusted canvas press; Escape/lease release undo it. Graphics button/hover forwarding grants no capture; terminal selection remains left-button only |
| [Upload transport](../src/upload-transport.mjs), [C command](../src/upload.c) | Visible user picker, at most 64 MiB in 64 KiB chunks; bytes only, no host name/path/handle |
| [Download contract](download.md) | Copied bounded file and checked basename, never a host path |
| [Sessions](sessions.md), `src/session-file.mjs`, `src/session-transport.mjs`, Save dialog in `src/browser.mjs` | User-selected checkpoint names; opaque bounded deltas streamed into compression through copied chunks before acknowledgement; exact base for restore; custom recipe/artifact digests checked and saved HTTP restrictions intersect current policy; recovery copies only workspace/home regular files in Wasm; bounded import decompression |
| [Kernel plugin loader](../src/kernel-plugin.mjs) | WasmFS bytes only; explicit real-kernel export map, no URL/dependency fetch or JS evaluation |
| [Process supervisor](../src/process-supervisor.mjs), [typed contract](../abi/dolly-supervisor-0.wat) | Short deferred waits use a kernel-provided timer hint; every wakeup retries the validated syscall in Wasm. Signals, completion and retirement cancel pending wakeups |

The Wasm kernel owns upload destination and temporary files and refuses
overwrite. Rebuild-only workers have no picker. Uploaded bytes become ordinary
sandbox data and may leave through allowed HTTP, like pasted text.
Exported sessions may include credentials; they are unencrypted.

## Boot, storage and code loading

`src/runtime-worker.mjs` accepts only fixed kernel/seed artifact names.
Root rebuilds without a base load the seed; prebuilt and derived boots do not.
`/etc/dolly/host.base` records a public asset URL, not new authority:
reading it with curl still crosses the broker.

[image-artifact.mjs](../src/image-artifact.mjs) binds cached bytes to seed/image ABI identity,
root recipe, snapshot hash and direct input digests. Descriptors and payloads
publish atomically. Payloads use opaque Blobs; older ArrayBuffer payloads still
load and receive the same size, recipe and digest checks. Precompiled boots reuse
this cache only when the payload matches the published image digest and current
inputs; missing or corrupt bytes
reload from the published artifact. [image-build.mjs](../src/image-build.mjs) resolves release
image identities and a static-source allowlist, not arbitrary checkout paths.
Unused published modules do not implicitly stage their dependencies.
Restoration and filesystem mutations remain in Wasm. Boot detaches consumed
image/session input buffers after copying them into Wasm; reusable build inputs
are transferred back to their caller. Explicit save recovery
stages one bounded opaque delta and runs `/usr/bin/session-recover` in a fresh
`system` image. It copies into a new folder; the browser does not parse file records
or apply old startup files, and the original IndexedDB record is unchanged.

Ordinary processes import only private memory and a typed Wasm gate.
`src/process-abi.mjs` validates the contract before execution.
`src/process-worker.mjs` loads process-local DSOs with typed symbol checks;
it receives no Fetch, filesystem or JavaScript-evaluation adapter.
Side-module data exports are offsets from their allocated memory base;
`dlsym` and `GOT.mem` expose the corresponding absolute process addresses.
Internal validation is defense in depth, not the host trust boundary.

The local server serves manifest-listed, verified releases, not source or loose
build files. HTML pins immutable assets; shared packs are resolved by verified
digest. Documentation publishing has an explicit source allowlist.
The [static exporter](deployment.md) preserves this layout.
Neither a custom recipe nor a test query can turn the server into a shell.

The optional development-only Codex relay (`scripts/codex-relay.mjs`) is a
separate HTTP destination, not a browser import or shipped local service. It
binds loopback, checks exact Host/Origin and a random bearer capability, bounds
requests, and forwards only the fixed Codex inference endpoint without redirects.
Only this relay reads the local subscription login; it exposes no filesystem or
process operations. Granting its capability permits spending that account's quota.

ClassiCube's shared room (`src/classicube/agent/room.mjs`) and clients exchange
Classic packets through private files in the Wasm filesystem. The socket wrapper
in `src/classicube/platform.c` recognizes only its local room marker and has no
host socket fallback. Map compression, world state and all game processes stay
inside Dolly. Multiple players add no browser authority or outer imports.

## Recheck

```sh
node scripts/dolly-abi.mjs validate-browser build/dolly-browser-0.wasm dist/dolly.wasm
node --test test/http-broker.test.mjs
```

For provider changes, run the corresponding modes in `scripts/test-browser.sh`
against real browser imports, not only injected test providers. Review new
imports and local services as authority changes; update this map with them.
