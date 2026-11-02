# Demo workarounds whose causes are gone

- STATUS: OPEN
- PRIORITY: 150
- TAGS: demo,cleanup

The docs audit (`tasks/20261101-221623-docs-audit`) listed demo workarounds whose
cause the core has since removed: `execve` (ba5f2568), gzip compressing
(68824453), tar reading pax headers (dbf38965, 705de088), `wait4` taking a usage
record (bbec81cc). Each is a claim until measured; this task removes what the
measurement confirms, one commit per item, on `demo/workaround-removal`
(from `core/docs-audit`, whose 705de088 is a seed input: the tree's 25-image
closure is built on it, every other image is stale).

Evidence: `build/workaround-removal-evidence/`. The core tar built natively from
`src/commands/tar.c` (`core-tar`) is the measuring instrument for archives:
`core-tar-extract.log`, `core-tar-x11.log`, `archive-survey.log`.

## 1. zsh: exec and the last command of `zsh -c`

`demos/zsh/zsh-dolly.patch` (1c868cb3, 2026-10-15, "Dolly has no fork or exec")
made `execute()` always spawn: `exec PROG` spawned, waited and exited with the
status, and the last command of `zsh -c` likewise. `execve` exists since
ba5f2568 (2026-10-23). The rest of the patch stays: Dolly still has no `fork`,
so every other process is a spawn, and shell code that needs a process of its
own runs in a new zsh given the shell's state.

Change: a `replacing` flag set where upstream's code replaces the shell (the
`is_exec` path of a simple command); there `zexecve()` calls the real `execve`,
`execute()` closes the xtrace descriptors and unblocks `SIGCHLD` as upstream,
and a failed exec `_exit`s as upstream. The spawn path is unchanged. The
`entersubsh()` hunk is gone (upstream's runs for every exec). The recipe's check
gains: `exec zsh -fc 'print $$'` and the last command of `zsh -c` print the
outer shell's pid; `exec zsh -fc 'exit 3'` gives status 3.

Commit: 163e1b4e.

## 2. Recipe comments and Emacs's Lisp sources

- `Dollyfile-pigz` said gzip "only reads"; `Dollyfile-tar` said "The gzip of the
  core reads .gz; pigz writes it" and that the core tar reads no pax headers.
  Comments corrected.
- `Dollyfile-emacs` left out every Lisp source whose bytecode is installed
  "because Dolly's gzip only decompresses". Upstream's `make install`
  (`Makefile.in`, `install-arch-indep`) gzips with `-9n` each `.el` beside an
  `.elc`, `etc/publicsuffix.txt`, the info pages and the man pages; the recipe
  now does the same but for the man pages (Dolly's are cat pages). Emacs reads
  them through `jka-compr`, which runs `gzip -c -q -d` (Dolly's gzip takes `-q`
  and `-n`, ignored); `Info-insert-file-contents` lets `jka-compr` decode too
  when `auto-compression-mode` is on, which it is by default, and
  `url-domsuf` looks for `publicsuffix.txt.gz` first. The staged release holds
  1716 `.el` (77.6 MB) of which 1642 have an `.elc` (69.2 MB), and 66 `.info`
  (21.3 MB with the images beside them). The check loads `subr.el.gz` through
  `find-library-name` and `insert-file-contents`.

Commit: 9b585cb5.

## 3. X.Org recipes that installed the tools demo's tar

Measured with `core-tar` (705de088) on the pinned archives
(`core-tar-x11.log`): libxkbfile (xz, 28 files), xkbcomp (57), libmd (xz, 93),
libXfont2 (123) and xorg-server (1661) extract; pixman fails on
`.gitlab-ci.d/01-docker/target-env/linux-ppc.env` (a link) and
xkeyboard-config on `symbols/caps` (a link). `Dollyfile-libxkbfile`,
`-xkbcomp` and `-xorg-server` drop `USE Dollyfile-tar` and its comment;
`-pixman` and `-xkeyboard-config` keep it, for the links.

Commit: 2a69eb27.

## 4. Plain-tar stagings made for the pax headers

Measured with `core-tar` (`core-tar-extract.log`, `archive-survey.log`): none of
the archives holds a pax header any more; what fails is links.

| archive | core tar | staging |
| --- | --- | --- |
| binaryen version_133 (GitHub) | extracts, 3040 files, 50 MB | dropped: the recipe reads the archive (7.1 MB gz, against the 11.7 MB plain tar it replaces) and copies the licences itself |
| lz4 1.10.0 | extracts, 208 files | dropped: archive 387 KB against an 876 KB tar; the recipe copies licences and the man page |
| xterm 412 (GitHub) | extracts, 241 files | dropped: archive 1.6 MB against a 6.8 MB tar; `xterm-pty.c` is staged as a file |
| jq 1.8.2 | refused: a hard link in `docs/` | kept |
| zstd 1.5.7 | refused: two symlinks in `tests/` | kept |
| lean 4.35.0 | refused: 7 symlinks (`AGENTS.md`, `tests/`) | kept, another agent's (`demo/lean-3`): its comment's reason ("a pax header") is wrong, the links are the reason |
| tree 2.3.2, dte 1.11.1, base64 0.5.2, neatvi 20, linenoise 2.0 | extract (24, 389, 79, 103, 8 files) | dropped in a second commit: the recipes copy the licences, README and man pages the stagings placed |
| bc 7.0.3 | refused: a link, `configure` | kept |
| wabt (xz), toybox (links, generated headers) | not pax | kept |

`demos/tools/README.md` now names the reasons that remain. sqlite's recipe
changing (linenoise) cascades through python's pin into most of the catalog,
which the seed change invalidates anyway.

Commits: a44d764b (Binaryen, lz4, xterm), 2807e7f0 (tree, dte, base64, vi,
sqlite's linenoise).

## 5. Studio's copies of two docs

`demos/studio/prepare-sources.sh` staged `docs/dollyfile.md` and
`docs/image-build-service.md` under `/usr/share/dollyfile-studio/`. Its base
chain pi-local → pi-agent → pi-runtime → pi-dolly installs `dolly-docs`, which
puts both at `/usr/share/doc/dolly/docs/`. The skill now reads the installed
copy; the staging and the README's claim are gone. Nothing read
`build-service.md`.

The image cannot be rebuilt here: its closure holds `rust-build` (ripgrep, fd),
a hugebuild for the integrator alone; it is stale on this seed like every image
outside the 25. Verified by the source suite (`demos/studio/test/studio.test.mjs`
reads the staging) and the recipe chain; the browser test waits for the catalog
round.

Commit: 6d33e42b.

## 6. Mojo's `llvm-wait.patch`

`wait4` takes a usage record since bbec81cc: `__syscall_wait4` in
`src/process/libc-adapter.c` zeroes it. The patch's two hunks (a `wait4` that
calls `waitpid`; the `ProcStat` report left out) can both go: LLVM would report
zero times, as `time` does here. Done once builds A to C had finished in 72
minutes together: the patch, its `SOURCE`, `SLOP` and staging line, its README
bullet and its inventory entry are gone (c21e62f8). Build D (C plus `mojo-gpu`,
bigbuild, unit `dolly-workaround-removal-build-d`, started 11:55; the README
gives `mojo-llvm` 45 to 77 minutes) and `npm run test:demos -- mojo` decide
whether it stays. Build D was ready at 13:12 (4611 s: mojo-llvm, mojo and
mojo-gpu built, the rest reused; `mojo --version` and the two `mojo precompile`
runs of the recipe passed, `mojo.log`). The catalog then holds 69 images, the
closure of the fifteen named; no dist file outside the snapshots, packs and
static directories is a hard link. `npm run test:demos -- mojo` passed in
headless Chromium on SwiftShader (`mojo-test.log`): its `mojo build` runs link
through `cc`, which LLVM's `ExecuteAndWait` now waits for with upstream's
`wait4`. The demo's test is Chromium's (the GPU path); the removal stays.

## What remains

- Studio's browser test (`npm run test:demos -- studio`) on a `dollyfile-studio`
  built on this seed: the catalog round's, since its closure holds
  `rust-build`. The source suite and the recipe chain are the evidence here.
- `demos/lean/prepare-sources.sh` (branch `demo/lean-3`): its comment gives
  "a pax header" as the reason for the plain tar; the measured reason is the
  seven links of Lean's archive. One line for that agent.
- The whole branch needs the catalog round that 705de088 already needs.

## Builds and tests

Build A (`default,zsh,lz4,pigz,tar`, unit `dolly-workaround-removal-build-a`,
slot taken 10:36): the plan rebuilt libuv, cmake, cmake-build, tools-build,
binaryen, libterminfo, lz4, pigz, tar and zsh on the seed ("seed or image ABI
changed"); 19 images reused. Logs `build-a.log`, `build/image-logs/`. Ready at
11:28, 3159 s for the ten; zsh's recipe check passed with the three new lines
(exec and the last command of `zsh -c` keep the pid, `exec` passes the status).

Tests on A: `npm run test:demos -- zsh` passed in Chromium (5.0 s) and Firefox
(9.7 s), `zsh-test.log`. The packages (lz4, pigz, tar, binaryen) are checked by
`packages-browser.mjs` in the evidence directory: `test/amy-browser.mjs`'s
checks for them, copied, since its table installs every package and the
catalog here is narrowed. Its first run failed on pigz because `default` has no
`gzip` command (the gzip package; `amy-browser.mjs` installs it earlier in its
table): a mistake of the copy, not of pigz; `packages-a2.log` installs it first
and passes for lz4 (with its three licence files and man page), pigz, tar and
binaryen (`--fpcast-emu`, both licence files) in Chromium (11.3 s) and Firefox
(17.5 s).

Build B (A plus `emacs,gnu-emacs,tree,dte,base64,vi,sqlite`, unit
`dolly-workaround-removal-build-b`, started 11:30, ready 11:39: base64, dte,
emacs, gnu-emacs, sqlite, tree and vi built in 226 s, the rest reused).
Emacs's recipe ran the three gzip steps and its check printed `31.1 dolly`
after the `subr.el.gz` assertions; the emacs snapshot is 146,020,081 bytes
against 141,230,250 before the sources came back (+4.8 MB, 3.4%), `emacs.log`.

Tests on B: `npm run test:demos -- emacs` passed (gnu-emacs in Chromium 7.3 s
and Firefox 8.9 s; the emacs package into default in Chromium 6.9 s),
`emacs-test.log`; `packages-b.log`: tree, dte, base64, vi and sqlite pass in
Chromium (5.7 s) and Firefox (8.3 s), licences, README and man pages included.
Studio's path claim has its existing check: `test/amy-browser.mjs` asserts
`/usr/share/doc/dolly/docs/dollyfile.md` after `amy install dolly-docs`.

Build C (B plus `x11-desktop,tmux`, bigbuild for the server, unit
`dolly-workaround-removal-build-c`, started 11:39, ready 11:53: 25 images
built in 692 s, python, x11-build, pixman, libxkbfile, xkbcomp,
xkeyboard-config, xorg-server, sdl2, imgui-x11, twm, xclock, xeyes, xterm,
tmux and x11-desktop among them). The logs show libxkbfile's and xkbcomp's
archives extracted by the core tar and xterm's GitHub archive moved into
place (`build/image-logs/`). The three ran serially in this one tree, each
catalog a superset of the last.

Tests on C: `npm run test:demos -- x11` passed in Chromium (39.6 s; the
demo's test runs Chromium by default), `x11-test.log`, and in Firefox
(`node demos/x11/test/x11-browser.mjs firefox`, 45.1 s), `x11-test-firefox.log`.

## Lessons

- A workaround's comment outlives its cause by weeks: three "pax header"
  stagings were written for a tar that reads pax headers since dbf38965, and
  none of the archives even has one now (the GitHub archives lost theirs). What
  stays needed is links, which no comment named. Measure the archive, not the
  comment: the native build of `src/commands/tar.c` takes a second and settles
  each claim.
- `update-recipe-pins.mjs` reads `SOURCE` bytes from `dist/static`, and the
  staging refuses stale pins: a new `SOURCE` path needs a plain pin run, then
  the staging (which repins sources), in that order. Splitting one working
  tree into pin-consistent commits is cheapest done before the build takes a
  slot, with a throwaway `wip` commit as the source of each item's files.
- One recipe's pin cascades: changing `Dollyfile-sqlite` (linenoise) touched
  70 recipes through python. On a seed-change branch that costs nothing; on
  `main` it is a catalog round, so such a change belongs with one.
- Image builds are faster than their reputation: the x11 closure (python,
  sixteen X libraries, the server, SDL2, xterm, tmux: 25 images) built in 692 s,
  the 10 of cmake, binaryen and zsh in 3159 s, Emacs's seven in 226 s, Mojo's
  three in 4611 s. Planning the day around "hours per closure" nearly left the
  Mojo item as a finding; measuring the first build and re-planning won it.
- A test table that installs every package cannot run on a narrowed catalog:
  a short script that reuses its commands for the rebuilt packages does, and
  found that `default` has no `gzip` command before it found anything about
  pigz. Read what the table installs before the row you copy.
