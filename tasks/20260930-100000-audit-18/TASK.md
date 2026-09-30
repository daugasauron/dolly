# Unbounded bootstrap output and trusted-source fetch buffering

- STATUS: OPEN
- PRIORITY: 200
- TAGS: security,boundary

`dolly_bootstrap_write_bytes` / `emscripten_out/err` have no length bound: `HEAPU8.slice` can
copy up to 8 GiB (`src/dolly.c:144-148`, `src/host/runtime.mjs:53-55`) and the page decodes the
whole buffer before `buildLog` trims to 1 MiB (`src/browser.mjs:624-625`). Bootstrap/trusted
GETs skip the request quota even under a hardened policy (`src/http-policy.mjs:152-166`); on the
Cloudflare export multipart assets are buffered whole (`src/static-asset.mjs:9-24,42`).

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Every trusted buffer is bounded before copying; trusted-source reads count against quotas or
have their own explicit bound.

## Done when

- Tests submit oversized bootstrap writes and observe truncation/rejection without large copies.

## Progress (2026-10-01)

The page receives at most 1 MiB per bootstrap message
(`host/runtime/runtime.mjs`), bootstrap sources have a hardened quota and
multipart assets stream per part. The `HEAPU8.slice` in `src/dolly.c`'s
`dolly_bootstrap_write_bytes` is bounded too: its callers pass one process
write (at most `DOLLY_PROCESS_PACKET_LIMIT`, 1 MiB) or a supervisor message.
Remaining: Emscripten's `print`/`printErr` glue decodes a whole kernel string
before `runtime.mjs` trims it, and no test sends an oversized write.
