# Reviewing the browser boundary

Assume all Wasm memory is compromised. What can it ask the browser to do?
This is the code-reading map; [security](security.md) explains the threat model
and [HTTP](http.md) specifies the transport.

## Start with the actual imports

[abi/dolly-browser-0.wat](../abi/dolly-browser-0.wat) is the typed outer import
allowlist. The build compares it with the finished kernel; capability-report
JSON does not define it.

```text
guest spans → env.dolly_http_dispatch → browser policy → Fetch
                                                   → bounded Wasm response
```

Follow these pieces:

1. [src/dolly.c](../src/dolly.c), `dolly_http_dispatch`: forwards span
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
ordinary HTTP responses remain bounded at 64 MiB and session deltas at 512 MiB.
The Dollyfile viewer's `src/source-download.mjs` uses the same decoder after a
user clicks a large, registry-listed source link, verifying its pinned hash
before offering the original archive as a download.

Deadlines include mailbox backpressure. A guest that stops reading cannot keep
a request alive indefinitely. Atomic terminal failure cannot be erased by a late
acknowledgement. Errors expose target errno, not request contents or credentials.

The default permits arbitrary HTTP(S) and has no lifetime request quota.
Byte/time bounds remain, but this is **not an exfiltration-safe policy**.
Allowlists also do not prevent allowed destinations from relaying data.

The headless [image-build page](../src/image-build-page.mjs) consumes the same
embedding policy and registry bootstrap grants. It calls the existing
[build worker](../src/image-builder.mjs) with that restricted transport; it adds
no host imports or local services. Cancelling closes the worker and broker.

## Experimental GPU provider

[`dolly-gpu-0.wat`](../abi/dolly-gpu-0.wat) adds exactly one typed outer
`env.dolly_gpu_dispatch` import for bounded command packets. Follow
[`gpu-kernel.c`](../src/gpu-kernel.c) for process lifecycle and reply matching,
[`gpu-bridge.mjs`](../src/gpu-bridge.mjs) for the private admission handshake,
and [`gpu-worker.mjs`](../src/gpu-worker.mjs) for copied packet validation,
private handles/quotas, queue completion, and revocation. GPU buffers and
textures are explicit external device resources; CPU userspace state remains
in Wasm. Guest bytes cannot choose URLs, DOM nodes or JavaScript operations.
The main thread transfers one embedding-created canvas; normal frames reach
the compositor directly. [GPU details](gpu.md) lists the prototype limits and
its real-browser checks. Existing CPU framebuffer and network paths remain.

The fluid workload adds bounded vertex layouts (one buffer, eight attributes)
and at most sixteen buffer bindings. Structural validation precedes allocation;
WebGPU still checks shader compatibility and device limits. Optional timestamp
queries use three private 512-query sets and 24 KiB of fixed staging buffers per
scope, retired with its other resources. Presented dimensions also drive
browser pointer scaling, independently of the dormant CPU framebuffer. INFO returns limits and counters,
not browser objects. These additions introduce no further outer imports.

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
| [Sessions](sessions.md), `src/session-file.mjs` | Opaque bounded deltas; exact base for restore; custom recipe/artifact digests checked and saved HTTP restrictions intersect current policy; recovery copies only workspace/home regular files in Wasm; bounded import decompression |
| [Kernel plugin loader](../src/kernel-plugin.mjs) | WasmFS bytes only; explicit real-kernel export map, no URL/dependency fetch or JS evaluation |

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
publish atomically. Precompiled boots reuse this cache only when the payload
matches the published image digest and current inputs; missing or corrupt bytes
reload from the published artifact. [image-build.mjs](../src/image-build.mjs) resolves release
image identities and a static-source allowlist, not arbitrary checkout paths.
Unused published modules do not implicitly stage their dependencies.
Restoration and filesystem mutations remain in Wasm. Explicit save recovery
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
