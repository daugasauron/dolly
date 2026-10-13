# Host bridges enabled from inside the runtime: nena@0 and nena

- STATUS: OPEN
- PRIORITY: 340
- TAGS: host-modules,core,owner

Owner (2026-10-13): "I also want to add a new host module that makes it
possible to add host bridges from inside the runtime, and the default one
should have it. So when you try tu install tmux for example it would say
\"need to enable pty host module\" and it can be done inside the runtime. The
config/status of the host bridge should be controlled by a command line tool
called nena."

"The idea is that if you have the nena bridge you can freely configure which
host bridges are enabled during runtime. If you don't have it, the runtime
can't change any host bridge related functionality"

Done when: in a `default` session `amy install tmux` names the module and the
command that enables it, `nena enable pty` enables it there, tmux then
installs and runs, and `nena` lists every module with its state; an image
without `nena@0` cannot change its modules; tested in Chromium and Firefox.

## The model (the owner's)

- The module is `nena@0`, the command `nena`. An image that declares
  `REQUIRES HOST nena@0` lets its session enable and disable host modules at
  run time, freely: no consent prompt and no per-module policy. An image
  without it is as before: its declared modules are fixed and nothing in the
  runtime changes them. `default` declares it and installs the command
  (`PACKAGE nena`, `Dollyfile-nena`).
- The browser's own permission prompts (microphone) and the HTTP broker's
  policy are untouched and apply to a module enabled at run time as to a
  declared one.

## How a module was gated before (read from main `4ed1d9ef`)

1. The page creates providers for exactly the image's `REQUIRES HOST` list
   (`src/browser.mjs`, `createHost("browser", …)`), running each module's
   `check()`; the Worker creates its sides for what the page enabled.
2. The kernel is instantiated once: an import of a module without a Worker
   side was bound to a function returning `ENOSYS` (`host/modules.mjs`,
   `imports`). The kernel holds every module's C and dispatches every
   operation: a program that links no client reaches the import.
3. The loader (`src/process-supervisor.mjs`) refuses an executable whose
   `dolly.host` records name a module outside the admitted map, but only when
   it compiles the executable: a cached compiled module was not checked again.
4. Sealing and `INSTALL` (`src/dollyfile.c`) compare a package's modules with
   the recipe's list; `amy` runs `dollyfile install`, which reads the booted
   image's own recipe.
5. Page-side objects made once at boot: the HTTP policy (consumed and deleted
   from `window`), the display's driver and presenter, the input ring, the
   session baseline (`snapshot@0`, `imageRestored`), the thread provider and
   the process-Worker modules (both refused once the supervisor existed).

So the loader's check and the recipe's list are compatibility demands; what
contains a compromised userspace is the page-side provider and the import
binding. A switch has to act there.

## What was built

- `host/nena/`: `module.json`, the contract `dolly-nena-0.wat` (one import,
  `env.dolly_nena_dispatch`; process operation 133; a leased device like
  `audio@0`: OPEN, MODULE index, ENABLE name, DISABLE name, CLOSE; every
  answer is a 256-byte module record), `nena.h`, `client.c`, `kernel.c` (the
  lease, nothing else: no module state in Wasm), `nena.mjs`.
- `host/modules.mjs`: the page's `list`, `enable` and `disable`, given to the
  page side of `nena@0` only. The page attaches its side (with the module's
  `check()`), the Worker's side follows by `host-switch` and starts the
  provider with the context of boot; disabling runs the other way and
  disposes both sides. Imports of a module that can be switched ask at each
  call whether it is enabled (`ENOSYS` otherwise); the imports of fixed
  modules stay bound directly.
- The loader checks an executable's modules at every launch, not only when
  it is compiled, and names the command where the session has `nena@0`:
  `host module gpu@0 is not enabled: nena enable gpu`.
- `src/commands/nena.c` and `Dollyfile-nena` (built from `system-build` as
  `gzip` is, so `system-tools` needs no `nena@0`), installed by `default`;
  the manual page is its `--help`.
- `src/dollyfile.c`: a live install in an image that declares `nena@0` also
  accepts the modules listed in `/etc/dolly/enabled` and otherwise prints
  `dollyfile: /vX/Dollyfile-tmux needs pty@0: nena enable pty` (then amy's
  `amy: tmux: not installed`). `amy.c` is unchanged: the check is the
  engine's, as before. Without `nena@0`: today's refusal, verbatim.
- Each `host/*/module.json` has `gives` (the line `nena` prints) and, where it
  is never switched, `fixed` (why).

## Decisions

- **Disabling is revocation at the page, at once, for running processes too**
  (not "for processes started after", the integrator's default). The loader's
  check does not contain a program that links no client, so a disable that
  only stopped new launches would leave the bridge open to exactly the
  userspace the boundary assumes compromised, and `nena disable X` followed
  by `nena disable nena` would promise something false. Both sides are
  disposed, the import answers `ENOSYS`, the loader refuses the module's
  programs. What a module keeps in Wasm (local sockets, later ptys) stays
  with the processes that hold it: there is nothing outside Wasm to take.
  `threads@0` terminates its Workers, and the supervisor ends the programs
  that ran on them with one line saying why (status 126): a program left
  waiting for threads that no longer exist would hang, which is not an
  explicit failure.
- **`runtime@0` cannot be disabled**: it is `fixed` (it is the kernel). The
  only modules others depend on are `runtime@0` and `http@0`, both fixed, so
  no rule about dependents is needed; enabling checks that a module's
  dependencies are enabled (`packages@0` needs `http@0`).
- **`nena disable nena` gives the privilege up** until the page is reloaded:
  the provider itself is disposed, and no other code path reaches the
  switches. The answer is sent before the switch, since it travels through
  the provider being removed. It is not kept across a save: a lock recorded
  in the session's files could be removed by the userspace it is meant to
  bind, and one in the page's session record would not travel in an exported
  session file. A session that must stay fixed uses an image without
  `nena@0`.
- **A restored session has its modules again.** The Worker side of `nena@0`
  (trusted) writes the modules a session enabled beyond the page's first set
  to `/etc/dolly/enabled`, one `name@version` a line, after every switch; a
  save holds the file, and at load, after the session is restored and before
  ENTRY, the page enables what it lists. A module that cannot be enabled then
  (no WebGPU in this browser, or an adapter request the browser does not
  answer within five seconds) is said on the page's status line with the
  command, and dropped from the file; the session loads all the same. Honest because the file is read only
  where the image declares `nena@0`, where the userspace decides anyway; it
  is the one configuration file, and the recipe engine reads the same file
  for amy, so no program needs the `nena@0` client to know the set (linking
  it would stamp `dollyfile` and `amy` with a module most images lack). A
  declared module the session disabled is back at load: the page starts from
  the image's list.
- **Not switched (`fixed`), with the reason `nena` prints**: `runtime@0` (the
  kernel); `http@0` (the page's HTTP policy is consumed and deleted when the
  provider is made: a second provider would get the default, permissive
  policy, so this one is a boundary matter, not a convenience);
  `display@0` and `input@0` (measured in a `default` session with their
  `fixed` line removed: the display's driver is installed once, so a second
  start is refused and the page is left without a terminal; the input
  provider's `dispose()` ends every wait on the terminal as the runtime's
  stop); `snapshot@0` (its baseline is the image as loaded, taken before
  ENTRY: not tried); `build@0` (nothing takes its panel and service down: not
  tried). `upload@0`, the fourth module that starts with the image, was
  measured the same way and switches: it is not fixed.
- **An embedding's `DOLLY_HOST_MODULES`** stays a bound: a module it leaves
  out is not enabled.
- The loader's and the engine's messages after `nena disable nena` are those
  of an image without `nena@0` ("not declared by this image"), which is not
  exact for a module the image declares and the session disabled. Left so:
  the session is then, by its own choice, an image whose list is fixed.

## Every module, after boot

| Module | Outside Wasm | `nena` | Why, or what a switch does |
| --- | --- | --- | --- |
| `runtime@0` | kernel memory, clocks, entropy, Workers | fixed | it is the kernel; every module depends on it |
| `display@0` | canvas, presenter, kernel plugin | fixed | measured: disabled and enabled again, the second start is refused (the driver is installed once) and the page has no terminal |
| `input@0` | listeners, the ring | fixed | measured: its `dispose()` ends everything that waits on the terminal as "Dolly stopped" |
| `upload@0` | file picker | switched | measured: disabled, its command is refused; enabled again, the dialog opens and the file arrives |
| `snapshot@0` | Save, IndexedDB | fixed | its baseline is the image as loaded, taken before ENTRY |
| `http@0` | Fetch under the policy | fixed | the policy is consumed and deleted from `window` by the first provider |
| `build@0` | build panel, local service | fixed | nothing takes its panel and service down |
| `gpu@0` | WebGPU, a canvas | switched | `check()` asks for the adapter; the canvas is transferred with the switch |
| `audio@0` | Web Audio | switched | provider made and closed |
| `microphone@0` | getUserMedia | switched | the browser's prompt still decides at OPEN |
| `buttons@0` | strip of page DOM, clipboard on Paste | switched | strip made and removed |
| `download@0` | Save offers | switched | panel made and removed |
| `threads@0` | Workers | switched | disabling terminates its Workers and ends the programs on them |
| `dso@0` | none (the process's own Worker) | switched | the bundle is served to programs started after |
| `sockets@0` | none | switched | only the loader's check changes; sockets stay with their processes |
| `packages@0` | local service of `http@0` | switched | service registered and removed; needs `http@0` |
| `nena@0` | the page's set | disabled only | disabling it is the lock |

`pty@0` (on `integrate/round-1013`) is as `sockets@0`: a stamped client and
no page side. Enabling it admits its programs to the loader and records it in
`/etc/dolly/enabled`, which the engine's install check reads. Its
`module.json` needs a `gives` line (`test/host-modules.test.mjs` says so);
the merge below adds one.

## Seed

This changes the seed (`nena.h`, `nena-abi.h`, `libdolly-nena.a`,
`src/dollyfile.c`) and `default`'s recipe: every image is stale until the
catalog round. Image inputs before: `sha256:a7ee26c5…`; after:
`sha256:9536f99e…`.

## Measured

- Chain, one job, `slot.sh build`: `default`, `nena`, `cc`, `system` and what
  they are built from (14 images) in 875.5 s (08:27 to 08:42 JST); the seed
  itself (`npm run build:runtime`) in 101 s.
- `test/nena-browser.mjs` (new), Chromium and Firefox, 10 to 14 s each, on
  `default` after `amy install cc`:
  - `nena` prints one line per module of the page (17) in the state the page
    holds (`declared`, `available`, `-` for a fixed one that is off);
  - a program that records `audio@0` is refused with `nena enable audio`, the
    operation called directly is `ENOSYS`, and `dollyfile install` of a sealed
    package that needs `audio@0` fails naming the command and installs nothing;
  - after `nena enable audio` the page has the provider, the program plays,
    the package installs and `/etc/dolly/enabled` is `audio@0`; after
    `nena disable audio` all three refusals are back and the file is gone;
  - a program holding `audio@0` open while `nena` disables it gets `ENOSYS`
    from its next call;
  - `threads@0`, which `default` declares, is disabled (a threaded program is
    refused naming `nena enable threads`) and enabled again (it runs); a
    program running a thread while `nena` disables the module ends with
    status 126 and a line naming `threads@0`;
  - `packages@0` disabled, `amy install gzip` fails; enabled, it installs;
  - `upload@0` disabled, `upload` is refused; enabled, its dialog opens and
    the chosen file arrives;
  - `nena disable runtime|http|display`, `nena enable build` and a name the
    page lacks fail with a reason and change nothing;
  - `nena enable gpu` succeeded in both browsers' headless software adapters
    (the test accepts a refusal with a reason where there is no WebGPU);
  - a session saved with `audio@0` enabled has it again when loaded, before
    its shell prompt, and its program runs; with `gpu@0` in the record too
    and a browser whose adapter request never answers, the session loads all
    the same, `gpu@0` is left out and the page names `nena enable gpu`;
  - after `nena disable nena` the command and a direct call of the operation
    are refused, `gpu@0` cannot be enabled, and `audio@0` stays enabled;
  - a page whose embedding sets `DOLLY_HOST_MODULES` enables nothing outside
    that list, and still switches what is in it.
- `test/host-modules-browser.mjs` (image `system`, no `nena@0`), Chromium:
  the `nena` command compiled there is refused by the loader naming `nena@0`,
  a direct call of operation 133 is `ENOSYS`, and the program that needs
  `gpu@0` is refused as before.
- Found by the first run: a disable sent the page side's configuration to the
  Worker again, and the GPU's canvas, already transferred, cannot be cloned.
  Only an enable carries it now.
- Found by the test of a browser that never answers: the switches run one
  after another, so that one enable held every later switch, `nena disable
  nena` among them (its answer is sent first, so the command had returned).
  A module's `check()` now has five seconds when it is enabled after boot;
  boot itself is unchanged.
- The core suite (`slot.sh hugebuild node test/browser-tests.mjs`) on the
  final code and the rebuilt core images: Chromium 576 s, Firefox 538 s, 41
  cases pass in each and one file fails, `amy-browser.mjs`, at
  `amy install cmake` ("this site publishes no such package"): the catalog's
  packages are not built on this seed. Its first case, which installs
  `python` and reloads a saved session, passes in both.
  `sockets-browser.mjs` lists the kernel's imports exactly and now names
  `env.dolly_nena_dispatch`.
- Source suite: 345 pass. `npm run test:artifacts`: 25 pass, on the images
  built here.
- Chain, one job: the other core images, `javascript` and `python` (19 named
  images) in about 4.5 min more.
- `npm run test:demos -- javascript python`: pass (`javascript` and `python`
  in Chromium, `python on default` in Chromium and Firefox).
- **Pi's demo test did not run.** Its image could not be rebuilt on this seed
  within this agent's caps: `rust-build` runs four `rustc` at once
  (`cargo -j 4` in its recipe) and the 6 GB `slot.sh build` scope was ended
  by the OOM killer at 10:22 (`rust-build`: "Target crashed"), 58 min into
  the chain; `fd`, `ripgrep`, `pi-coding-agent`, `pi-runtime` and `pi` were
  skipped. Built on the way: `cmake-build` (1572 s), `rust-sdk` (50 s),
  `rust-llvm` (1669 s), `pi-build` (60 s). A slim tree also lacks the Rust
  port's sources: `build/rustc-port/{rust,toolchain,libc,libc-186,jobserver,
  llvm-source}` (2.5 GB) were copied from `work/rust` to stage the chain.
  The catalog round builds `rust-build` under the integrator's cap; Pi's
  twelve runs belong there.
- `amy-browser.mjs` beyond its first case needs the catalog's packages on
  this seed: also the round's.

## The merge with `integrate/round-1013`

`core/bridges` ends in a merge of `integrate/round-1013` (`f55da1fb`); only
the source suite ran on it (346 pass), nothing was built. Resolved by hand:

- `Dollyfile`: the round's rows (`transfer`, no `COPY`), plus
  `REQUIRES HOST nena@0`, `INSTALL …/Dollyfile-nena` before `transfer`, and
  the comment's last sentence.
- `host/manifests.mjs`: `…, "sockets", "pty", "build", "packages", "nena"`.
- `host/pty/module.json`: `"gives": "pseudo-terminals: a terminal one program
  gives another, as tmux does",` after `"version"`.
- `docs/dollyfile.md`: `default` is `core`, `posix`, `display`, `curl`, `amy`,
  `nena`, `transfer`; the sentence about `nena@0` ends the round's paragraph
  on what `amy install` checks.
- `test/dollyfile-graph.test.mjs`: `default: [… "amy", "nena", "transfer"]`.
- `Dollyfile-dolly-docs`: the round's rows plus `host/nena/dolly-nena-0.wat`;
  every pin by `DOLLY_BUILD_IMAGES=dolly-docs node
  scripts/update-recipe-pins.mjs --sources`.
- `src/dollyfile.c`, `src/process-supervisor.mjs`, `src/browser.mjs`, the
  other documents and tests merged without conflict. `src/commands/amy.c` is
  the round's: this work never edited it. The engine prints the refusal
  (`dollyfile: /vX/demos/tmux/Dollyfile-tmux needs pty@0: nena enable pty`),
  which holds the `needs pty@0` that `demos/tmux/test/tmux-browser.mjs` greps.
- No test or document of this work names a package the round renamed.
- To check there once `default` and `tmux` are built, after the refusal in
  the tmux test's `default` session: `nena enable pty && amy install tmux &&
  command -v tmux`.

## Left

- The round: every image is stale. Then Pi's test twelve times and
  `amy-browser.mjs` in both browsers.
- The done-when's tmux flow, on the merged tree (above).
- `snapshot@0` and `build@0` are fixed without a measurement of a late start.
- After `nena disable nena` the loader says of a module the image declares
  and the session disabled that it "is not declared by this image".
