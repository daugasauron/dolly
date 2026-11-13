# A folder a server holds, mounted in Dolly over the HTTP broker

- STATUS: CLOSED
- PRIORITY: 380
- TAGS: http,filesystem,packages,0.1.6,owner

## Closed (2026-11-13, `feature/http-mount`)

The package is `rclone` ([`demos/rclone`](../../demos/rclone/README.md)): rclone 1.76.0 built by
the `go` package with its local and WebDAV backends; `rclone bisync` keeps a session folder in
step with a folder upstream's `rclone serve webdav` serves on the machine. The README has the
server's command, the session's commands (a loop in the background keeps the folders in step) and
the policy rule; `man rclone` in the session has the first two. Commits `24f72dceb` (Go's request
body), `ef0cb8a42` (the package), `79b3e372a`.

- Built in the domain catalog's round in the 9 GB slot with `DOLLY_IMAGE_JOBS=1`: two builds side
  by side (rclone on go-build, and pi-dolly) crashed their renderers at the 6 GB cap. `go build`
  of rclone in Dolly took under a minute; the package is a 40.6 MB snapshot, its executable
  40.4 MB. The staged tar and the Go seed are the same bytes from a second checkout at another
  path (edc7653d…, 88296c30…).
- `demos/rclone/test/rclone-browser.mjs` (`npm run test:demos -- rclone`) passes in Chrome
  156.0.8078.47 and Firefox 155.0, 4 to 8 s each, four runs: upstream's linux/amd64 rclone serves
  a folder on a loopback port with the README's flags; `default` runs `amy install rclone` and
  `man rclone` under a policy of the README's rule and amy's index alone; bisync carries what each
  side wrote, changed and removed, a 16 MiB file and a new directory among them, and both sides
  list the same modification times; the README's loop brings a file of each side to the other.
- Measured in Chrome: a bisync without changes over three directories is three `PROPFIND`s, about
  0.1 s; the browser caches the preflights. The Go demo test passes in both browsers on the
  rebuilt seed (58 s, 53 s); `npm run test:source` passes.
- A page whose address the browser takes for a public one (`--ip-address-space-overrides` in
  Chrome, `network.lna.address_space.public.override` in Firefox) reaches the loopback server
  only with the local network access permission: Chrome 156 fails the `PROPFIND` (it answers 207
  once the permission is granted), Firefox 155 holds it past 20 s. So on the public site the user
  allows the browser's prompt first; the README says so.

Owner (2026-11-13): "I want to compile and provide some package that can "mount" a filesystem over
the dolly http broker through a server. I did some research and there seems to be available
packages that syncs a file system over http. The idea is that some server hosts a filesystem
folder (for example this machine) and then it can be mounted in dolly." With 0.1.6.

## Constraints

- All traffic goes through `env.dolly_http_dispatch` and its policy (`docs/http.md`): the folder's
  server is an origin an embedding's rule admits, with the methods and headers the protocol needs.
  No socket, WebSocket or path around the broker (`AGENTS.md`).
- Dolly has no FUSE: "mount" means a directory of the shared filesystem that a program keeps in
  step with the server (fetch, then send changes back), or a library a program links.
- Built from upstream source inside Dolly, as a package `amy install` gives; the server side is an
  ordinary program the user runs on their machine, with what a browser needs from it (CORS).

## Do

Survey what exists (WebDAV and HTTP sync tools, for example rclone's WebDAV remote and bisync, or a
WebDAV client in C), pick the one that builds with Dolly's toolchains and needs no more than the
broker gives, package it, and document the server side to run on this machine.

## Done when

From `default` in Chrome and Firefox: `amy install` the package, point it at a folder this machine
serves (the documented command), and files written on either side appear on the other; a browser
test with a local server; the policy rule it needs is in its documentation.

## Survey (2026-11-13)

What the broker gives: any method token (`PROPFIND` included), a body to 64 MiB, the response's
status, headers and body; under a policy, the headers its rule names. What it cannot give: a
socket, a listening port, FUSE, a server push. So the candidate is a client that keeps state
between runs and syncs over plain HTTP, built from a language whose HTTP already reaches the
broker: C through libcurl, Go through `net/http`.

- **rclone** (Go, MIT): a WebDAV backend, `sync`/`copy` one way and `bisync` both ways, with
  listings kept between runs, deletions, conflicts and recovery after an interrupted run. Its own
  `rclone serve webdav` is the server, an ordinary program on the machine, and keeps modification
  times through `X-OC-Mtime` (`vendor=rclone`). Requests: `GET`, `HEAD`, `PUT`, `DELETE`,
  `PROPFIND`, `MKCOL`, `MOVE`, `COPY` with `Depth`, `Destination`, `Overwrite`, `X-OC-Mtime`.
  Builds for `GOOS=dolly` after a small patch (below). **Chosen.**
- cadaver, sitecopy (C, over neon): neon has its own sockets and TLS; using the broker means a
  neon transport of our own, a fork. cadaver is interactive get/put, sitecopy uploads one way.
- davfs2, wdfs, rclone mount: FUSE.
- davix (C++): its own HTTP stack or libcurl; get/put/ls/rm, no sync.
- Nextcloud's `nextcloudcmd` (csync): Qt, and a Nextcloud server on the machine.
- Unison, Syncthing, rsync, lsyncd: their own protocols over TCP, SSH or QUIC; sockets.
- Git over smart HTTP (in Dolly already): history, not a folder, and `git-http-backend` on the
  machine; it does not take files the machine writes into the folder.
- Rust: no WebDAV sync tool, and Rust's HTTP clients (hyper, reqwest) need sockets: Dolly has no
  broker transport for them.
- Python `webdavclient3` (push/pull through `requests`): the Python demo, and one way at a time
  with no state, so a deletion is not told from a new file.
- "A library a program links": no program here wants a WebDAV file API; curl already sends WebDAV
  methods (`curl -X PROPFIND`).

## Decisions (2026-11-13)

- rclone, built inside Dolly by `go-build` like esbuild, as the package `rclone` that `default`
  installs (it declares `http@0`, which `default` has). In `config/domain-pages-images.txt`, so the
  release serves it.
- Sources: the release archive and upstream's vendor archive, both in upstream's signed
  `SHA256SUMS`; the vendor archive is byte for byte what `go mod vendor` writes from the release's
  `go.sum` (compared, 10215 entries), so staging downloads no module. Staging keeps only the files
  the Dolly build compiles, by the seed's `go list -deps` for dolly/wasm64 (the go and embedded
  files of 224 packages, 990 files), and the licence files of the 46 modules: an 8.7 MB tar
  against 114 MB of vendor. It fails if a module has no licence file.
- `demos/rclone/rclone.go`: upstream's `rclone.go` with two backends (local, webdav) and 27
  commands, not `backend/all` and `cmd/all`: mount and serve cannot run here, and every other
  backend only grows a 40 MB executable.
- The patch (13 build constraints, one dialer): rclone treats every GOOS that is not windows,
  plan9 or js as unix, and `GOOS=dolly` is not unix (`demos/go`). Where rclone or `adrg/xdg` has a
  js file, dolly takes it; the unix files that build stay (symlinks, the daemon check).
  `fs/fserrors` names `EHOSTDOWN` and `EWOULDBLOCK`, which Dolly's error numbers lack. rclone's
  transport sets `DialContext`, and the Go port then uses the fake network of js and wasip1, as
  upstream's js port does: on dolly rclone leaves it unset. Changing the port's rule instead would
  change it for every Go program that dials for itself, an in-process listener's tests included.
- The server: upstream's `rclone serve webdav`, the same program. CORS by `--response-header`, not
  `--allow-origin`: under `--allow-origin` rclone answers the preflight itself with a list of
  headers without `X-OC-Mtime`, and every upload fails (measured). `--dir-cache-time 0s`: by
  default the server lists a directory from a five-minute cache, and a file written on the
  machine did not reach the session (measured). No password: a browser sends none with a
  preflight, and rclone's basic auth answers it 401 (measured), so a random `--baseurl` token
  stands in (`/` and other paths are 404, measured); it keeps out a page that reaches the port by
  DNS rebinding, which CORS does not stop.
- No broker change: a rule's `methods` and header names admit WebDAV as they are.
  `docs/browser-boundary.md` is unchanged.
- Go's transport held a request body to 8 MiB (`dollyHTTPMaxBody` in the Go patch), from before
  `45e67191` raised the broker's cap to 64 MiB: rclone failed to upload a 9 MiB file (measured).
  The constant now is the broker's, and the Go seed is rebuilt (1 min 49 s, 88296c30…); with it a
  16 MiB upload from the session took 0.5 s in Chrome. It rebuilds go-sdk, go, go-build,
  go-tools and esbuild once.
