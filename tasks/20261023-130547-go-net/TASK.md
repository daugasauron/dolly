# Go: net/http over the broker, os/signal and syscall.Exec

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: toolchain,go,0.1.4

Follows [the Go port](../20261023-230000-go/TASK.md). Integrator, 2026-10-23: give `GOOS=dolly`
an `http.RoundTripper` through the process contract's HTTP operations, the edge curl uses (no
sockets, no new browser authority), proven by `go get` from proxy.golang.org in a session under
the page's default policy and a plain `http.Get` of an HTTPS URL; deliver the kernel's signals to
`signal.Notify` (at least SIGINT and SIGTERM); `syscall.Exec` once `execve` is in the contract.

Done when: those three work in go-tools in Chromium and Firefox (`demos/go/test/go-browser.mjs`),
recorded here.

## State (2026-10-23)

All three are in the patch and the browser test proves them in Chromium and Firefox on the
merged seed (559ad049); go-build still rebuilds the toolchain byte for byte equal to the new seed
(below). Done-when is met.

## Design

- **HTTP**: `net/http/roundtrip_dolly.go`, `Transport.RoundTrip` for dolly (as js has one over
  Fetch): the request's method, URL, `Name: value` header lines and body go to `HTTP_START` (a
  body larger than a packet is staged with `HTTP_BODY_WRITE`; the broker's cap is 8 MiB), and
  `HTTP_POLL` returns the records (effective URL, header lines, body chunks) as the response and
  its streaming body; `Close` before the end is `HTTP_CANCEL`. A full slot pool and an empty poll
  wait on a timer (0.1 to 10 ms), so other goroutines run and an idle process sleeps in the
  kernel. The broker's shape fits: it already sends the status line and header lines, strips the
  headers the browser owns (cmd/go's User-Agent among them) and follows redirects, so Go's
  client never sees a 3xx. The body arrives decoded: `Content-Encoding` and `Content-Length` are
  dropped, as js does. Errors are the broker's error numbers with `http.h`'s messages. A
  Transport with a Dial function keeps the fake network of js and wasip1.
- The runtime pushes the call to `net/http` (`go:linkname`), as it does to syscall. The linker
  writes a `dolly.host` record for `http@0` with its ABI digest (generated beside the process
  digest, from `host/http/abi.mjs`) when `net/http.dollyCall` is reachable, i.e. when a program
  links the transport, as libcurl's client does in C. So the `go` and `esbuild` packages declare
  `REQUIRES HOST http@0`.
- **Signals**: `_NSIG` is 32 on dolly (0 on js and wasip1). A signal a call takes is offered to
  `sigsend`: what `signal.Notify` asked for is queued for it, what `signal.Ignore` ignores is
  dropped, anything else takes its default action. `notetsleepg` (os/signal's wait) checked its
  note in a `Gosched` loop, which kept a program that called `signal.Notify` (cmd/go's `go run`
  and `go test` do) running at full speed while idle; it now checks every 5 ms on a timer.
- **Exec**: `syscall.Exec` sends `EXEC` with the path made absolute, the arguments, the
  environment and the signals `signal.Ignore` ignores; at start the runtime reads the state it
  was exec'd with and keeps those ignored. Its `EINTR` is retried, as libc does.

## Measured (2026-10-23)

- In a `system` session in Chrome, default policy: `http.Get` of
  `https://proxy.golang.org/github.com/google/uuid/@v/list` and `…/v1.6.0.mod`: 200 with their
  bodies and `Content-Type`; a host that does not resolve: the broker's EIO message. A program
  with `signal.Notify(c, os.Interrupt, syscall.SIGTERM)`: `kill -INT` and `kill -TERM` reach it
  ("GOT interrupt", "GOT terminated", its status 3).
- On the merged seed (image inputs 559ad049, the contract with EXEC): go-build again reports
  "8 programs equal the seed's", "2 programs equal the seed's".
- `npm run test:demos -- go` in go-tools, default policy: the earlier checks; `go mod init`,
  `go get github.com/google/uuid@v1.6.0` (proxy.golang.org, checked against sum.golang.org),
  `go build` and the program's output; `go run` of an `http.Get` of
  `https://proxy.golang.org/github.com/google/uuid/@v/v1.6.0.mod` (200 and the body); a
  `signal.Notify` program ended by Ctrl-C at the keyboard (its status 3, "GOT interrupt") and by
  `kill -TERM`; `syscall.Exec` of a missing file (ENOENT, the program goes on) and of
  `/bin/echo` (the echo's output, nothing after). **Chromium passed in 99.2 s, Firefox in
  120.6 s.**

## Closed (2026-10-23)

Done-when is met: the browser test above, in Chromium and Firefox. Commits 9e9a7c48 (net/http,
os/signal) and da78db58 (syscall.Exec, the test, the packages' http@0). Left for when spawn
admission by a memory budget lands (audit-53 item 2, the terminal workstream): measure whether
the go package can set `GOFLAGS=-p=N`; until then go-build keeps `-p 1` under `GOMEMLIMIT`.
