# Pi starts in / instead of /workspace

- STATUS: CLOSED
- PRIORITY: 320
- TAGS: pi,pi-local,agent

`pi` and `pi-local` start Pi from `/etc/dolly/init.slop`, which `/bin/slop`
runs non-interactively; only an interactive Slop moves to `/workspace`
(`src/slop.c` `interactive()`). So Pi's working directory is `/`: its footer
shows `/`, its system prompt ends `<cwd>/</cwd>`, and every `bash` tool call
starts in `/`, while `SYSTEM.md` says "Work in `/workspace`". The recovery
shell after Pi exits is in `/workspace`, so the two disagree.

Seen in task `20261005-215204-pi-local-loop`: the 2B and MiniCPM5 models ran
`cd /workspace && cc -o hello hello.c` in one call and `./hello` in the
next, which runs in `/` and fails (`slop: ./hello: command not found`), and
`pwd` answers `/`. Starting Pi from `/workspace` (one `cd /workspace` at the
top of `init.slop` in `demos/pi/Dollyfile-pi`) removes that trap; with it,
8 runs of the compile task still failed twice for other reasons, so it is
not the loop's cause.

## Done when

- Pi started by an image's ENTRY runs in `/workspace` (footer and
  `<cwd>`), in `pi`, `pi-local` and Studio; a browser test checks it.

## Result (2026-10-06, `fix/userspace-2`)

`demos/pi/Dollyfile-pi`'s `init.slop` starts with `cd /workspace`. The
kernel creates `/workspace` at boot (`src/dolly.c`,
`initialize_boot_environment`), so the init needs no `mkdir`.

`pi-local` (`FROM` `Dollyfile-pi`) and `dollyfile-studio` (`FROM`
`Dollyfile-pi-local`) define no `/etc/dolly/init.slop` of their own and
their `ENTRY` runs the inherited one, so they get the same working
directory; Studio's `.dollyrc` uses absolute paths. Shown by reading the
recipes: neither image was rebuilt here (memory rule), so the catalog
rebuild is their first run with it.

Measured in the rebuilt `pi` image (Chrome): the Pi the image's entry starts
answers `! printf 'ENTRY-CWD=%s\n' "$(pwd)"` with `ENTRY-CWD=/workspace` and
its footer shows `/workspace`; a Pi started from `/` in the recovery shell
answers `/` and shows `/`. Pi takes one working directory when it starts
(`process.cwd()`), and its footer, the prompt's `<cwd>` (`system-prompt.js`)
and every `bash` call (`slop -c COMMAND`, `demos/pi/dolly-tools.js`) use it;
the `<cwd>` text itself was not captured, since the entry's Pi has no model.

Test: `demos/pi/test/pi-browser.mjs` asks the entry-started Pi for its
working directory before it leaves it. The same test runs the dolly skill's
new sentences (`cc file.c` writes `a.out`, which runs; `file` calls it and
`/bin/cc` WebAssembly).
