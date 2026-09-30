# Let stock pip install packages through the HTTP broker

- STATUS: OPEN
- PRIORITY: 180
- TAGS: python,network,packages

Owner question (2026-10-01): is a low-level HTTP adapter worth it so plain
`pip` works instead of the custom Bonnie installer? Yes, at the HTTP level.

## Today

- CPython's sockets fail with `ENOSYS` (`demos/python/cpython-socket-stubs.c`);
  `_ssl` is not built, so `import ssl` fails. `pip`, `urllib` and `requests`
  cannot reach the network.
- Bonnie does all networking in C: `bonnie.c` calls the libcurl API, which is
  Dolly's `src/libcurl-fetch.c` over `dolly/http.h` (`host/http/client.c`) and
  the one broker. `bonnie.py` plans from PyPI metadata and runs the bundled
  pip 26.2.1 only offline (`pip wheel --no-index --no-deps
  --no-build-isolation`) to build sdists. Bonnie: 1,561 + 890 lines, plus
  `bonnie.dm`; no full resolver backtracking.

## Design

- Not a socket-level emulation: the browser offers no raw TCP or TLS, and a
  fake socket plus fake `ssl` module would have to claim OpenSSL (urllib3
  checks it), which the porting rules forbid.
- A small C extension module exposing `dolly_http_start/poll/cancel` to Python
  (streaming bodies, headers, status, cancellation), so requests still cross
  `env.dolly_http_dispatch` and its policy.
- Python transports on top of it:
  - a default `urllib.request` handler for `http` and `https`;
  - a replacement for `HTTPAdapter.send` in `requests` and in pip's vendored
    `pip._vendor.requests`, so neither touches urllib3's sockets or `ssl`.
    pip 26.2.1 only logs a warning when `ssl` is missing.
- Still unsupported, failing explicitly: httpx, aiohttp and other asyncio
  clients, WebSockets and raw sockets.

## Open points

- Bonnie's per-package build settings (`/etc/bonnie/build.toml`, e.g. NumPy's
  debug, no-CPU-optimization Meson build that fits the compiler budget) move to
  a `pip.conf` with `--config-settings` or environment variables.
- pip isolates builds by default (subprocess pip installing build requirements
  into temporary prefixes): measure it against `--no-build-isolation`.
- Hooking pip's vendored requests depends on the pinned pip version; the test
  below guards it.

## Done when

- In the python image, in a real browser against the local fixture server:
  `pip install` of a pure-Python package with a dependency, NumPy and Pandas
  succeed; `urllib.request.urlopen` and `requests.get` work; a policy-denied
  URL fails with the broker's error.
- Bonnie is deleted and its tests replaced by the pip checks above.
