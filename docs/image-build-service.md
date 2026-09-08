# Building from Studio

Run `dollyfile-build /workspace/Dollyfile` in Studio, including through
Pi's shell tool. Building starts immediately, without an approval prompt. Logs
stream back to the caller; compile or builder failures give a nonzero command
exit. Correct the recipe and submit it again. The current Studio filesystem,
credentials and session stay separate from the new build.

After success, click **Open image** to launch the result in a new tab. This
click is the only approval: no tab is reserved during compilation, and a build
cannot open one automatically. Popup blocking can be retried with another click.

The completed image is bound to the runtime, exact root recipe, direct input
digests and snapshot hash in the existing browser image cache. `/custom/run/`
receives that identity through tab-local storage, checks the complete bytes and
restores them in Wasm; it does not rebuild them. The URL alone is not a portable
image link. Retain/export the recipe: browser cache eviction or replacement can
require rebuilding, and custom images do not yet support named-session saves.

## HTTP contract

There is no new Wasm import or native build server. The existing
`env.dolly_http_dispatch` broker routes one browser-local request:
`POST https://build.dolly.invalid/v1/builds` with a literal UTF-8 Dollyfile body.
It starts a build and returns its event stream. There is no HTTP opening endpoint.

No queries, credentials, alternate origins, redirects or other methods are
accepted. Local admission is independent of the remote HTTP allowlist; all
request headers are removed. Builders use the same remote policy as their
parent, but have no local-service access, file picker or display. Their ENTRY
never runs; only a user-opened result runs its ENTRY. Closing the caller page,
cancelling the HTTP request, Ctrl+C, or **Cancel** stops the disposable build.

A result tab inherits the parent's browser-side policy and intersects it with
the new page's policy. Either may deny a destination or strip a credential;
the smaller byte/time limits apply. User-approved result tabs start fresh
per-tab request counters with the same configured quotas. Policy comes from
trusted browser state, not recipe/snapshot contents, and missing inheritance
fails closed. Reopening a build cannot silently restore unrestricted HTTP.

One request may run per page; cancellation retains that lease until work stops.
Limits are 128 KiB of recipe text, 8 MiB of encoded response and 45 minutes. Missing image
dependencies build sequentially. The bounded stream also limits queued output
when a caller does not consume it. A periodic progress event keeps quiet builds
observable; it does not extend the absolute deadline.

Responses use `application/x-ndjson`, one JSON object per line:

```text
{"type":"status","text":"Building example in a separate sandbox…"}
{"type":"log","text":"compiler output\n"}
{"type":"progress","state":"building"}
{"type":"result","image":"example","sha256":"…"}
```

HTTP 400 rejects an invalid recipe before execution; 409 reports a busy builder.
Once streaming starts, HTTP status is already 200: a terminal
`{"type":"error","message":"…"}` means failure. Only a terminal `result`
followed by a complete stream means success. EOF without a result is failure.
Build results are opaque retained files, not permission to execute host code.

Review the short admission table in [local-services.mjs](../src/local-services.mjs),
the lease/stream in [image-build-service.mjs](../src/image-build-service.mjs), and
the disposable worker in [image-builder.mjs](../src/image-builder.mjs).
The authoritative recipe executor remains the C program inside Wasm.
