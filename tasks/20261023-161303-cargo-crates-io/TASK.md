# Cargo cannot use crates.io from the browser; a model vendors crates by hand

- STATUS: OPEN
- PRIORITY: 120
- TAGS: rust,cargo,packages,agent-experience,0.1.4


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
