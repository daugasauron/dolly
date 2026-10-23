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
os/signal) and da78db58 (syscall.Exec, the test, the packages' http@0).

## Parallel builds under the spawn budget (2026-10-24)

Integrator: with spawns admitted while the processes' committed memory is under 4 GiB
(core/terminal 2b9fd4a4, image inputs 54c70100), measure `go build` at `-p` 1, 2 and 4 and
go-build's `go install -a` at `-p 2`; set `GOFLAGS` if it is faster and safe.

Measured in Chrome, go-tools on 54c70100, cold `GOCACHE`; memory is the peak of the browser
slot's cgroup (Chrome and the harness, 1.1 to 1.5 GiB idle), sampled every 200 ms:

| build | -p 1 | -p 2 | -p 4 | -p 8 |
| --- | --- | --- | --- | --- |
| `go build` of the uuid module (two runs) | 43.7, 42.1 s; 2.05, 1.78 GiB | 29.2, 23.6 s; 1.88, 2.11 GiB | 21.3, 17.2 s; 1.83, 2.50 GiB | |
| `go install github.com/itchyny/gojq/cmd/gojq@v0.12.17` | 40.8, 39.1 s; 2.18, 2.20 GiB | 24.6 s; 2.25 GiB | 22.0, 22.2 s; 2.75, 2.34 GiB | 21.7 s; 2.30 GiB |
| go-build's `go install -a`, `GOMEMLIMIT=2GiB` | 404.8 s; 5.75 GiB | 201.2 s; 4.63 GiB | 157.8 s; 4.61 GiB | |
| the same without `GOMEMLIMIT` | | 198.2 s; 3.89 GiB | | |

Every build passed and no spawn was refused. The budget refuses, it does not wait: beside a
Go program holding 4300 MiB the shell's next spawn fails with EAGAIN ("spawn failed: Resource
temporarily unavailable"); beside one holding 3980 MiB `go build -p 1` passed and `go build -p 4`
failed in 0.6 s with `go: error obtaining buildID for go tool asm: fork/exec
/usr/lib/go/pkg/tool/dolly_wasm64/asm: Try again`, and passed again once the program was killed.
Reported to the integrator as a core question (refuse or wait), not worked around in Go.
`goimports@latest` does not build: `golang.org/x/telemetry/internal/mmap` has no file for an
unknown GOOS (`undefined: mmapFile`).

Decisions:

- The go package exports `GOFLAGS=-p=4`: the first build of a small module halves, `-p 8` adds
  nothing, and the peak stays under 2.8 GiB. With it `npm run test:demos -- go` passes in
  Chromium in 61.3 s and Firefox in 69.8 s (104.3 and 105.2 s before).
- go-build runs `-p 2` under `GOMEMLIMIT=2GiB`: at a spawn at most one compile runs beside the
  go command, so the processes stay well under the budget even with ssa's compile; `-p 4`
  passed once but could find three 2 GiB compiles at a spawn. Its image build again reports "8
  programs equal the seed's", "2 programs equal the seed's", about 5 minutes against 7.
