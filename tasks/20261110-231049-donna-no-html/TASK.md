# An interactive core image that declares no html@0

- STATUS: OPEN
- PRIORITY: 170
- TAGS: donna,images,html,host-modules,0.1.6

Requested from Donna, the native Rust host of Dolly's userspace on wasmtime (`~/dev/donna`,
task `20261110-230235-dolly-requests` there; plan in `20261110-225114-native-host`). Donna runs
this repository's kernel, plugin, gate, programs and images unchanged and never forks a contract,
so what it needs changed is asked for here.

## State (2026-11-11)

Done in 65a4ad70f (the 0.1.6 reconcile): `default` and `system` declare and hold no
`html@0`; the images that show popups declare it themselves. A session of `default` that
wants one runs `amy install html`, and amy has nena enable the module (`test/html-browser.mjs`,
"html in default"). Left: that test in the reconcile round.

## Why

Donna has no `html@0`: it is a sandboxed browser frame built by page JavaScript, and Donna
contains no JavaScript and no web view. Owner (2026-11-11): Donna refuses an image that requires
it. `default` declares `html@0` (`Dollyfile`, line 7) and installs the `html` package;
`system` installs `html` too (`Dollyfile-system`), and so do the images built on it. So no
interactive core image boots on Donna.

## Options

1. `20261104-143110-modules-r3` already proposes that `system` stop installing `transfer` and
   `html`. Doing it removes the requirement from every toolchain built on `system`.
2. `default` keeps `html` as a package but not as a declared module: `amy install html` with
   `nena enable html` gives it to a session that wants it, as `pty@0` and `sockets@0` are given
   to tmux. Its programs then say `nena enable html` when it is missing, as the loader does.
3. A separate image for hosts without a page (`default-native`): a second image to keep; the
   last choice.

## Done when

`default` and `system` declare no `html@0`, their popups still work in the browser after
`nena enable html` (or are not lost to any image that needs them), and Donna boots `default`.
