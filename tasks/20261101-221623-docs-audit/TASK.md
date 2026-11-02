# Audit: every claim in the documentation, against the code

- STATUS: OPEN
- PRIORITY: 260
- TAGS: docs,audit

## State (2026-11-02)

On `core/docs-audit` (from `integrate/2026-11-02`, fa949c1b). Every document of the scope was
read and its claims checked as listed below; wrong ones are fixed, gone ones cut. One seed
change, `tar` (705de088), needs a catalog round. What is left: the findings below, each for
the owner of its code.

Scope: `README.md`, `docs/*.md`, `host/README.md`, `abi/README.md`, `demos/*/README.md`,
and the help texts and manual pages the core ships. Method: each document's factual claims
(an operation exists, a limit, an option, a test, a path, a measurement) checked against the
code or by running it; a wrong document fixed, a gone feature cut, a claim the code should meet
but does not filed here as a finding.

## Per document

### README.md

- `gzip` compresses since 68824453 (the night): the core image list said it only unpacks
  (`gzip -dc`) and that `pigz` writes `.gz` files. `display` holds three fonts, not one.
- The turnaround table, re-measured on 2026-11-02 on this machine while the integration round
  and four other agents ran (load 18 on 16 cores): `npm run test:source` 29.4 and 29.6 s (was
  20 s); `test:core` 27.9 s in Chrome and 39.1 s in Firefox (was 24-32 and 32-68 s); a
  no-change `npm run build:runtime` 15.0 and 15.1 s (was 9-12 s); a no-change
  `npm run image -- default` 3.1 and 3.8 s (was 3 s); `gzip`'s build 4.1 s (the cell's
  "9 s to rebuild gzip" was end to end, not re-run: the build slots were taken); the seed
  rebuild of `default`, `cc`, `git` and `less` 970 s for 19 images at
  `DOLLY_IMAGE_JOBS=1` (was 888 s for 15, zig-build alone 598 s now); the browser suite
  442 s on 2026-10-31 (`work/x11fix/build/rc-1031b-evidence/browser.log`). `test:artifacts`
  needs every image current and was not run: its number is dropped.

### docs/architecture.md

- The core image diagram missed `gzip` among `system-tools`' packages (installed since
  5ec4783c, 2026-10-01). The sentence naming which images install `amy` and `transfer` was
  partial (`x11-desktop`, `tmux-panes` and `ghostty-x11` install `amy` too); it now says
  the rule only.
- Checked: 56 processes (`process-supervisor.mjs`, `process-kernel.c`), 1 MiB packets
  (`process.h`), 1 MiB file blocks and the 128 MiB reserve (`file-blocks.cpp`), `chmod` and
  `chown` (`libc-adapter.c`), `/tmp` and `/workspace` kept empty (`system-snapshot.c`),
  `/run` out of sessions (`session-records.h`), `xargs -P`.

### docs/dollyfile.md

- The host-module examples were wrong: `sdl2` declares `audio@0` and `touch@0` too, `rust`
  `dso@0` as well as `threads@0`.
- "FROM and only EXPORTS (`cc`, `cmake`) or COPY rows (`nvim`, `rust`, `codex`)": `cmake`,
  `nvim` and `codex` hold their builds (SLOP steps, no COPY). Now `cc`, `zig`; `display`,
  `rust`, `cargo`, the packages that do.
- Checked: 128 KiB and 64 KiB text limits (`dollyfile.c`), the role table against the
  recipes, `system`'s and `default`'s host lists, `amy`'s subcommands, the image logs'
  path, Studio's composition.

### docs/slop.md

- Cut the dated native `configure` survey (2026-10-06, a task path in a shipped document): it
  cannot be re-run today, and "once `umask` exists" reads against the owner's decision that
  `umask` stays refused.
- Checked: the builtin list against `builtin_name()` and the refusals against
  `unsupported_builtin()` in `slop.c`, 1,000 history entries, 32 background programs, the
  interrupt poll every 64 commands, `nproc` printing 4, Samurai's two jobs for one processor
  (`samu.c`), Make 4.4.1, `tar` extracting only, `ls -l`'s KiB total.

### host/README.md

- The provider's records missed `configuration` and `transfers`, through which the page side
  hands its Worker side data and objects (the display's and the GPU's canvas, the snapshot's
  bytes). Checked every `module.json` field against the table, the runtime-machinery list
  against what each provider imports outside its directory, and the `package` field's modules.

### abi/README.md

- The contract table had no row for `sockets@0` and `pty@0`. Operation numbers checked against
  the generated headers (112-123 dso, 116 stack, 128-133, 160-169 sockets, 176-177 pty).

### docs/browser-boundary.md

- The trusted-files map missed `src/sha256.mjs` (imported by `packaged-snapshot.mjs`) and the
  runtime's generated modules the page imports (`dist/dolly-build-id.mjs`,
  `dist/dolly-image-build-id.mjs`, `dist/dolly-process-abi.mjs`): found by walking the static
  imports of `browser.mjs`, `site.mjs` and the Worker entries.
- Checked every number of the module table against the code: 16 HTTP slots, download and upload
  1 MiB chunks and 1 GiB, 4 waiting offers, the 2 s upload quiet time, touch 10 fingers and
  512 records, GPU 8 scopes, 4,096 objects and 4 GiB, audio 4 streams of 48,000 frames,
  microphone 96,000 frames, 64 package snapshots, 20 MiB parts and the 2 GiB snapshot bound,
  the 32-image, 8 GiB cache, the fixed modules and `buildHost`.

### docs/display.md, docs/sessions.md, docs/sources.md

- display: "`system` copies only that plugin": the `display` package does (eight `COPY` rows).
  Font sizes measured: Droid Sans Fallback 3,451,744 bytes, Noto Emoji 880,860.
- sessions: cut "saves made before 0.1.0 are not carried over" (about a release that is gone).
- sources: the image build ID's inputs named "its loader", `dolly-seed.mjs`, gone since
  97c34d4d; `write-build-id.mjs` hashes `dolly.data` and four contracts.

### docs/deployment.md

- Re-measured the archive (`work/locks/published`, read only, with `pagesHeaders` of
  `export-cloudflare-pages.mjs`): v0.1.4 is 3,785 files and 21.9 GB and alone needs 55
  header rules (6 + 37 sources by path + 12 packs by content); the five published versions are
  14,037 files and need 92 of Pages' 100 rules. The 2026-10-08 figures (71 images, 2,139 files,
  45 rules, "nine versions fit") are replaced. The packing figures of a 67-image catalog
  (221 MB peak, 3.5 minutes) are dropped: not re-measured.

### docs/licences.md, README.md

- 12 files carry the GPL marker, not 10: the Xonotic port added `dpgpurast.c` and
  `dpshaders.c` (2026-10-27). README's own list was a stale copy of licences.md's; it now
  links there.
- The Claude Code row linked a task, which a `docs/` page may not.

### docs/gpu.md

- Chrome's row of the adapter table measured again (`build/docs-audit-evidence/gpu-hardware.mjs`,
  Chrome 156 with Vulkan WebGPU on Xvfb :134, driver 580.178): `high-performance` and no
  preference both get `nvidia blackwell` without `shader-f16`; with
  `--use-webgpu-power-preference=force-low-power`, `amd rdna-2` with it. As the table says.

### docs/embedding.md, docs/agent-frontend.md, docs/image-build-service.md, docs/http.md, docs/input.md, docs/audio.md

- No wrong claim found. Checked: the npm package split in `package-npm.mjs` (`runtimeModules`,
  `dolly-host-save`), `pi-minimal`'s modules and installs, `boot()`'s options, pi-minimal's
  packs (27.5 MB encoded, measured on this branch's and the integration tree's metadata),
  the tests the frontend guide names, the build service's 128 KiB, 8 MiB, 45 minutes, 10 s,
  409 and 400, the HTTP caps and defaults (`policy.mjs`), curl 8.21, the input record size and
  touch reserve (20), the terminal padding 12 by 10, the GPU quotas and feature bits, the audio
  and microphone constants.

### Limits the documents did not name (found reading the kernel and engine)

- `process-model.md`: the kernel holds at most 64 pipes (`DOLLY_KERNEL_PIPE_LIMIT`, an open
  of `/proc/processes` among them; one more is `ENFILE`), and an executable file is at most
  512 MiB (`DOLLY_KERNEL_EXECUTABLE_LIMIT`, `ENOEXEC`). Sockets (128) and pseudo-terminals
  (32) had their bounds there; pipes had not.
- `sessions.md`: a save holds at most 100,000 paths (`DOLLY_SESSION_MAX_RECORDS`), and `/proc`
  is excluded with `/run` and `/dev` (`session-records.h`). `dollyfile.md`: an image retains
  at most 100,000 paths (`MAX_MANIFEST_FILES`).
- `embedding.md`: since the night (becd6a08, 7dbcfc88, f8fe3878) everything Dolly shows stays
  in `boot()`'s element and keys typed outside it are the page's; one sentence says so. The
  npm `default` package holds no package index, so its "`amy` lists what is installed and has
  nothing more to install" is now what the code does: `amy installed` lists, `amy list` and
  `amy install` fail naming the index (read from `amy.c` and `http.mjs`'s site, the image
  directory; not run).
- `browser-stack.md`: the supervisor's probe re-measured with its own module in a Worker on
  2026-11-02: Chrome 156 nests 2,761 calls directly and 5,252 through `promising` (1.90),
  Firefox 155 5,891 to 5,906 and 5,957 (1.01), 12 runs each, against Chrome 151's 2,766 and
  5,252 and Firefox's 5,900 and 5,957. The task paths in that shipped page are gone.
  `process-model.md` repeated the stack sizes; it links the page instead.

### The process model and Slop pages, run in `system`

`build/docs-audit-evidence/claims/` (a C program and shell lines, Chromium and Firefox, the same
answers in both): `getrlimit` 1024 descriptors, 56 processes, 8 GiB and an 8 MiB stack, and
`setrlimit` to less fails `EPERM`; `_SC_OPEN_MAX` 1024, `_SC_NPROCESSORS_ONLN` 1 (4 with
`-pthread`); `kill -s CHLD` of another process "Not supported"; `statvfs` 2,097,152 blocks of 4 KiB (8 GiB, the kernel's maximum) with 0
files; `ttyname` fails (`ENOENT`) and `tcgetpgrp` with `ENOTTY`; `fork` and an `AF_INET`
socket `ENOSYS`; `nice(1)` `EPERM`; `pipe` succeeds 64 times, then `ENFILE`;
`readlink /proc/self/exe` the program's path;
`uname` "Dolly", `uname -sm` "Dolly wasm64", `cc -dumpmachine` `wasm64-unknown-dolly`, `nproc`
4, `hostname` dolly; `echo --help` prints `--help`; `test -x` of a directory is true;
`/dev/zero` and `/dev/tty` are character devices; `ls /proc` lists `processes`, whose lines
are `PID PARENT STATE COMMAND`; `command -v` of nothing ends with 1, sbase's `which` with 2
and "not an external command". All as the pages say.

### Demo READMEs

Each README's image list matches its recipes (checked by script; the lines feed `amy-index.txt`).
Changed where a claim was wrong, mostly a core behaviour the night changed:

- `tools`: `pigz` "writes the `.gz` files `gzip` here only reads" and `tar`'s "(pigz writes
  `.gz`)": `gzip` compresses (68824453). "Dolly's `tar` reads files and directories; an archive
  with a pax header is staged": it reads pax headers since dbf38965. The staging comment in
  `prepare-sources.sh` gave the same stale reason.
- `emacs`: no installed Lisp sources "(Dolly's `gzip` cannot compress them)": the reason is gone.
- `ffmpeg`: the two workaround flags are gone (Findings); its network failure measured again
  (`build/docs-audit-evidence/ffmpeg-network.mjs`, Chrome): since 4cb57a1b a numeric host
  resolves, and `tcp:` and `udp:` fail at `socket()` with "Function not implemented", `http:`
  with an I/O error (the README said `tcp:` could not resolve `127.0.0.1`). The build figures
  are this tree's: configure 439 s, `make -j4` 184 s, 2,052 objects, 79 MB, the programs
  21.3 and 21.1 MB; the "at most 2.7 GB" of memory is dropped, not measured.
- `mojo`: the reason for `llvm-wait.patch` was fixed in the night (bbec81cc); the README says so.
- `zsh`: "`time` reports elapsed time only: Dolly's `wait` reports no resource usage": `wait4`
  reports a child's times as zero since bbec81cc; the port is configured without `wait3`.
  "Dolly has no `fork` or `exec`": `execve` is in the process contract since ba5f2568
  (2026-10-23), a week after the port; its `exec` still spawns and waits (Findings).
- `tmux`, `speech`: `amy install` in `default` is refused "since default does not declare"
  `pty@0`/`microphone@0`, and `speech` said `default` lacks `touch@0`, which it declares;
  `nena enable` gives the module (`tmux-browser.mjs`'s "tmux in ps" case does it).
- `neovim`: "No PTY `:terminal`, tmux": tmux runs (its own demo); `:terminal` fails because
  `nvim` is not linked with `-ldolly-pty`.
- `x11`: the patch's line count (48 added) was 55; dropped, it rots with every hunk.
- `wine`: built "with the FreeType that `zero-ad-deps` built"; `wine-build` installs the
  `freetype` package. `demos/README.md`: `tools` listed `mandoc` (a core package) and not
  Binaryen; `xonotic` "drawn by its software rasterizer" draws on `gpu@0` too.
- Pi's `dolly` skill: "`amy install tar` brings a `tar` that writes `.tar`; its `-z` fails
  here": sbase's tar runs `gzip -cf`, which the core gzip now does (checked natively, not in
  a browser); and the host clients that link without `-l` exclude sockets and pty, as for
  `cc --help` below.
- `slopyard`: `Dollyfile-slopyard` listed twice.
- Studio's `dollyfiles` skill: "ripgrep and fd need `threads@0`": they declare `http@0` too.
  Its staged `studio.tar` holds `docs/dollyfile.md`, which this branch changed, so it is
  staged again and repinned (the build-source-tar command of `demos/studio/prepare-sources.sh`).
- Checked without change: versions against `config/source-pins.sh` (SDL2 2.32.10, Lua 5.1.5,
  xorg-server 21.1.25, xterm 412), `zero-ad`'s 1.94 GB image, `parakeet`'s 135 MB, Studio's
  docs (staged by its `prepare-sources.sh`), the cmake-build dependents, the JavaScript
  packages' bases, `pi-minimal`'s installs, the X screen size.
- Not changed: `lean` (E's tree today); its `prepare-sources.sh` stages Lean's source because
  "its archive starts with a pax header, which Dolly's tar does not read", no longer true.

### Help texts and manual pages (seed inputs)

- Built natively (`gcc`, a two-function spawn stub) and ran every option each `--help` lists:
  `ls`, `cp`, `mv`, `rm`, `mkdir`, `cat`, `stat`, `touch`, `file`, `du`, `env`, `find`,
  `xargs`, `timeout`, `time`, `hostname`, `pwd`, `realpath`, `install`, `gzip`, `tar`: all
  accepted. `help`'s limits match the code (1024 descriptors, 8 GiB, 56 processes, 32/64
  threads, 64 KiB pipes); `echo.1` and `test.1` (recipe bodies) match `echo.c` and `test.c`.
- `tar` failed on a pax archive whose extended headers carry no path: GNU tar `--format=pax`
  writes one of times before every member, and macOS's bsdtar writes them for extended
  attributes (`tar: -: read extended header: No such file or directory`). slop.md promises pax
  archives. Fixed in `src/commands/tar.c` (a seed input) with a case in `test/tar.test.mjs`
  that failed before.

## Findings (claims the code should meet but does not)

- FFmpeg's configure inside Dolly took 65 s on `demo/ffmpeg` (f18ddab7, 2026-11-01 22:01),
  with Slop running `[`, `test` and `echo` itself (P6 of the Slop audit, in ad78dbef); 68bbd7d9
  moved that to `proposal/slop-utilities` eight minutes later, and the same configure took 344 s
  in the integration tree (06:55) and 439 s here (08:30). The audit counted 75,504 processes
  for it, 61,009 of them `[` and `test`. Evidence for the owner's P6 decision, not a defect.
  Measured beside it, for agent M (`tasks/20261101-102515-retained-process-memory`): with
  `#disposeWorker`'s `reportGarbage` commented out, 200 runs of `/bin/true` took 1.59 s
  against 1.70 s in Chrome and 2.67 against 3.18 s in Firefox, 40 `cc -c` 1.46 against
  1.55 s and 1.82 against 2.24 s (`build/docs-audit-evidence/spawn-bench.mjs`, one run each,
  `system`): the collector hint costs 6% in Chrome and about 20% in Firefox on short processes.

- A save of more than 100,000 paths fails with "Dolly session capture failed with status -1"
  (`host/snapshot/transport.mjs` names only the 512 MiB limit, `EFBIG`); `E2BIG` deserves the
  same plain message. Page JavaScript, no seed input.

- Workarounds whose cause the night removed, each a demo change for its owner. Done here for
  FFmpeg, the one cheap to rebuild: its recipe drops `--optflags=-O3` and
  `--disable-resource-compression` (68824453 was made for both); the image builds, its make
  prints `GZIP fftools/resources/graph.html.gz`, and `ffmpeg-browser.mjs` now also requires
  `ffmpeg -version` to say it was built with Clang (an unknown compiler gets no optimization
  of its own). The rest: `demos/mojo/llvm-wait.patch` (`wait4`
  takes a usage record since bbec81cc); `demos/emacs/Dollyfile-emacs` leaves the Lisp sources
  out because "Dolly's gzip only decompresses"; the plain-tar stagings of
  `demos/tools/prepare-sources.sh` (jq, zstd, lz4, Binaryen, ...), `demos/x11/prepare-sources.sh`
  (xterm) and `demos/lean/prepare-sources.sh` exist because tar read no pax header, which it
  does since dbf38965 (links stay refused, so each needs its archive checked); for the same
  reason the x11 recipes `Dollyfile-libxkbfile`, `-pixman`, `-xkbcomp`, `-xkeyboard-config`
  and `-xorg-server` install the tools demo's `tar` ("reads the pax headers of X.Org's
  archives"). Recipe comments that give the old reasons, changed with those recipes:
  `Dollyfile-pigz` (gzip "only reads"), `Dollyfile-tar` ("The gzip of the core reads .gz;
  pigz writes it"), `Dollyfile-emacs`. And `demos/zsh/zsh-dolly.patch` ("Dolly has no fork or
  exec") makes zsh's `exec` and the last command of `zsh -c` spawn the program and wait for it;
  Dolly's `execve` (ba5f2568) would let them replace the shell, as upstream does.
- `cc --help` says the `<dolly/NAME.h>` host clients link without `-l`; `sockets@0`'s and
  `pty@0`'s need `-ldolly-sockets` and `-ldolly-pty` (`host_client_libraries()` in
  `compiler.cpp`). The text is the seed compiler's, so it waits for the next compiler round.
- Studio stages its own copies of `docs/dollyfile.md` and `docs/image-build-service.md`
  (`demos/studio/prepare-sources.sh`, read by its skill at `/usr/share/dollyfile-studio/`)
  although its base installs `dolly-docs`, which holds both under `/usr/share/doc/dolly/docs/`.
- Pages' header rules (measured above): the deployment of v0.1.4 uses 92 of 100. The exporter
  fails at 100 naming the versions, by design, and removing a version is the owner's act; the
  next release should expect that choice if it adds more than eight large files that the
  published versions do not store the same way.

## Not checked

- Dated measurements kept as records, not re-run (each gives its date or browser): the
  browser-stack page's compile limits, LLVM and `stack@0` figures (only the probe was re-run);
  `gpu.md`'s Firefox row (needs the owner's display; Firefox under Xvfb gives no adapter);
  `local-llm`'s model table, `zig`'s and `zsh`'s timings, `ghostty-gtk`'s frame times,
  `speech`'s phone, `xonotic`'s frame rates, `zero-ad`'s Firefox note, `rust`'s third
  generation. Undated build times that need a 9 GB or larger slot: `codex` (70 minutes),
  `llvm` stage 2 (50 minutes, 7 GB), `mojo-llvm`, `wine` (330 s).
- Prose about upstream programs' behaviour inside Dolly (Pi's, Claude Code's, Wine's, Codex's
  features and failures) where no test names it: read for contradictions with the core only.
- `docs/agent-frontend.md`'s hand checks of 2026-10-31 (Copilot, Bedrock through a relay).
- `site-release.mjs accept` holding "about twice the largest image": not measured.

## Lessons

- Rot follows behaviour changes into the places that give the old limit as a reason. 68824453
  (gzip compresses, `cc -v`) fixed `slop.md` and Pi's skill, and left README, four demo
  READMEs, three recipe comments and two FFmpeg configure flags saying the opposite. When a
  commit lifts a limit, `git grep` the limit's own words ("only decompresses", "pax header",
  "refuses a usage record") across `demos/`, recipes and prepare scripts, not only `docs/`.
- Enumerations rot; rules do not. Every wrong list was a list: GPL files (10, 12 now), which
  packages hold their build (`cmake`, `nvim`), the core images of a diagram, the trusted files
  of the boundary map, the contracts of `abi/README.md`, which images install `amy`. A
  sentence that states the rule (a package built on `system-build` reaches only the images
  that install it) stays true; a list belongs where a test or a generator keeps it whole.
- Numbers without a date read as current and mostly were not: the archive's 2,139 files were
  3,785, the turnarounds of the README's table had all moved, FFmpeg's configure took 65 s on
  its branch and 344 s after the night's merge. Re-measuring them found one real limit (92 of
  Pages' 100 header rules) and one regression worth a look; a number that cannot be re-run
  should carry its date or go.
- Reading the kernel's and engine's `enum`s against the documents found limits nobody had
  written down (64 pipes, 512 MiB executables, 100,000 paths a save or an image holds); the
  documents listed the bounds of the newer modules (sockets, ptys) and not of the old core.
