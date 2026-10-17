# v0.1.3 release candidate, then released

- STATUS: CLOSED
- PRIORITY: 60
- TAGS: release

Owner (2026-10-16): "Merge all of this and create a release candidate". A candidate is
local: nothing is pushed, published or deployed until the owner says so.

## State (2026-10-17, 10:30): packaged and served, the owner's to try

Tag `rc-2026-10-17` = `9bd249d1` (local `main`, version 0.1.3, 159 images, image inputs
`a24f5a0f...`). Every branch with new work was already on `main`; what stays out is
old or rejected (`core/file-modes`, `core/concurrent-pipelines`, `probe/gtk`).
Three commits for the candidate: the domain site's list gains `ghostty-x11`,
`x11-desktop`, `zsh`, `imgui`, `imgui-x11` and `zig-llvm` (with them every image but
`llvm-runtimes` is in its closure), and the release checklist's credential scan takes
a private key's PEM header only at a line's end. GLib's PEM parser keeps
`-----BEGIN ENCRYPTED PRIVATE KEY-----` as a NUL-ended string in libgio, which stopped
the scan on the glib, gtk-build and mesa-build snapshots. It was a constant, not a key. At the owner's word (10:00) the start page's intro lost its
Rust paragraph.

| Check | Result |
|---|---|
| Round (`integrate/ghostty`, 2026-10-16) | every image built; source 433/0, artifacts 25/0, demos 26 passed / 2 on-demand skipped; the core suite and amy's test rerun green after test fixes (`e73bf6a4`) |
| Plan on the candidate | 159 reuse, 0 build |
| Domain site (slopshare.dev) | `build/v013-domain-releases`, release `601dd208...`, 15.07 GB, accepted |
| GitHub Pages subset | `build/v013-github-releases`, release `4f854f57...`, export 812,568,675 bytes of 1 GB, accepted |
| Credential scan (commits since `origin/main`, every snapshot) | none |
| `site-release.mjs verify` both sites | sealed from `9bd249d1` |
| GPU (Xvfb, NVIDIA; on `8561e429`, same images) | local-llm, 0ad-spidermonkey, 0ad-engine, 0ad-graphics (hardware), slopyard, mojo (SwiftShader, NVIDIA, Firefox 157): all passed |
| Served release, Chromium and Firefox | `published-version.mjs boot` passed (again on `9bd249d1`); `default` draws a kitty image; `ghostty-x11` shows its prompt in 4 s, answers a typed line in 0.3 s, and the shell after it finds the typed file and amy |

Served as it would be deployed by the user unit `dolly-serve-rc-9014`:
http://127.0.0.1:9014/ leads to `/v0.1.3/`; unversioned paths are 404. Evidence:
`work/x11fix/build/rc-1016-evidence/` (`work/rc-1016.sh` ran it).

Not done, because a candidate is local: tag `v0.1.3`, push, GitHub release, deployment.
The deployment's assembly (checklist step 6) was not run: with the published archive it
needs more disk than the 35 GB free.

## Released (2026-10-17, 11:30)

Owner: "Tag, push & deploy." `origin/main` = tag `v0.1.3` = `9bd249d1`; the record commits
after it stay local, as after v0.1.2.

- `scripts/release-checklist.sh` passed on `9bd249d1`: no token-shaped string in the 633
  commits or the snapshots, both sites sealed from the commit, GitHub Pages export
  812,568,675 bytes, the deployment assembled with v0.1.0 (2,277 files), v0.1.1 (2,370),
  v0.1.2 (2,460) and v0.1.3 (3,149): 10,260 files, 74 header rules.
- GitHub release https://github.com/daugasauron/dolly/releases/tag/v0.1.3 with the Pages
  tarball (536,655,418 bytes, SHA-256 `2dd1b502...cddbc`); workflow run 38992222468
  succeeded; `boot https://daugasauron.github.io/dolly v0.1.3` passed in Chromium and Firefox.
- Cloudflare: deployment `75b8a853` (1,675 files uploaded, 8,583 already there, 473 s).
  `boot https://slopshare.dev v0.1.0 v0.1.1 v0.1.2 v0.1.3` passed in Chromium and Firefox.
  `verify` on slopshare.dev stops at `view/git/` because the zone's Email Address
  Obfuscation rewrites it (`view/xz/` and `view/xonotic/` too); on the deployment's own
  address `verify https://75b8a853.dolly-9dk.pages.dev` serves every file of v0.1.3 and the
  lists of all four versions.
- On slopshare.dev, in Chromium and Firefox: `default` draws a kitty image; `ghostty-x11`
  shows its prompt after 49 s and 27 s on a first visit (its 225 MB image downloads) and
  answers a typed line in 0.3 s.
- The archive `work/locks/published/` holds v0.1.0 to v0.1.3; v0.1.3's list has SHA-256
  `7acdb79e...5526`, the one in the release notes.
- `package.json` and `src/version.mjs` stay at 0.1.3 until the next round is assembled.

Evidence: `work/x11fix/build/rc-1016-evidence/` (`live-*.log`, `live/`).
