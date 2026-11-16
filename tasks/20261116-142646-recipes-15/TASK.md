# zig-llvm and imgui-x11 fail in the session that installed them: their variables apply only after a reload, and amy says the rest works now

- STATUS: OPEN
- PRIORITY: 200
- TAGS: audit,recipes,amy,zig,x11,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`): every package `amy` offers installed alone into a fresh `default` session.

## State (2026-11-17)

Fixed in source on `fix/amy` (`work/fix-amy`, commit `70c84705b`), as Do says: `/usr/bin/zig` is a
`#!/bin/slop` launcher that exports `ZIG_LIB_DIR` and `ZIG_LIBC` where unset and execs
`/usr/lib/zig-llvm/zig`; `/usr/bin/imgui-x11` exports `SDL_RENDER_DRIVER=software` where unset and
execs `/usr/lib/imgui-x11/imgui-x11`; the three EXPORTS ENV rows go and the zig-llvm demo's test no
longer exports ZIG_LIBC. Pins refreshed (x11-desktop and the Ghostty images that install
imgui-x11 rebuild too).

By hand on round1113's images, each program moved where the recipe now puts it and the recipe's
launcher written in its place (`fix-amy/scripts/make-launchers.mjs`), no variable set: `zig
build-exe` and `zig build` of a program printing 42 build and run; `imgui-x11` on a running `Xsdl :1`
runs until stopped (the audit's "with" result); Chromium and Firefox (`fix-amy/zig-chromium.jsonl`,
`launch-chromium.jsonl`, `launch-ff.jsonl`). Waits for the round to rebuild zig-llvm and imgui-x11;
then `demos/zig/test/zig-llvm-browser.mjs` (which now sets nothing) and the Done-when commands confirm
it. The other exporting packages were left as they are: their uses passed in the install session.

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
