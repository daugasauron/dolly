# libcurl adapter misreports redirects and accepted-but-stripped options

- STATUS: CLOSED
- PRIORITY: 190
- TAGS: bug,compatibility,core

`src/libcurl-fetch.c:693`: a redirect without FOLLOWLOCATION becomes `CURLE_COULDNT_CONNECT`.
`CURLOPT_USERAGENT` and `ACCEPT_ENCODING` return OK but the broker strips both headers.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Redirect responses are returned as responses; unsupported options fail explicitly.

## Done when

- Browser curl check: `curl -sI` on a redirecting fixture prints the 3xx status.

## Resolution (2026-09-30)

USERAGENT and ACCEPT_ENCODING are accepted and ignored by design (docs/http.md: request metadata, not authority over browser-owned headers; CMake depends on it). A redirect without FOLLOWLOCATION cannot expose the 3xx response in a browser; documented. Relative URLs now fail in libcurl (fix/kernel2, 69dcf81).
