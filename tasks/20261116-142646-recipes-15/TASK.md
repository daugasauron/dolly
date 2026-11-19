# zig-llvm and imgui-x11 fail in the session that installed them: their variables apply only after a reload, and amy says the rest works now

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: audit,recipes,amy,zig,x11,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`): every package `amy` offers installed alone into a fresh `default` session.

## Closed (2026-11-19)

The 0.1.8 round (unit `dolly-round-018k`, `integrate/0.1.8` at 8d666a4e4, `work/integrate-018`,
`build/round/suites.log`) rebuilt zig-llvm, imgui-x11 and x11-desktop. No recipe exports
`ZIG_LIBC`, `ZIG_LIB_DIR` or `SDL_RENDER_DRIVER` any more; the launchers `/usr/bin/zig` and
`/usr/bin/imgui-x11` default them. `demos/zig/test/zig-llvm-browser.mjs`, which installs zig-llvm
into a fresh `default` session and sets no variable, built and ran its programs (`thread 42` among
them) in Chromium (57.4 s) and Firefox (57.4 s). `demos/x11/test/x11-browser.mjs` started
`imgui-x11` in x11-desktop's xterm, where no variable names the renderer, and it drew in Chromium
(39.8 s) and Firefox (42.6 s); in a fresh `default` session it ran on ws/recipes (below).

## State (2026-11-17)

Merged into `integrate/0.1.8` (02b7ba436). imgui-x11 rebuilt on `ws/recipes` (`work/recipes`,
3,412,918 bytes): in a fresh `default` session, `amy install xorg-server imgui-x11`, `Xsdl :1
-nolock &`, then `DISPLAY=:1 imgui-x11` with no SDL variable in the environment ran until
`timeout 6` stopped it (status 124), through `/usr/bin/imgui-x11`, the launcher that defaults
`SDL_RENDER_DRIVER` to `software`, in Chromium and Firefox (case `imgui-x11-alone`,
`work/audit-1116-evidence/recipes/ws-recipes/logs/cases-*.jsonl`).

Left for the 0.1.8 round: zig-llvm is built on the LLVM chain (llvm22, 75 minutes, a 9 GB slot),
which this tree does not rebuild; then `demos/zig/test/zig-llvm-browser.mjs` (which sets no
variable) and the Done-when's `zig build-exe` of a program printing 42 in a fresh session confirm
it. Rebuilds zig-llvm, imgui-x11, x11-desktop.

## Found

A package's exported variables reach `/etc/dolly/environment`, which a session reads when it is
next loaded; the running shell keeps its own (`docs/dollyfile.md`, Packages and amy). amy says so:
"the environment variables it sets apply when the session is next loaded; the rest works now".
For two packages the program does not work until then:

```
$ amy install zig-llvm
$ zig build-exe main.zig
error: libc installation is missing crt directory                         (status 1)
$ ZIG_LIBC=/usr/lib/zig/libc.txt ZIG_LIB_DIR=/usr/lib/zig zig build-exe main.zig && ./main.wasm
42

$ amy install xorg-server imgui-x11 && Xsdl :1 -nolock &
$ DISPLAY=:1 imgui-x11
INFO: Error creating SDL_Renderer!                                         (status 1)
$ DISPLAY=:1 SDL_RENDER_DRIVER=software imgui-x11                         (runs until stopped)
```

- `demos/zig/Dollyfile-zig-llvm:36,49` exports `ZIG_LIB_DIR` and `ZIG_LIBC`, without which Zig
  finds no libc for this target. The demo's own test sets it by hand
  (`demos/zig/test/zig-llvm-browser.mjs:60-61`, "A package's environment applies from the next
  session load: ZIG_LIBC is named here"), so it never meets what a person meets; the port's task
  recorded it and closed (`tasks/20261014-234000-zig-llvm`: "A session must name `ZIG_LIBC` until
  it is next loaded").
- `demos/sdl2/Dollyfile-imgui-x11` exports `SDL_RENDER_DRIVER software`.

`rust` avoids the problem with a launcher: `/usr/bin/rustc` is a `#!/bin/slop` script that runs
the real compiler (`demos/rust/Dollyfile-rust:13-15`), as the docs prescribe for "a command ... as
a launcher when its files live elsewhere".

The other packages that export variables (`cc`: CC, CXX, AR; `core`: SHELL; `display`: DISPLAY;
`zig`: ZIG_LIB_DIR; `go`: GOTOOLCHAIN, GOFLAGS; `pi`: PI_PACKAGE_DIR, PI_SKIP_VERSION_CHECK;
`python`: PYTHONUTF8, PYTHONDONTWRITEBYTECODE; `cargo`: CRATE_CC_NO_DEFAULTS,
CARGO_NET_GIT_FETCH_WITH_CLI; `binaryen`: BINARYEN_CORES) passed their uses in the install
session (`zig` built a program, `wasm-opt -all -O2 /bin/ls` ran without BINARYEN_CORES); what
their variables change (a Go module asking for a newer toolchain, a crate built with the `cc`
crate) was not tested.

Evidence: `work/audit-1116-evidence/recipes/run-big.jsonl` (case `zig-llvm`), `env.jsonl`
(`zig-llvm-env`), `x11b.jsonl` (`x11-imgui`), `debug4.jsonl` (`binaryen-env`).

## Do

- `Dollyfile-zig-llvm`: Zig behind a launcher `/usr/bin/zig` that runs it with `ZIG_LIBC` and
  `ZIG_LIB_DIR` defaulted when unset, as rustc's launcher does; drop the two `EXPORTS ENV` rows;
  the demo's test drops its `export`.
- `Dollyfile-imgui-x11`: the same launcher for `SDL_RENDER_DRIVER` (upstream's example program stays
  unchanged).

## Done when

In a fresh `default` session, `amy install zig-llvm` and then `zig build-exe` of a program that
prints 42 builds and runs, and `amy install xorg-server imgui-x11` and then `imgui-x11` on a
running `Xsdl` draws, with no variable set by hand.
