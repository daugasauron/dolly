# QuickJS, the engine under Janis and Pi, is compiled as Emscripten's to turn threads off; built honestly it runs Workers and Atomics at the same speed

- STATUS: OPEN
- PRIORITY: 130
- TAGS: audit,ports,javascript,pi,0.1.8

## State (2026-11-16 night audit)

Measured in sessions on round 1117's dist; no recipe changed. The change rebuilds `quickjs`,
`janis` and what installs them (Pi's images, `classicube-agent`, `rts-arena`): minutes of image
builds (round 1117: `quickjs` 0.3 min, the pi demo's images 2.1, classicube's 1.4, rts's 2.5)
plus their tests.

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
