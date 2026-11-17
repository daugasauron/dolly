# QuickJS, the engine under Janis and Pi, is compiled as Emscripten's to turn threads off; built honestly it runs Workers and Atomics at the same speed

- STATUS: CLOSED
- PRIORITY: 130
- TAGS: audit,ports,javascript,pi,0.1.8

## State (2026-11-17)

Closed: done on `ws/ports` (`ce32791fc`), built and tested in this tree (results below); it
rebuilds `quickjs` and what installs it: `janis`, `janis-install`, `typescript`, `vendor-crates`,
Pi's images, `classicube-agent`, `classicube`, `seven-kingdoms`, `rts-arena`, the studio. No
recipe defines `EMSCRIPTEN` for QuickJS any more. `Dollyfile-quickjs` compiles the engine as upstream does for
Unix, twice: without `-pthread` for `libquickjs.a`, so that Janis, Pi, `tsc` and the games'
agents stay one-thread programs, and with it for `qjs`, linked through `--dolly-cast-emulation`
(the `binaryen` package) for its `os.Worker`; its checks run a Worker that doubles a number and
`Atomics` on a `SharedArrayBuffer`, and `Dollyfile-janis` checks that Janis has `Atomics` and
`SharedArrayBuffer`. The `quickjs` package declares `threads@0` for `qjs`, so what installs it
declares it too (`janis`, `janis-install`, `typescript`, `vendor-crates`, `classicube-agent`,
`seven-kingdoms`; Pi's images and `system` did already); none of their programs is linked with
threads.

The library is compiled without `-pthread` by choice: of the programs on it only `qjs` starts
threads (Janis answers `Worker` with `ENOSYS`, `demos/javascript/README.md`), and a threaded
program's memory is shared, its maximum taken once a second thread starts
(`docs/process-model.md:492-497`). A first version linked every program on the engine with
`-pthread`, as the audit tried for Janis; Pi's ask-user and frontend tests passed with it in
both browsers.

ClassiCube's test passes in Chromium on the one-thread build (`cc-7`, 696 s at a load of about
28: the world, the agent's settings, provider timeouts, a saved and restored session, two Pi
players streaming reasoning at once); its Firefox line says why it skips (the fixtures drive
Chrome's DevTools input). At a load of 35 to 41 its agent proof missed a 45 or 60 s window with
either build (`cc-2` threaded, `cc-3` and `cc-5` one-thread: a Pi process took 31 s to send its
configuration), where round 1117 ran the whole test in 324 s. `pi-phone`'s part of the speech
test did not run here: at load 35 the speech part before it lost sound ("the model fell
behind"), and at load 28, the speech parts passing (`cc-8`), the checkout server refused
`pi-phone` once `rust-sdk`'s pin had changed (ripgrep and fd are in its closure), so the round
runs it.

Measured on the images built in this tree (logs in `work/audit-1116-evidence/ports/fix-ports/`):

- `quickjs` and `janis` build with their new checks passing (`build-1c.log`).
- Speed: the released Janis (round 1113's `pi-runtime`) against this branch's, alternately in one
  session, on a turn's work (five request bodies with a 400 KB base64 image, 2,000 events
  through `JSON`, `fib(24)`; `janis-bench.mjs`): Chromium 599, 311, 416, 336 ms against 418, 264,
  397, 385; Firefox 722, 447, 372, 468 against 425, 328, 627, 341. Pi's start: the released
  `pi` against this branch's in one `pi-agent` session (`pi-bench.mjs`), `time pi --version`
  alternately, Chromium 5.42, 4.17, 4.34, 3.33 s against 3.89, 4.34, 4.39, 3.48 s; Firefox 4.58,
  4.04, 5.20, 5.16 s against 4.28, 4.14, 5.45, 4.83 s (load 35 to 41); `--version` and `--help`
  print the same.
- In Chromium and Firefox: `janis-install` (`both-4`), Pi's ask-user and frontend tests
  (`both-4`, the frontend's Chromium run again in `cc-4` after a boot timeout at load 40), the
  `pi` test in `pi-agent` (`both-8`), the studio (`cc-3`), `javascript` (`typescript`'s `tsc`,
  `both-13`), `vendor-crates` (`both-16`), `pi-local`'s start screen (`both-10`), the RTS
  game and its agent in `rts-arena` (`both-14`).

## What

`demos/javascript/Dollyfile-quickjs:28`, `demos/classicube/Dollyfile-classicube-agent:33` and
`demos/rts/Dollyfile-seven-kingdoms:43` compile QuickJS-ng with `-DEMSCRIPTEN=1`, "upstream's
switch for a target without threads" (`Dollyfile-quickjs:7-8`). AGENTS.md, porting rules: "Do not
claim Linux or AMD64 to pass detection. Use upstream's portable paths"; the C target stopped
claiming Emscripten in `tasks/20261005-133402-target-identity`, which left this define as the
demo's own. In the pinned QuickJS-ng (`433941b9`) the macro selects `JS_HAVE_THREADS 0`
(`cutils.h:618`), no `CONFIG_ATOMICS` (`quickjs.c:75`), `DIRECT_DISPATCH 0` (`quickjs.c:51`), no
`os.exec` (`quickjs-libc.c:3559,3725`) and `os.platform` `"js"` (`quickjs-libc.c:4372`).

Measured 2026-11-16 in Chromium on `system` (which has `threads@0` and `cc`), scripts and logs in
`work/audit-1116-evidence/ports/`:

- The packaged `qjs`: `platform js Worker undefined Atomics undefined`; `os.exec(['echo', 'hi'])`
  throws `TypeError: fork error` (`quickjs-probe.*`).
- Built from the package's own archive without the macro and with `cc -pthread` (27 s): `platform
  unknown Worker function Atomics object SAB function`, but `new os.Worker(...)` ends the process
  with "function signature mismatch" (`quickjs-threads.*`). Upstream starts a thread through a
  union that calls a `void (*)(void *)` as `void *(*)(void *)` (`cutils.h:1953-1975`), which a
  WebAssembly indirect call traps.
- Linked with `cc --dolly-cast-emulation` too (the `binaryen` package; zsh and GLib are linked so):
  the Worker answers (`worker replied {"doubled":42}`) and `Atomics.add` works on a
  `SharedArrayBuffer` (`quickjs-cast.*`).
- Speed, warm runs of `fib(26)` and 300,000 `JSON.stringify` calls: packaged `qjs` 578 to 602 ms,
  the archive rebuilt with `-DEMSCRIPTEN=1` 629 to 707 ms, threaded with cast emulation 630 to 649
  ms (`quickjs-bench.*`). Janis linked as `Dollyfile-janis` links it, on the threaded engine:
  636 to 698 ms against the packaged Janis's 659 to 677, start 26 ms for both, the same output
  for a script using `fs` and `child_process.execSync` (`janis-threads.*`). With that Janis in
  place of the packaged one, the `pi` package's `pi --version` takes 2.28 to 2.51 s against
  2.24 to 2.58 s and prints `1.0.3`, and `pi --help` prints the same (`pi-threads.*`).

What threads cost here is by rule, not measured: a process's memory takes its 8 GiB maximum
before a second thread starts, and Firefox charges that to Linux's commit limit
(`docs/process-model.md:492-497`), so a script that starts an `os.Worker` costs that; one that
starts none runs on one thread as now. Pi's memory with the threaded engine was not measured.

## Smallest fix

In the three recipes, drop `-DEMSCRIPTEN=1`, compile with `-pthread`, link `qjs`, `janis`,
`classicube-agent` and `rts-arena` with `--dolly-cast-emulation` (the recipes then install
`binaryen`), and declare `threads@0` in `quickjs` and `janis` (Pi's images, `system` and
`rts-arena` already declare it; `classicube-agent` does not). Change the README's limit
(`demos/javascript/README.md:96-99`).

## Done when

`qjs` in its package has `Atomics` and runs an `os.Worker`, `janis` has `Atomics`; the javascript, pi,
classicube and rts demo tests pass in Chromium and Firefox; Pi's start time in `pi-agent` is
within its current range (`demos/pi/test/pi-browser.mjs`).
