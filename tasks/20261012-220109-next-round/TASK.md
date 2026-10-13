# What waits for the owner and the next catalog round

- STATUS: OPEN
- PRIORITY: 150
- TAGS: catalog,owner,packages,host-modules

State (2026-10-14, 06:15). In the night of 2026-10-14 the owner's feedback
of the evening was done and verified without a round (a minimal `ps`, tmux's
two defects, the CPU/GPU column out, `javascript` split into `quickjs`,
`janis` and `typescript`, the four-part Qwen model out), and every point of
the two reports he called too blunt was investigated without deciding. What
waits for him is below, first the questions, then what a round would carry.
Nothing below is started. Each item is the owner's to take or leave.

Done when: each item is in a round that passed, or is dropped here with the
reason.

## Questions the investigations leave to the owner (2026-10-14)

Each task holds its report and a summary; none gives a verdict.

The language:

- [What a package needs only to build](../20261013-144754-build-needs/TASK.md):
  a base image per set of tools, as today, or a way to say it in the
  recipe. Every investigation of builds came back to this.
- [What a library package declares of host modules](../20261013-175624-library-hosts/TASK.md):
  what every program built with it needs, or nothing because its archive
  stamps nothing. `sdl2` and `mojo` answer differently today.
- [The words to retain, export and require](../20261013-144241-dollyfile-words/TASK.md),
  [`COPY`](../20261013-144241-copy-directive/TASK.md),
  [the three roles](../20261013-144241-roles/TASK.md),
  [`SLOP` and `RUN`](../20261013-144241-slop-and-run/TASK.md): each has a
  design record or a ruling of his that the reflection had not read.
- [Eight toolchains called build-only have an `ENTRY`](../20261013-161624-build-only-entry/TASK.md):
  which of the two is meant.

The process contract and the kernel:

- [File modes](../20261006-120641-umask/TASK.md): whether "one user, no
  permission bits" covers a bit that is kept and not enforced; a branch that
  stores and enforces is built and waits.
- [The line discipline](../20261013-144241-line-discipline/TASK.md): never
  decided away; the question was filed on 2026-10-01 and not taken.
- [`SPAWN_INTERACTIVE`](../20261013-144241-spawn-interactive/TASK.md),
  [`runtime.h`](../20261013-144241-runtime-h/TASK.md),
  [the twin operations and module numbers](../20261013-144241-contract-twins/TASK.md).
- [Who holds a terminal](../20261013-154704-terminal-holder/TASK.md) (tmux's
  window names): what a process may learn about another.

The browser runtime and the boundary:

- [What every page ships for tests](../20261013-144241-test-surface/TASK.md):
  what `__dolly` is, put to him four times since 2026-09-30.
- [The supervisor's own tree and limit](../20261013-144241-supervisor-mirror/TASK.md),
  with the memory budget decided on 2026-10-01 and not built.
- [Chrome keeps a terminated Worker for two seconds](../20261013-183624-worker-two-seconds/TASK.md):
  three measured lines, not committed.
- [Emacs runs out of stack in a fresh Chromium](../20261013-202443-emacs-stack/TASK.md):
  how a program that needs more stack than a Worker gives gets it.
- [The recipe language parsed twice](../20261013-144241-recipe-parsers/TASK.md)
  and [the one list nothing compares](../20261013-170737-receipt-hosts/TASK.md).
- [The broker's list of credential header names](../20261013-190106-credential-headers/TASK.md).
- [The mouse in the terminal](../20261013-154704-terminal-mouse/TASK.md).
- [Tests that assert wording](../20261013-191218-wording-tests/TASK.md): half
  of them have no other way to tell one refusal from another.
- [Every provider's script is loaded on every page](../20261013-192655-providers-loaded/TASK.md):
  41 KB of 1.2 MB on `default`, and importing one does nothing to the page.

Host modules:

- [Headers and clients in the seed](../20261013-144241-module-sdks/TASK.md).
- [The touch module](../20261013-144001-touch-module/TASK.md): the
  groundwork is gathered, sixteen questions, the contract is his.

Builds as packages ([overview](../20261013-142800-generic-builds/TASK.md)):
[SpiderMonkey and the 0 A.D. libraries](../20261013-145359-builds-zero-ad-deps/TASK.md),
[the base images](../20261013-145359-builds-root/TASK.md),
[the views](../20261013-145359-builds-views/TASK.md),
[the engines](../20261013-145359-builds-engines/TASK.md),
[what is compiled twice](../20261013-145359-builds-twice/TASK.md).

What a round costs, image by image, from the logs
([the measurements](../20260930-100000-audit-53/round-costs.md)): 5.1 hours
of single builds, a longest chain of 1 h 49 min, and a `system-tools` change
within 4% of a seed change because the six long images all sit below
`cmake-build`. An unchanged `npm run image -- codex` takes 80 to 87 s
([iteration cost](../20260930-100000-audit-53/TASK.md)).

Also his, from before the night:
[three answers only he can give](../20261012-232215-owner-answers/TASK.md),
[slopshare.dev](../20261011-134500-slopshare/TASK.md), and
[the two terminal flakes still open](../20261001-095000-terminal-text-flake/TASK.md), which were not
reproduced: 0 of 160 drags, no failed screen read in about 9,000.

## The audit's ranking, as the owner reads it

[The audit of 2026-10-13](../20261012-230015-audit-fable/TASK.md) ranks
thirty items and eight of the boundary. The owner, the same night: complete
rebuilds are intentional ("robust and reliable"), and he wants backward
compatible versions. So its items 1 and 5 (the release version out of
references, recipe digests no longer written into `FROM`, `INSTALL`, `COPY`)
are dropped, and nothing here is wanted because it rebuilds less. What he
does want is the core right, small and clean:
[is the core in line with the direction](../20261013-142800-direction/TASK.md)
re-reads the reports for that, and
[builds become generic](../20261013-142800-generic-builds/TASK.md) is what he
meant by packages. Until those say otherwise, the audit's items that make
the core smaller stand as candidates: 3 (what the ABI digest hashes), 8 to
11 (`REQUIRES TOOL`, the names of `EXPORTS FILE|FOLDER`, a body for `SLOP`,
licences and manual pages by convention), 13, 14, 16 (`runtime.h`, the twin
operations, operation numbers per module), 2 and 22 (the modules' SDKs and
the builds as packages).

## Left by the round of 2026-10-13

- `python` stops installing `ninja`, by the owner's word
  ([task](../20261013-132701-python-ninja/TASK.md)): its recipe repins the
  chains that build with Python.
- The terminal does not turn Enter's carriage return into the newline a
  program reading a line waits for: `unzip` and `zstd` wait at their
  overwrite question until Ctrl+J. The measurement and a design are in
  [more packages](../20261012-230015-more-packages/TASK.md) (audit 17).
- `pty@0`: a spawn that is not the caller's child (tmux starting its own
  server), a terminal recorded per process, `pipe-pane`
  ([tmux](../20261012-130814-tmux/TASK.md)).
- `nena@0`: credential stripping by a list of six header names, the test
  surface every page ships, every provider's script loaded on every page,
  the page's own parser of recipes (audit B5 to B8).
- `amy`: the file list without the download, `remove`, and a failed start
  naming the package (`src/slop.c`).
- Packages wanted and not made: `chmod` (waits for
  [file modes](../20261006-120641-umask/TASK.md)), `file`, and formatted
  pages for `less`, `ninja`, `posix`, Python, Emacs, Cargo, Rust, `fd`,
  CMake ([man and --help](../20261005-220754-man-help/TASK.md)).
- The fluid demo's GPU test passes in Chrome on the GPU; its Firefox half
  does not (2026-10-13, not attributed, and never run by a round before the
  runner was fixed today): Playwright's Firefox draws no frame on an Xvfb
  display and the wait times out; started as the installed Firefox, as
  Mojo's test does, it draws and then fails "Smoke mode did not change
  pixels".
- At their next rebuild: `xonotic-build` and `wine-build` install `libpng`
  and `freetype`; `gamedev-sdk` drops its `/usr/lib/libm.a`.
- `qwen3.5-4b` and its four shards left the catalog on 2026-10-14
  ([task](../20261013-143039-qwen-4b-out/TASK.md)); the limit that split it
  is recorded there.
- From tmux in use ([task](../20261013-133111-tmux-use/TASK.md)), each a
  task now: [the terminal reports the mouse to no program](../20261013-154704-terminal-mouse/TASK.md)
  (`src/ghostty/display.c`, an image input);
  [nothing can ask which program holds a terminal](../20261013-154704-terminal-holder/TASK.md)
  (tmux's window names, a new pane's directory);
  [CJK and emoji are boxes](../20261013-154704-terminal-glyphs/TASK.md). The
  comment on `dolly_terminal_write_bytes` in `abi/dolly-supervisor-0.wat` is
  corrected (2026-10-14).
- Small stale things for a round, none a decision:
  [comments that still say `COMPILEC`, the parser's `kind`, two wrong comments](../20261013-160335-stale-words/TASK.md).
- `mojo run`'s refusal says what to type instead
  ([task](../20261013-134032-mojo-run-message/TASK.md)), with the next
  rebuild of `mojo-build`.
- The kernel is compiled with `-Wall -Werror` since 2026-10-14, with the
  same bytes as before; the process side, which is in the seed, is not yet
  ([task](../20261013-212251-core-warnings/TASK.md)).
