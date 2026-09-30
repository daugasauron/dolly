# Default HTTP policy allows same-origin reads and resolves relative URLs

- STATUS: CLOSED
- PRIORITY: 260
- TAGS: security,boundary

`src/http-broker.mjs:35,198` resolves request URLs against `location.href`, so under the default
policy Wasm reads any same-origin path (bypassing CORS, with all response headers) and can send
blind requests to loopback/LAN hosts. The GitHub Pages deployment
(`daugasauron.github.io/dolly/`) shares its origin with every Pages site of the account, which
can read Dolly's IndexedDB sessions (credentials) or register a service worker at `/`.
`docs/deployment.md` and the review map do not mention this.

## Evidence

Established: CONFIRMED BY READING. Verified `new URL(url, this.broker.baseURL)` at
`src/http-broker.mjs:198`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Programs must supply absolute http(s) URLs; same-origin requests are denied except the trusted
bootstrap source list; the shared-origin risk is documented.

## Done when

- Browser check: `curl -fsS /index.html` and `curl -fsS <page-origin>/...` from the default
  image fail; SOURCE HOST rebuilds still fetch their pinned same-origin inputs.

## Resolution (2026-09-30)

By design. The default HTTP policy has no restrictions, the page origin included; DOLLY_HTTP_POLICY restricts it (owner, 2026-09-30; eecab3d). The build bridge the audit worried about is separate and now requires build@0.
