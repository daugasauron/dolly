# The browser APIs the trusted JavaScript calls are reviewed in prose only: no test fails when a module starts calling another

- STATUS: OPEN
- PRIORITY: 110
- TAGS: audit,core,boundary,test,0.1.8

From the core audit of 2026-11-16 (`work/audit-1116`, source of `b09b1e243`).

## State (2026-11-16)

Found by reading and grep; nothing changed.

## Found

AGENTS.md: "Make browser capabilities explicit and enforce their exact allowlist in tests", and
"The outer imports of the main runtime and their trusted browser implementations are the security
perimeter". Half of that is enforced: the kernel's Wasm imports must equal
`abi/dolly-browser-0.wat` and the manifests' `imports` (`test/dolly.artifacts.mjs:416-437`,
`scripts/dolly-abi.mjs validate-browser`; it passes on the released `dist/`). The other half, what
the providers behind those imports call in the browser, is only the review map's prose
(`docs/browser-boundary.md`, the Authority column). Every call matched the prose in this audit
(`work/audit-1116-evidence/core/browser-apis.txt`, a grep of `host/*/*.mjs` and `page/*.mjs`):

| Where | Browser API |
| --- | --- |
| gpu | `navigator.gpu` (`requestAdapter`, `getPreferredCanvasFormat`, `wgslLanguageFeatures`), a Worker, `transferControlToOffscreen` |
| microphone | `navigator.mediaDevices.getUserMedia`, `AudioContext`, `audioWorklet`, `AudioWorkletNode` |
| audio | `AudioContext`, `navigator.userActivation` |
| clipboard | `navigator.clipboard.writeText`, `navigator.userActivation` |
| display | `navigator.clipboard.writeText`, `OffscreenCanvas`, `transferControlToOffscreen`, `URL.createObjectURL` |
| input | `navigator.clipboard.readText`, `requestPointerLock` |
| download | `URL.createObjectURL`, an anchor's `click()` |
| upload | an `<input type="file">` the user clicks (`transport.mjs:132-141`) |
| snapshot | `navigator.storage.persist` |
| http, packages, html, build, dso, stack, threads | `fetch` (http: the broker; the others: fixed `dist/` files, the embedding's font, the page's `amy-index.txt`) |
| page | `fetch`, `navigator.storage.getDirectory`, `navigator.locks.request`, Workers, `requestFullscreen`, `URL.createObjectURL` |

No test notices a change to that table: a provider that began calling, say, `navigator.usb`,
`WebSocket` or `getUserMedia({ video: true })` would pass every suite, and only a reviewer who
reads the diff against the map would see it.

## Do

A source test beside `test/host-modules.test.mjs` that holds the table above (module directory or
`page/` to the browser globals it may call) and fails on any call of a browser global
(`navigator.*`, `fetch`, `WebSocket`, `RTCPeerConnection`, `EventSource`, `indexedDB`, `caches`,
storage, Workers, media, pointer lock, fullscreen) not in its row. The review map's Authority
column names the test; a new row in one goes with a row in the other.

## Done when

The test passes on main and fails when a provider gains a call outside its row (checked once by
adding one); `docs/browser-boundary.md` says the two are kept together.
