# HTTP policy pathPrefix matches by plain string prefix

- STATUS: CLOSED
- PRIORITY: 220
- TAGS: security,boundary,bug

`src/http-policy.mjs:173-174` uses `startsWith`, so `/v1` also admits `/v1-admin` and
`/v1%2F..%2Fadmin`. The protocol check at `:179-181` is unreachable (the broker rejects non-HTTP
first).

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Prefixes match whole path segments of the normalized path; encoded separators are rejected.

## Done when

- `test/http-policy.test.mjs` covers `/v1-admin` and encoded traversal as denied.

## Resolution (2026-10-01)

Fixed: prefixes match whole path segments and encoded separators are rejected
([`host/http/policy.mjs`](../../host/http/policy.mjs)). Verified by
`test/http-policy.test.mjs` "path prefixes match whole segments and reject encoded
separators", passing on `core/host-modules` (256 source tests).
