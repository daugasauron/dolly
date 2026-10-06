# Investigate: images that enter their program without a shell

- STATUS: OPEN
- PRIORITY: 295
- TAGS: core,process,images,investigation

Owner direction (2026-10-06): many programs never start another process, and
the project first worked without subprocesses. An image can only omit a
subprocess module if it does not need a shell to start.

## Today (main `230fd887`)

Every one of the runnable images enters through `/bin/foreground -i
/bin/slop …`: Slop spawns the program, `foreground` gives it the terminal and
Ctrl+C, and a recovery shell follows when it exits. `ENTRY /program` directly
is legal Dollyfile 6 but no image uses it.

## Questions

1. What does an image whose ENTRY is its program lose: the recovery shell,
   `foreground`'s interrupt handling, `.dollyrc`, environment set-up from
   `/etc/dolly/environment`? Which of these does the runtime already give the
   ENTRY process itself (the terminal mailbox interrupts a foreground ENTRY,
   `test/host-compute-browser.mjs`)?
2. What should the page do when that program exits or traps: show the status
   and offer a restart, nothing more? Sessions: can such an image be saved
   and restored?
3. What does it gain, measured: boot time to first frame, image size without
   Slop and the core commands, trusted code not exercised.

## Measure

Build one existing graphics demo both ways (for example `gpu-fluid`: as today,
and as `ENTRY /usr/bin/…` with only the packages it needs), in Chrome and
Firefox, and record the differences. The touch demo
(`20261005-222057-touch-input`) should be designed as the first such image if
the result holds.

## Done when

- The comparison and a recommendation are recorded here: whether direct-ENTRY
  images are a supported shape, what the page and runtime must add for them,
  and what the docs should say. The owner decides.

Related: `20261005-222449-spawn-users`.

## Findings (2026-10-06, `investigate/spawn`)

Tried on the sealed release `work/round2/build/releases/current` (build
`5439ebe7`, the line before the seed round, so its recipes carry no
`runtime@0` line) through the custom route, which builds a recipe in the
page. `run/` holds the probe ([`probe.c`](run/probe.c)) and the scripts:
[`run.mjs`](run/run.mjs) `direct|wrapped|root|rootwrapped [scenario…]`,
[`timing.mjs`](run/timing.mjs) `A B` and [`fluid.mjs`](run/fluid.mjs).

Limits: headless Chrome for everything, headless Firefox for the timing only;
the GPU runs used a software adapter that stops after one frame, so `fluid`
was measured to its first frame and no further.

### Today's ENTRY lines

All 37 runnable images of 61, in the release and in this checkout:

| ENTRY | Images |
| --- | --- |
| `/bin/foreground -i /bin/slop` | 24: toolchains, SDKs, `system`, `minimal`, `pi-runtime` |
| `/bin/foreground -i /bin/slop /etc/dolly/init.slop` | 10: `default`, `bhop`, `classicube`, `codex`, `dollyfile-studio`, `gnu-emacs`, `neovim`, `pi`, `pi-local`, `rts-arena` |
| `/bin/foreground -i /bin/slop /etc/dolly/NAME.slop` | 3: `gpu-fluid`, `slopyard`, `zero-ad` |

The generators and `src/custom-dollyfile.mjs:20` emit the same form. A direct
ENTRY exists only in a test without a display
(`test/host-compute-browser.mjs:65-83`).

What the wrapper is, by its parts:

- `foreground` is 35 lines (`Dollyfile-system-build:328-362`): it spawns its
  argument with the foreground role and waits. It sets up no terminal. Its
  `-i` gives the child the interactive role (Ctrl+C goes to the child's
  children first), which the page cannot give: it starts ENTRY with the
  foreground role only (`src/process-supervisor.mjs:162-164`).
- `slop` without a file is the interactive shell: `/workspace`, history, its
  own SIGINT handler (`src/slop.c:4791-4816`). With a file it runs the script.
- `~/.dollyrc`, starting the program and the recovery shell are lines of the
  image's script (`Dollyfile:17-28`), not of Slop or the runtime.

At boot that costs three processes before the program: of the 125 processes
the 34 measured images start, 86 are `foreground` or `slop`
(`20261005-222449-spawn-users`).

### What the runtime gives the ENTRY process itself

A probe that prints what it sees (`run/probe.c`) as `ENTRY /usr/bin/probe`,
against the same probe behind `/bin/foreground -i /bin/slop probe.slop`:

| | Wrapped | Direct |
| --- | --- | --- |
| Processes, probe's pid and parent | 4, pid 103, parent 102 | 1, pid 100, parent 0 |
| `isatty` 0-2, window size, termios | yes; 26x157; ISIG, ICANON, ECHO, OPOST | the same |
| Environment, cwd | the image's 11 variables, `/` | the same |
| Keyboard input | arrives | arrives |
| Ctrl+C with a handler | handler runs | handler runs |
| Session save and restore | works | works; restore starts ENTRY again |
| Reload | restarts | restarts |

The page already starts ENTRY with the foreground role
(`src/runtime-worker.mjs:65-68`), the image's environment
(`src/dolly.c:339-405`), `HOME` and `/workspace` (`src/dolly.c:260-264`) and
Ctrl+C (`host/display/input.mjs:94`, `host/runtime/runtime.mjs:56-61`). So a
direct ENTRY loses only what the script did: `~/.dollyrc`, `/workspace` as the
working directory of an interactive shell, and the shell that follows the
program.

### What breaks: every way the program can end

| The program | Wrapped | Direct |
| --- | --- | --- |
| exits 0 or 3 | last output, then a shell prompt | `data-dolly-status="exited"`; the last output is never painted; a frozen terminal with a cursor; no message; keys do nothing |
| calls `abort()` or traps | `dolly: process 103 failed: unreachable`, then the shell | the page's FATAL screen with a JavaScript stack of the supervisor |
| gets Ctrl+C, default action | ends, then the shell | the image ends without a word |
| gets Ctrl+C in a CPU loop | ends, then the shell | forced end after 512 ms, without a word |
| loses its GPU device (`fluid`) | `fluid GPU: I/O error`, then a prompt | a black page |

The causes are in the page, not the kernel: on exit it terminates the Worker
at once and drops the status (`src/browser.mjs:127-130`,
`src/runtime-worker.mjs:368-369`), and a trap of the root process rejects
into the page's fatal path (`src/process-supervisor.mjs:645-649`,
`src/browser.mjs:131-132`), while a child's trap is one line on its own
stderr (`#fail`).

The wrapped images end the same way once their last shell exits: `exit` in
`minimal`, or twice in `default` (the first brings the recovery shell), leaves
`data-dolly-status="exited"` and the frozen terminal, with no message
(headless Chrome, this release).

### What it gains

| | Wrapped | Direct |
| --- | --- | --- |
| ENTRY start to the probe's first output, lean image, Chrome (n=10) | 38 ms (36-49) | 10 ms (10-20) |
| The same, Firefox (n=10) | 85 ms (64-96) | 49 ms (11-120) |
| Navigation to first output, Chrome / Firefox | 180 / 461 ms | 169 / 416 ms |
| The same on `FROM system` (153 MiB), Chrome (n=8) | 1,427 ms | 1,269 ms; restoring the image dominates and the ranges overlap |
| `fluid`: navigation to first GPU frame, Chrome (n=6) | 839 ms (667-939) | 795 ms (634-964) |
| Lean probe image (no `FROM`, `INSTALL display`) | 9.99 MiB with `core` | 9.13 MiB |
| `fluid` the same way (`COPY` of the program and its shader) | 10.17 MiB | 9.31 MiB |
| `gpu-fluid` in the catalog (`FROM gpu-sdk`) | 153.86 MiB | |

- The shell costs 0.86 MiB and about 30 ms. The 144 MiB between the catalog's
  `gpu-fluid` and either lean form is the SDK base it keeps, and the wrapped
  form sheds it just as well (`20260930-231300-lean-game-images`).
- Chrome and Firefox build artifacts of the same size from both recipes
  (9,569,300 and 10,470,130 bytes).
- No trusted code is left out: the supervisor, the process Worker and the
  display are the same. A direct image only never calls SPAWN.

### Also found

- A custom image that declares `snapshot@0` without `http@0` fails in its
  result tab with `invalid custom session base`: `src/session-store.mjs:23-34`
  needs `policies`, which only `host/http/http.mjs:47` supplies.
- An image without Slop still exports `SHELL=/bin/slop`.

## Recommendation

1. Direct ENTRY becomes a supported shape: yes. The kernel, the runtime and
   sessions already serve it unchanged; what is missing is how the page ends.
   No ABI, seed or image changes.
2. The page adds, for an ENTRY process that ends: present the last frame
   before the Worker is terminated; then one line with the exit status or the
   signal and a way to start again (a reload does it, 1 s); and a trap of the
   root process is reported like any process failure, not as a page fatal.
   Ctrl+C keeps its meaning (SIGINT while ISIG is set): a program that wants
   the key clears ISIG or handles the signal, and the ending line makes a
   mistaken Ctrl+C a restart away. All 37 runnable images get the same ending
   when their last shell exits.
3. The docs (`docs/dollyfile.md`, "Entry and startup") say both shapes and
   what each means. `ENTRY /program`: one process, the terminal, the image's
   environment, cwd `/`, no `~/.dollyrc`, and the image ends when the program
   does. `ENTRY /bin/foreground -i /bin/slop SCRIPT`: a shell around the
   program, for images a person or an agent works in. It should not be sold
   as smaller or faster: 0.86 MiB and 30 ms.
4. The touch demo (`20261005-222057-touch-input`) is the first such image,
   built lean (`INSTALL display` and its program, no `FROM`), after item 2.
   `gpu-fluid` can follow: `fluid` reaches its first frame as the ENTRY of
   a 9.31 MiB image.
5. For `spawn@0`: a direct image whose program starts nothing is the only
   kind that could omit it. There is one measured candidate today (`fluid`)
   and seven more display programs without a spawn client that a launcher or
   script starts. That is not yet a reason for the module
   (`20261005-222449-spawn-users`).
