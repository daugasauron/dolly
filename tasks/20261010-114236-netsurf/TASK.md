# NetSurf in the Wine image, fetching through Dolly's libcurl

- STATUS: OPEN
- PRIORITY: 150
- TAGS: wine,demo,netsurf

Owner (2026-10-10): "I want netsurf inside the wine image, using libcurl. This should work
without changing any contracts to the userspace right?"

Goal: NetSurf 3.11, built from its pinned release with its Windows front end against Winelib,
as a program on the Wine desktop's Start menu, fetching through the `curl` package's libcurl
(`src/libcurl-fetch.c` over the HTTP broker). No contract changes: not kernel, libc, compiler,
process contract, host modules, broker or policy, nor `src/libcurl-fetch.c`. No JavaScript engine.
Branch `demo/netsurf`, worktree `work/wine`; everything in `demos/wine/`.

Done means, in order (commit and update this file after each):

1. Libraries and Windows front end compile and link into `wine`; "NetSurf" on the Start menu
   opens its window with toolbar and address bar.
2. Renders a page from the test's fixture server: text, CSS layout, a PNG, a JPEG, a clicked
   link, back/forward; the browser test reads pixels and the server's request log.
3. Default start page on the release's own origin; a CORS-refused address and `http://` from
   `https://` end in NetSurf's error page with a message that says so.
4. Measured: image size before/after, build time, time to first render, page memory.

## Findings before any build (read from source, 2026-10-10)

Pin: `netsurf-all-3.11.tar.gz`, sha256 `4dea880ff3c2f698bfd62c982b259340f9abcd7f67e6c8eb2b32c61f71644b7b`
(https://download.netsurf-browser.org/netsurf/releases/source-full/).

**libcurl.** NetSurf's `content/fetchers/curl.c` uses only the multi calls the shim has
(`curl_multi_perform`, `_info_read`, `_fdset`, `_setopt`, add/remove); no socket-action calls.
What does not fit as it is:

- NetSurf treats every refused `curl_easy_setopt` as fatal, and the shim refuses (rightly) what
  the browser owns: `LOW_SPEED_LIMIT/TIME`, `CONNECTTIMEOUT`, `NOSIGNAL`, `HTTP_VERSION` 1.1,
  `SSL_SESSIONID_CACHE`, `PROXY` (even `NULL`), `COOKIE` (even `NULL`), `CAINFO`, cipher lists,
  `XFERINFOFUNCTION`, `MIMEPOST`; and of the multi options `MAXCONNECTS`, `MAX_TOTAL_CONNECTIONS`.
- No `curl_mime_*`/`curl_formadd`: multipart form posts cannot be sent and must fail explicitly.
- `curl_getdate` (utils/time.c under `WITH_CURL`): compile that file without `WITH_CURL`.
- Redirects: the broker fetches with `redirect: "error"` unless the caller asks to follow and the
  policy rule allows it, so NetSurf's own redirect handling (it wants the 3xx and `Location`)
  never sees one. NetSurf must ask libcurl to follow and learn the final URL from
  `CURLINFO_EFFECTIVE_URL`.
- The shim advances a transfer by one record (a header line, or up to 64 KiB of body) per
  `curl_multi_perform`, and NetSurf polls every 100 ms: perform must be repeated while
  `curl_multi_timeout` answers 0.
- A CORS refusal reaches NetSurf as libcurl's error text ("Browser could not fetch the URL:
  blocked (no CORS headers, or a redirect)…"), which its error page shows.

Plan: NetSurf's `curl.c` compiled unchanged with a prefix header of ours that states, option by
option, which refusals NetSurf can live with; a patch only where behaviour must change
(multipart refusal, redirects).

**Front end.** `win32_run` is a `PeekMessage`/`GetMessage` loop around NetSurf's scheduler, woken
by `SetTimer(NULL, …)`; fetches are polled from the scheduler. One thread, no `select`: it fits a
program that is a thread of the desktop. Controls: toolbar, status bar, animation, image lists
(comctl32, linked); `ChooseFont` (comdlg32), `SHGetFolderPath` (shell32), `PathAppend` (shlwapi),
`AlphaBlend` (msimg32, not linked: Wine's is a forward to gdi32's `GdiAlphaBlend`). Its CSS,
welcome page and messages are resources of type `USER` in its `.rc`, read with `FindResource(NULL…)`.

**Generated sources** (host, at staging): perl for libparserutils' aliases, libhubbub's entities,
NetSurf's Messages and testament; gperf for libhubbub's element table (not on the host: build a
pinned gperf as flex is); libcss's `gen_parser` (C) for its property parsers. Skipped: nsgenbind
and duktape (no JavaScript), libnslog (optional), libsvgtiny, librosprite, libnsfb.

**Images.** PNG through the image's libpng; GIF and BMP through libnsgif and libnsbmp; JPEG needs
IJG libjpeg, already pinned for Xonotic (`DOLLY_JPEG_*`), built here the same way.

**Linking.** NetSurf and its libraries become one program module (`programs/netsurf`), so its
static data is restored between runs as for the other programs; names it shares with Wine get
its prefix through `shared-names.txt`.
