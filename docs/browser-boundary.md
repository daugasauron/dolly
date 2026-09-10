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
3. `NetworkTransport.dispatch/request`: checks spans before copying
   (32 B method, 8 KiB URL, 64 KiB headers, 8 MiB body), parses request data,
   authorizes it, then invokes Fetch.
4. [src/http-policy.mjs](../src/http-policy.mjs), `DollyHttpPolicy.authorize`:
   trusted destination, method, credential-header and quota decisions.

Policy is supplied by the embedding, never Wasm. Fetch omits ambient credentials
and referrers; the browser does not inject secrets. Explicit destination rules
and bootstrap grants reject redirects. Unrestricted policy follows only on
caller request; inherited policies intersect that permission.

[src/static-asset.mjs](../src/static-asset.mjs) reassembles oversized static
downloads only for embedding-selected bootstrap URLs or pinned snapshot packs.
The manifest contains sizes and hashes, never destinations. Parts are fixed
siblings of the original URL, fetched without guest headers, credentials or
redirects, under the original deadline and byte bound. An ordinary remote
response cannot activate this path. Inherited policies must all identify the
request as a bootstrap grant; sibling URLs gain no independent guest grant.
The Dollyfile viewer's `src/source-download.mjs` uses the same decoder after a
user clicks a large, registry-listed source link, verifying its pinned hash
before offering the original archive as a download.

Deadlines include mailbox backpressure. A guest that stops reading cannot keep
a request alive indefinitely. Atomic terminal failure cannot be erased by a late
acknowledgement. Errors expose target errno, not request contents or credentials.

The default permits arbitrary HTTP(S) and has no lifetime request quota.
Byte/time bounds remain, but this is **not an exfiltration-safe policy**.
Allowlists also do not prevent allowed destinations from relaying data.

## Local services

[src/local-services.mjs](../src/local-services.mjs) is the explicit admission
table for reserved URLs. These never reach Fetch; redirects cannot enter them.

- **Models:** [local-model-service.mjs](../src/local-model-service.mjs) owns
  bounded inference, idle deadlines and cancellation.
  [local-model-contract.mjs](../src/local-model-contract.mjs) validates requests;
  [webgpu-worker.mjs](../src/webgpu-worker.mjs) loads only the selected pinned
  asset graph from `config/webgpu-assets.json`. It receives no Dolly memory or
  tool callbacks. Guest requests cannot load or select models.
- **Builds:** [image-build-service.md](image-build-service.md) identifies the
  implementation of `POST https://build.dolly.invalid/v1/builds`.
  One bounded build starts immediately in an independent Wasm worker, inheriting
  remote policy but neither local service. Cancellation/deadline terminates it.
  No request opens a tab: only the user's **Open image** click launches ENTRY.

A remote HTTP rule does not grant either local capability. Result tabs retain
inherited browser restrictions; recipe bytes cannot set browser policy.

## Other authority to inspect

| Provider / reference | What to verify |
| --- | --- |
| [Display contract](../abi/dolly-display-0.wat), [display.md](display.md) | Checked complete RGBA frames and bounded semantic input; no privileged VT/OSC/HTML parsing |
| Fullscreen handler in `src/browser.mjs` | Keyboard initiated; disabled for the ClassiCube image, which has no function-key shortcuts |
| Clipboard handlers in `src/browser.mjs` | Copy/paste only after user gestures; bounded literal text |
| Pointer-lock handlers in `src/browser.mjs` | Capture only on a trusted canvas press; Escape/lease release undo it. Graphics button/hover forwarding grants no capture; terminal selection remains left-button only |
| [Upload transport](../src/upload-transport.mjs), [C command](../src/upload.c) | Visible user picker, at most 64 MiB in 64 KiB chunks; bytes only, no host name/path/handle |
| [Download contract](download.md) | Copied bounded file and checked basename, never a host path |
| [Sessions](sessions.md), `src/session-file.mjs` | Opaque bounded deltas, exact base identity, bounded import decompression; no overwrite or execution on import |
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

[image-artifact.mjs](../src/image-artifact.mjs) binds cached bytes to runtime,
root recipe, snapshot hash and direct input digests. Descriptors and payloads
publish atomically. [image-build.mjs](../src/image-build.mjs) resolves release
image identities and a static-source allowlist, not arbitrary checkout paths.
Unused published modules do not implicitly stage their dependencies.
Restoration and filesystem mutations remain in Wasm.

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

## Recheck

```sh
node scripts/dolly-abi.mjs validate-browser build/dolly-browser-0.wasm dist/dolly.wasm
node --test test/http-broker.test.mjs
```

For provider changes, run the corresponding modes in `scripts/test-browser.sh`
against real browser imports, not only injected test providers. Review new
imports and local services as authority changes; update this map with them.
