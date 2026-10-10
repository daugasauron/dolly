# Release v0.1.1

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: release

Owner (2026-10-09), after trying the merged `main` locally: "Publish this as
v0.1.1"; and on the Rust toolchain: "implement choice 1 for v0.1.1" (the
`rust` package carries the second generation of rustc; the seed stays the
documented stage 0).

## In it, since v0.1.0

- Rust built inside Dolly: `rust-llvm`, `rust-build` (two generations of
  rustc, the standard library checked identical from both, Cargo); the
  `rust` and `cargo` packages hold nothing of the seed
  (`tasks/20260930-231100-self-host-rust`).
- Patti is removed; ripgrep, fd, cbindgen, protox and Codex are built by
  Cargo from vendored crates (`tasks/20260930-231102-cargo-native`).
- The Wine demo: a desktop with a taskbar and Start menu, Notepad, WineMine,
  ReactOS Paint, and an x86-64 interpreter that runs TinyCC
  (`tasks/20261008-145108-wine-bringup`). `wine` is on the domain's list.
- Live verification asks for each file in its stored encoding.

Not in it: file modes and `umask`, the two terminal-input fixes, the sysroot
demo, the Qwen 4B packaging, alphabetical order on the page.

## Procedure

`tasks/20261007-131241-release-v010` ("Release checklist"), on
`work/rust` with `work/release-round.sh`; the archive of v0.1.0 is
`work/locks/published/v0.1.0`.

## Released (2026-10-10, 01:27)

- `main` = `origin/main` = tag `v0.1.1` = `2f6478a2`; GitHub release
  `v0.1.1` with the Pages tarball (SHA-256 `76dce8b6…6c61`).
- The round on that tree (`work/rust/build/release-evidence/`): all 80
  images rebuilt under `/v0.1.1/` (runtime `1c83127b…`, image inputs
  `c5e8e449…`, both as v0.1.0), source 421/0, artifacts 25/0, the core
  browser suite green in Chromium and Firefox (916 s), every demo test and
  five GPU tests exit 0. Xonotic's demo test failed in the round on a
  recording (`short.dem`) that this worktree's cache lacked and passed
  alone once it was copied in (435 s); the round's last commit before the
  tag only shortens the GitHub Pages list, and the suites were not rerun
  after it.
- `rust-build` in that round: rustc 8 min 33 s, std 51 s, rustc again
  9 min 10 s, std again 51 s with `cmp` equal, Cargo 9 min 10 s; Codex
  29 min 58 s.
- `scripts/release-checklist.sh` passed at `2f6478a2` (no token-shaped
  string in the 30 commits or the snapshots; the owner's key not present by
  value in commits, snapshots or the deployment; both sites sealed from the
  commit). The packaged domain site, served locally, boots `default` in both
  browsers, and its `wine`, `rust-tools` and `codex` pages reach ready.
- GitHub Pages: 981,988,019 bytes after `neovim` and `rts-arena` left its
  list (1,122,907,811 with them: the Rust chain's sources come with pi's
  tools). Workflow run 37959251892 succeeded; `/dolly/v0.1.1/` boots
  `default` in chromium and firefox.
- daugasauron.com: domain release `22fdea24…`, deployment `9e9a1bb5`, 4,651
  files for v0.1.0 and v0.1.1, 563 uploaded in 257 s. `/` redirects to
  `/v0.1.1/`; `default` boots and runs commands in both browsers; `wine`,
  `rust-tools` and v0.1.0's `default` reach ready; every file of v0.1.1
  matches the list (`published-version.mjs verify`, exit 0). On the
  deployment's own address `boot v0.1.0 v0.1.1` passes in both browsers.
- On daugasauron.com one unversioned URL, `/default/`, still answers 200
  with a copy Cloudflare keeps of an older deployment's page, so
  `published-version.mjs boot https://daugasauron.com` stops at "an
  unversioned path is served"; every other unversioned path is 404
  (`tasks/*-stale-default`).
- Archive for later deploys: `work/locks/published/` holds v0.1.0 and
  v0.1.1 (36 GB).
- Not done at release: `package.json` and `src/version.mjs` stay at 0.1.1
  until the next round is assembled.
