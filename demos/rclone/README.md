# rclone

A folder this machine serves, kept in step with a folder of a Dolly session.
Dolly has no FUSE and no sockets, so nothing is mounted: rclone 1.76, built
inside Dolly by the `go` package, copies what changed on either side to the
other (`rclone bisync`) through the page's HTTP broker, and upstream's own
rclone serves the folder over WebDAV on the machine.

## Images

- `rclone`: rclone with its local and WebDAV backends: `rclone bisync` keeps a folder in step with one a WebDAV server holds.

## The server

On the machine whose folder it is, with [upstream's rclone](https://rclone.org/downloads/):

```sh
token="$(openssl rand -hex 16)"; echo "$token"
mkdir -p ~/dolly-share
rclone serve webdav ~/dolly-share --addr 127.0.0.1:8090 --baseurl "$token" \
  --dir-cache-time 0s \
  --response-header 'Access-Control-Allow-Origin: http://localhost:9045' \
  --response-header 'Access-Control-Allow-Methods: GET, HEAD, PUT, DELETE, PROPFIND, MKCOL, MOVE, COPY' \
  --response-header 'Access-Control-Allow-Headers: Content-Type, Depth, Destination, Overwrite, X-OC-Mtime'
```

- `Access-Control-Allow-Origin` is the origin of the page that runs Dolly,
  as its address bar shows it (`http://localhost:9045` above); the browser
  reads no answer without it.
  Only that page may write: WebDAV's methods and headers make every write a
  CORS preflight, which another origin fails.
- The headers are set with `--response-header` and not `--allow-origin`:
  rclone answers a preflight itself under `--allow-origin`, with a list of
  headers that lacks `X-OC-Mtime`, in which rclone sends a file's
  modification time, so the browser refuses every upload.
- A browser sends no credentials with a preflight, so the server takes no
  password: the token in its path stands in for one. It keeps out another
  page that reaches the port through DNS rebinding, which CORS does not.
- `--dir-cache-time 0s`: rclone keeps a listing for five minutes by
  default, so a file written into the folder on the machine would wait that
  long.
- A page served from another machine, such as the public site, reaches the
  server only once the user allows the browser's prompt for local network
  access: until then Chrome 156 fails each request as unreachable and
  Firefox 155 holds it (measured with the page's address taken for a public
  one).

## In the session

```sh
amy install rclone
rclone config create host webdav url=http://127.0.0.1:8090/TOKEN vendor=rclone
mkdir -p /workspace/host
rclone bisync /workspace/host host: --resync      # the first time: each side gets the other's files
rclone bisync /workspace/host host:               # after changes on either side
slop -c 'while :; do rclone bisync /workspace/host host: --resilient --recover --max-lock 2m -q; sleep 10; done' &
```

TOKEN is the word the server's command printed. `vendor=rclone` tells
rclone that the server is rclone's, which keeps modification times. The
loop carries changes every ten seconds until the tab closes, and a loaded
session starts it by the same line; `--recover` and `--max-lock` let a run
that the closed tab interrupted pick up where it stopped. A file changed on
both sides between two runs becomes `NAME.conflict1`, the session's, and
`NAME.conflict2`, the server's, on both sides. The configuration and
bisync's listings are files of the session (`~/.config/rclone`,
`~/.cache/rclone`), which a save holds.

## HTTP policy

The public site's default policy admits the server. An embedding with a
policy ([HTTP](../../docs/http.md#policy)) adds its rule, with the token's
path and the WebDAV headers a hardened rule would remove. Without
`x-oc-mtime`, the server gives each file the time of its upload:

```js
{
  origin: "http://127.0.0.1:8090",
  pathPrefix: "/TOKEN",
  methods: ["GET", "HEAD", "PUT", "DELETE", "PROPFIND", "MKCOL", "MOVE", "COPY"],
  credentialHeaders: ["depth", "destination", "overwrite", "x-oc-mtime"],
}
```

The policy's `maxRequests` (256 unless it says) counts the requests of the
page's whole life: a bisync without changes makes one for each directory,
so the ten-second loop over three directories makes 18 a minute.

## The port

[`rclone.go`](rclone.go) is upstream's `rclone.go` with the local and WebDAV
backends and the commands the package lists in `man rclone`; staging
([`prepare-sources.sh`](prepare-sources.sh)) keeps only the files that build
compiles, of the release and the modules upstream vendors.
[`rclone-1.76.0-dolly.patch`](rclone-1.76.0-dolly.patch):

- `GOOS=dolly` is not `unix`: dolly takes rclone's file for js where the
  unix one does not build (`lib/mmap`, `lib/diskusage`, the local backend's
  times, modes and metadata, `fs/log`'s stderr) and the unix files of
  `github.com/adrg/xdg`, which js takes too; `fs/fserrors` names
  `EHOSTDOWN` and `EWOULDBLOCK`, which Dolly's error numbers lack.
- rclone's transport dials for itself; on dolly it does not, so Go's
  transport fetches through the broker ([Go](../go/README.md#network-signals-and-exec)).

## Limits

- A file uploads if it is at most 64 MiB, the broker's limit on a request
  body. Downloads have none.
- No `rclone mount` or `rclone serve`: Dolly has neither FUSE nor listening
  sockets.

Test: `npm run test:demos -- rclone` ([`test/`](test/)): upstream's rclone
serves a folder on a loopback port, `default` installs the package, and files
written, changed and removed on either side reach the other, in Chrome and
Firefox under a policy of that rule and the one `amy` reads its index by.
