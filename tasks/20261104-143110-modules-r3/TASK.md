# The base holds the toolchain, not conveniences

- STATUS: OPEN
- PRIORITY: 150
- TAGS: host-modules,audit,images

## State (2026-11-17, ws/modules)

Done on `ws/modules`; the catalog build is the 0.1.8 round's.
- `system-tools` installs no `curl` and declares no `http@0`; Git's HTTP helpers left the
  `git` package (built `NO_CURL`, upstream's option for a Git without libcurl) for a
  `git-http` package (`Dollyfile-git-http`:
  Git's objects built again and linked with libcurl over http@0, `git-remote-http` and
  `git-remote-https`), which a session that clones over HTTPS installs beside `git`.
- `system` installs no `transfer` (nor the download and upload headers) and declares
  runtime, display, input, snapshot and threads (Git).
- What took curl from the base takes it itself: `python` and `cmake` `USE` it, `wine-build`
  and `zero-ad-deps` `INSTALL` it. The toolchains that declared `http@0` for the base alone
  drop it: `classicube-build`, `lean-stage0`, `rts-build`, `gamedev-sdk`, `xonotic-build`
  (with modules-r4's engine and modules-r5's amy, also `system-build`, `zig-build`,
  `zig-llvm-build`, `go-sdk`, `ghostty-build`, `tmux-panes` and `x11-desktop`).
- The core suites that used system's curl and file exchange open `system` with them composed
  (`workbench()` in `test/browser.mjs`: transfer and curl with their modules); a case file's
  fixtures are written by the shell (`put()`, printf's octal escapes), with no network.

## State (2026-11-16, the audit)

One part is done: `html` left `system` and `default` on 2026-11-11 (`65a4ad70f`, "default and system
hold no html"). Still as filed: `Dollyfile-system` installs `transfer` and declares `download@0`,
`http@0` and `upload@0`. `Dollyfile-system-tools` installs `curl` and `git`, and Git's HTTP helper is
not a package of its own.

From the module audit (`tasks/20261104-135806-module-audit`, R3, sections 1, 4 item 2 and 5).
The integrator chose R1 and R2 for 0.1.5 on 2026-11-04; this is the next step and is
independent of them.

`system` installs `transfer` and `html` ("here and in the images built on this one", b48c0bcc8,
5caa5e814) and `system-tools` installs `curl` and Git with its HTTP helper
(`Dollyfile-system-tools`, "zlib, gzip and curl for builds, and Git, which Dolly's patch and diff
run"). Sealing then requires `download@0`, `upload@0`, `html@0`, `http@0` and `threads@0` on every
image that keeps the base. After R1 no application keeps a base, so this matters for the
toolchains only: 13 of them declare `http@0` for `curl`, `git-remote-http` and the engine alone
(audit section 4, class E).

- `system` stops installing `transfer` and `html`; an image that wants them installs them, as
  `default` does.
- `system-tools` stops installing `curl` (no build row runs it: grep finds only `Dollyfile-curl`;
  libcurl's consumers `USE` the curl package already).
- Git's core stays in `system-tools` for `patch` and `diff`; its HTTP helper,
  `/usr/libexec/dolly/git-remote-http` (the one Git executable linking libcurl,
  `Dollyfile-git:110-118`), becomes a `git-http` package, installed by what clones over HTTPS.

Cost: recipes only (`Dollyfile-system`, `Dollyfile-system-tools`, `Dollyfile-git`, a new package,
the images that want curl or Git over HTTP add an INSTALL); a round, since every toolchain on
`system-tools` rebuilds.

## Done when

- `system` declares runtime, display, input, snapshot and threads (Git), and no toolchain declares
  `http@0` without a program of its own that fetches; the catalog builds; `git clone https://…`
  works where `git-http` is installed.
