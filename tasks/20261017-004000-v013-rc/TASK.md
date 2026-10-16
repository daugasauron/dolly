# v0.1.3 release candidate

- STATUS: OPEN
- PRIORITY: 60
- TAGS: release,owner

Owner (2026-10-16): "Merge all of this and create a release candidate". A candidate is
local: nothing is pushed, published or deployed until the owner says so.

## State (2026-10-17, 00:45): packaged and served, the owner's to try

Tag `rc-2026-10-17` = `8561e429` (local `main`, version 0.1.3, 159 images, image inputs
`a24f5a0f...`). Every branch with new work was already on `main`; what stays out is
old or rejected (`core/file-modes`, `core/concurrent-pipelines`, `probe/gtk`).
Two commits for the candidate: the domain site's list gains `ghostty-x11`,
`x11-desktop`, `zsh`, `imgui`, `imgui-x11` and `zig-llvm` (with them every image but
`llvm-runtimes` is in its closure), and the release checklist's credential scan takes
a private key's PEM header only at a line's end. GLib's PEM parser keeps
`-----BEGIN ENCRYPTED PRIVATE KEY-----` as a NUL-ended string in libgio, which stopped
the scan on the glib, gtk-build and mesa-build snapshots. It was a constant, not a key.

| Check | Result |
|---|---|
| Round (`integrate/ghostty`, 2026-10-16) | every image built; source 433/0, artifacts 25/0, demos 26 passed / 2 on-demand skipped; the core suite and amy's test rerun green after test fixes (`e73bf6a4`) |
| Plan on the candidate | 159 reuse, 0 build |
| Domain site (slopshare.dev) | `build/v013-domain-releases`, release `b00242da...`, 15.07 GB, accepted |
| GitHub Pages subset | `build/v013-github-releases`, release `2b08d4d8...`, export 812,568,763 bytes of 1 GB, accepted |
| Credential scan (commits since `origin/main`, every snapshot) | none |
| `site-release.mjs verify` both sites | sealed from `8561e429` |
| GPU (Xvfb, NVIDIA) | local-llm, 0ad-spidermonkey, 0ad-engine, 0ad-graphics (hardware), slopyard, mojo (SwiftShader, NVIDIA, Firefox 157): all passed |
| Served release, Chromium and Firefox | `published-version.mjs boot` passed; `default` draws a kitty image; `ghostty-x11` shows its prompt in 4 s, answers a typed line in 0.3 s, and the shell after it finds the typed file and amy |

Served as it would be deployed by the user unit `dolly-serve-rc-9014`:
http://127.0.0.1:9014/ leads to `/v0.1.3/`; unversioned paths are 404. Evidence:
`work/x11fix/build/rc-1016-evidence/` (`work/rc-1016.sh` ran it).

Not done, because a candidate is local: tag `v0.1.3`, push, GitHub release, deployment.
The deployment's assembly (checklist step 6) was not run: with the published archive it
needs more disk than the 35 GB free.
