# Cargo cannot use crates.io from the browser; a model vendors crates by hand

- STATUS: CLOSED
- PRIORITY: 120
- TAGS: rust,cargo,packages,agent-experience,0.1.4

## Closed (2026-10-24): `vendor-crates`

`vendor-crates` (`7ca708a1`, `demos/rust`), a Janis script in `janis-install`'s pattern and its
own package (it installs Janis, which needs `download@0`, so `cargo` does not install it: every
image that installs `cargo`, `spidermonkey` among them, would have to declare that module). In a
Cargo project it resolves the dependencies (`cargo metadata --no-deps`; the newest version each
requirement admits, every target, the features that enable optional dependencies; a
`Cargo.lock`'s versions when there is one) with plain GETs of the index's GitHub mirror, fetches
each crate from static.crates.io through the broker, checks it with `sha256sum` against the
index's checksum, unpacks it into `vendor/` with its `.cargo-checksum.json`, and writes the
`vendored-sources` replacement (and the SDK's `libc` patch when `libc` is among the crates) to
`.cargo/config.toml`. Its manual page says it exists because the index sends no CORS headers.

Measured on the seed `a3d68c88`, in `default` after `amy install cargo vendor-crates`, a project
using `clap` (derive) and `serde_json` with the real services: 28 crates (3.9 MB) vendored in
11.0 s and built by `cargo build --offline` in 40.9 s in Chromium; in Firefox vendored in 6.3 s
and built with `-j 1` in 92.1 s (with every job, Firefox's tab outgrew the test's 6 GB cap).
`demos/rust/test/vendor-crates-browser.mjs` (the mirror and static.crates.io stood in for by the
test server) passed in Chromium (16.0 s) and Firefox (22.9 s). Cargo's own sparse client cannot
use the mirror: its `Cargo-Protocol` header needs a preflight the mirror refuses (measured with
`curl -H` in a session), while plain GETs pass.

Pi's skill and the Rust README point at the tool. Cargo's manual page (in `Dollyfile-cargo`)
still says the index "needs a relay or a vendored directory": editing that recipe rebuilds every
image with `cargo`, so it changes with the next rebuild of them.


Found by Opus 5.5 in Pi (`tasks/20261023-180000-opus-in-pi`, round 4, `r4-rust/`): asked for a
Cargo project using `clap` and `serde_json`, it found that Cargo cannot reach the index and
vendored the crates by hand from static.crates.io (21 calls, 3 failed, $0.323).

Measured (curl from this machine, and in pi-agent through the broker):
- `index.crates.io` answers a preflight with `access-control-allow-headers: cargo-protocol`,
  but files its cache already holds come back without any CORS header, so the browser
  refuses most of them (`curl` in Dolly: status 7). The Rust demo's README says so.
- The index's GitHub mirror, `raw.githubusercontent.com/rust-lang/crates.io-index/master/`,
  sends `access-control-allow-origin: *` and its `config.json` names
  `dl = https://static.crates.io/crates`, which also sends it: plain GETs work. But Cargo's
  requests carry headers that need a preflight, which that host answers with 403, so
  `[source.github-mirror] registry = "sparse+https://raw.githubusercontent.com/..."` fails
  with "download of config.json failed" (`build/opus-evidence/r4/probe-cargo.out`).
- Vendoring works: a crate from static.crates.io unpacked into `vendor/` with a
  `.cargo-checksum.json` of `{"files":{},"package":"SHA256"}` and a `vendored-sources`
  replacement builds (`r4/probe-cargo2.out`). Pi's skill now says how (`d2457991`); a second
  session followed it, wrote its own resolver over the GitHub mirror, and finished in the same
  21 calls ($0.263), two of them lost to the core `tar` on `.crate` files
  ([tar-not-archive](../20261023-132201-tar-not-archive/TASK.md)).
- `cargo run` works now that `exec` does (`r4/probe-cargo2.out`); the Rust demo's README
  still says it fails.

Decided by the integrator (2026-10-24): no relay; vendoring as Pi's skill describes it is the
answer for 0.1.4. The README's `cargo run` line now says it works.

## Decided (2026-10-24): no relay

Owner (2026-10-24): "crates - no relay." Dolly hosts no CORS relay for `index.crates.io`; its
one network edge stays the browser's broker, and crates.io is reached as the browser can.

To do: a vendoring tool in Dolly, as `janis-install` is for npm. It resolves a project's
dependencies over the index's GitHub mirror (CORS GETs work there), fetches each `.crate` from
static.crates.io, and writes `vendor/` with its `.cargo-checksum.json` files and the
`vendored-sources` replacement, so that `cargo build --offline` builds. Then Pi's skill points
at the tool instead of the hand steps, and the Rust demo's README drops "`cargo run` fails".

Done when: in `default` after `amy install cargo`, a project using `clap` and `serde_json`
builds with the tool and `cargo build --offline` in Chromium and Firefox.
