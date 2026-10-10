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

## Log

### 2026-10-10, steps 1 and 2: NetSurf on the Start menu, rendering fetched pages

Measured in Chrome (`node demos/wine/test/wine-browser.mjs`, passes in 26.9 s; the NetSurf part is a
second session of the same test, with an HTTP policy of one rule: `GET` under `/fixture/netsurf/` of
the test's own server):

- Start menu > NetSurf opens its window: menu bar, toolbar, address bar, status bar, and its welcome
  page from the program's resources (`build/wine-evidence/netsurf-welcome.png`).
- The fixture URL typed into the address bar: NetSurf's own `content/fetchers/curl.c` fetches the
  page, its external style sheet, a PNG and a JPEG through `curl_multi_perform` of the `curl`
  package's libcurl. Read from the frame: the two floated boxes of the style sheet at exactly
  200 by 60 pixels side by side; the PNG's 9,600 pixels in its exact colour; the JPEG's within 12
  of its colour. The server's log holds exactly those four `GET`s.
- A click on the link fetches and draws the second page; the toolbar's Back and Forward redraw each.
- First render 209 ms after Enter (page, style sheet and two images from a local server).
- Images: `wine` 175,994,122 bytes before, 178,869,903 after; `wine-build` and `wine` build in
  187.5 s (160.6 s before). The build compiles 790 more files.

How it is built (all in `demos/wine/`):

- `prepare-netsurf.sh` unpacks the pinned release, applies `netsurf-dolly.patch`, and generates on
  the host what NetSurf's makefiles generate: libparserutils' aliases and libhubbub's entities
  (perl), libhubbub's element table (the pinned gperf, `build-gperf.sh`), libcss's 119 property
  parsers (its own `gen_parser`, compiled with the host's cc), the Windows front end's five
  message files (perl), and a fixed `testament.h` without the host's user, name and date. Staged in
  `dist/static/wine/source.tar.gz` with IJG libjpeg 9f (Xonotic's pin).
- `programs/netsurf/Makefile.in` builds ten libraries, NetSurf's core, the Windows front end and
  26 libjpeg units as one Wine program module with the defines of NetSurf's own build system. No
  library needed a patch. No name clashed with Wine's.
- `programs/netsurf/curl-dolly.h` is included before NetSurf's unchanged option code: it names the
  refusals of Dolly's libcurl that NetSurf can live with (connection timing and tuning, HTTP/1.1
  preference, TLS session cache, proxy/cookie/multipart when turned off, two connection-pool
  sizes), selects the libcurl API level whose progress callback Dolly's libcurl calls, and repeats
  `curl_multi_perform` while `curl_multi_timeout` answers 0.
- `netsurf-dolly.patch` (9 files, 214 lines): in the front end, five dialog procedures return
  `INT_PTR` (as `BOOL` they have another WebAssembly type than Wine calls); four wide strings
  become 16-bit (`cc` has no `-fshort-wchar`); `<io.h>` is not included; its own `realpath` is left
  to the C library; `main`'s arguments replace `CommandLineToArgvW` (this Wine's shell32 forwards
  it to shcore, which is not linked; linking shcore meant 275 names shared with shlwapi); the
  configuration directory is `C:\NetSurf` and no download directory is preset, because shell32's
  folder lookup needs ole32 at every turn. In the fetcher, a multipart post fails with
  `CURLE_NOT_BUILT_IN`.
- The desktop labels it "NetSurf" with S as its key (N is Notepad's).


### 2026-10-10, step 3: the error page works; a start page on the site's own origin does not

- **Refused by CORS** (measured in Chrome, in the same test): a second server on another port
  answers without CORS headers and the policy admits it. Its address typed into NetSurf: one
  request reaches that server, and NetSurf shows its own error page, window title "Error occurred
  fetching page - NetSurf" (read from the desktop's window list), with the text "An error occurred
  when connecting to 127.0.0.1" and libcurl's message "Browser could not fetch the URL: blocked (no
  CORS headers, or a redirect) or unreachable (DNS, TLS, offline)" (`build/wine-evidence/
  netsurf-refused.png`; the text is seen, not asserted). No hang, no crash; Back and Try Again are
  offered.
- **`http:` from an `https:` page**: not measurable here, every local page is `http:`. Read from
  `host/http/broker.mjs` and `http.h`: a rejected `fetch` of any cause is the one error above, so
  it takes the same path.
- **Redirects** (read, not measured): the broker fetches with `redirect: "error"` unless the caller
  asks to follow, and NetSurf follows redirects itself, so a redirected address ends in the same
  error page. Asking libcurl to follow would load the page under the address typed, with relative
  links resolved against the wrong one, unless NetSurf is also told the final address
  (`CURLINFO_EFFECTIVE_URL`); not done.
- **Default start page on the release's own origin: blocked, stopped here.** NetSurf opens absolute
  URLs only, and a program cannot learn the page's origin: the broker takes `/vVERSION/FILE` as a
  file of the site serving the release, but publishes as the effective URL "the URL it asked for"
  (`broker.mjs`, "where the site is served is the page's business"; read, not measured: my one
  attempt asked for `/licences/`, which is no versioned path and failed). The home page therefore stays
  NetSurf's own welcome page (from its resources, always there), whose links are other origins.
  Two ways on, both the owner's call:
  1. a `site:` scheme inside NetSurf (`site:/v0.1.1/licences/index.html`), registered with its curl
     fetcher and passed to libcurl as the path: no contract changes, about 15 patched lines, but
     which HTML page a deployed release has under `/vVERSION/` I could not establish from here
     (the local server serves `licences/index.html`; the versioned docs do not answer), and the
     version in the address must follow the release;
  2. the public origin as an absolute address, which is the same origin only on that site.

### 2026-10-10, step 4: measurements (Chrome, this machine, other builds running)

| | before | with NetSurf |
|---|---|---|
| `wine` snapshot | 175,994,122 bytes | 178,869,903 bytes |
| `wine-build` and `wine` built | 160.6 s | 187.5 s |
| browser test | 19.5 s | 29.5 s |
| renderer process, desktop only | 570 MiB resident | |
| renderer process, NetSurf on its welcome page | | 595 MiB resident |

Firefox, the same test run once: passes in 31.2 s, first render 211 ms.

First render of the fixture page (page, style sheet, PNG, JPEG from a local server): 209 to 211 ms
after Enter in three runs. A full build in the development session, Wine and NetSurf from
nothing at `-j4`: 136.8 s; NetSurf's 790 files alone about 60 s.

### Contracts

None changed: no file outside `demos/wine/`, `config/source-pins.sh`, `config/upstreams.json` and
`demos/README.md` is touched. `src/libcurl-fetch.c` is as released. The image already declared
`REQUIRES HOST http@0`. One licence fact for the owner: NetSurf is GPL-2.0-only and is linked into
`/usr/bin/wine`, which as a whole is thereby under GPL-2 (Wine LGPL-2.1+, FreeType under its GPL
option, libpng, IJG libjpeg and the MIT parts are compatible).

Paint's text tool (`tasks/20261010-112539-paint-text`) did not fall out of this work and is untouched.
