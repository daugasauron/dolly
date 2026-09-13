# Keep incomplete downloads out of source caches and share verification

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: audit,bug,build,cleanup

## Evidence

The TypeScript fetcher writes curl output directly to the cache. An interrupted
transfer leaves a file, so later runs skip downloading and only fail its checksum.
A real local HTTP server reproduced statuses 18 then 1 with only one request;
the cached archive still contained `partial` after the second run. Most other
source fetchers repeat temporary-download/checksum/rename logic with differing
corrupt-cache behavior.

## Done when

- Share the download/checksum/publication path while preserving all pinned URLs, hashes and existing cache filenames.
- Failed or mismatched downloads never publish partial artifacts; a subsequent retry can succeed.
- Repair a corrupt cached download only with verified replacement bytes, preserving it if replacement fails and never writing through a symlink.
- Exercise actual HTTP transfers, warm reuse and failure/recovery without fake curl implementations.
- Verify ordinary image preparation retains source bytes and reuses its artifacts.

## Result

A single `fetch-verified-file.sh` now handles verified warm reuse, interrupted
transfers, checksum failures and atomic publication for the archive/header/font
fetchers and the Bison bootstrap. Existing cache filenames and source pins are
unchanged. Replacing the duplicate paths removes 116 implementation lines.

The original real-HTTP reproduction now reports statuses **18 then 0**, two
requests, and the complete cached archive. The regression also proves unchanged
warm mtimes/no extra request, failed replacement retaining old cache bytes,
verified replacement of a symlink without modifying its target, temporary cleanup
and refusal of a directory destination. It takes about 54 ms, using actual curl.

Official default/Pi builds took **4.4 s / 5.1 s**, reused all 9/13 image artifacts,
and retained all 123 recorded staged source hashes. Cached font, Zig source and
Bison preparation passed; native Zig stage-zero download/extraction also passed
with its pinned checksum. All 286 source checks passed in 3.16 s, and all 28
applicable artifact checks passed in 3.79 s (one optional artifact unavailable).
The 20-image catalog was restored. Runtime and image bytes did not change, so the
Chrome/Firefox core results from issue 28 still apply to the same runtime.
