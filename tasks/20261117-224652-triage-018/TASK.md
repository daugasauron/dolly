# The 0.1.8 integration's suites: tests that assumed what merged branches changed, and images that lost curl or /usr/bin/env

- STATUS: OPEN
- PRIORITY: 280
- TAGS: bug,tests,0.1.8

The early suites of the 0.1.8 integration (`work/integrate-018` at `38cb80ddc`, every image but
lean-std, lean-meta and lean; its `build/early-*.log` of 2026-11-18, 06:09 to 07:10) failed 3
artifact tests, 4 core browser tests and 21 demo tests. Each failure, run alone on
`fix/018-triage` (`work/triage`), had one of the causes below; each fix is a commit of that
branch, verified by running the test again in Chromium and Firefox except where State says.

## State (2026-11-18)

Fixed and verified on `fix/018-triage` (logs in `work/triage/build/triage/`): the artifact tests
but the Lean one, the source tests and the Dollyfile lint; amy, default, network and npm;
python (with "python on default"), pi frontend, janis-install, javascript, cmake and its amy
cases, sdl2, sdl2 audio and its amy cases, llvm, mojo's amy cases, the OCaml fixpoint, rust and
its amy cases, studio, xonotic (headless), 0 A.D.'s enet, openal and spidermonkey; on the images
built again, rts and classicube (Chromium; Firefox skips it).

Left for the round:
- posix changed every application and the images built on system: 112 recipes are pinned
  again, and only posix, default, system, libffi and python are built here (with pi-runtime,
  classicube-agent, classicube, seven-kingdoms, rts-arena, cargo and rust-tools before it). The
  round builds the rest and runs every suite on them.
- The GPU stage: godot-gpu passed in Chrome; in Firefox it built and booted, then reached its
  25-minute deadline running the editor's 3D scene (load 20 to 30, the GPU lock shared by four
  workstreams). godot-flyover-touch and Xonotic's Chrome window were not run on a GPU here.
- lean-browser.mjs and "dist registers every image of the catalog" need the Lean images
  (`fix/lean-crash`).
- godot-airtime's Firefox did not launch in 180 s in early-gpu-demos.log (`/snap/bin/firefox`);
  not seen here.
- Cause 9 (emacs's build check in the round on 0ae1331a2) is in the seed's process library: its
  fix waits for the coordinator's word, since it changes the seed.

## Causes

1. **curl left `system` and `default`** (ws/modules, 2f1f91169: "the base holds the toolchain").
   Tests that fetch a fixture with curl in an image without it ended at `curl: command not found`
   (127), or lost the shell (`host providers closed`) where a probe's `|| exit 1` ended it. Each
   test now has curl where it fetches: `installProbe("curl", ...)` for python, sdl2, sdl2 audio
   (from ws/packages, 390c1267f and 9c6dd9d4b) and javascript; `amy install curl` in default for
   janis-install, the OCaml fixpoint and 0 A.D.'s enet, openal and spidermonkey tests (amy has nena
   enable http@0, which default no longer declares); curl among the packages of cmake's
   `displayProbe` and of llvm-runtimes' probe recipe; `composed()` onto `rust-tools` and onto
   `xonotic-build` (with http@0, which it no longer declares). Two images had taken from the base
   what they use: `pi-runtime` installs curl, which Pi's dolly skill fetches with and the
   frontend's orders skill calls its API with; `rust-tools` installs `git-http`, without which
   Cargo's git could not fetch a Git dependency ("git: 'remote-http' is not a git command"), and
   cargo's page names it.
2. **The broker trusts no site file** (ws/modules) **and site paths have no version**
   (ws/versionless). The Studio test's policy admitted only `/fixture/`, and Pi's skill and the
   test read the site's recipes with curl (status 9): its rule is now the page's own origin, GET.
   The libcurl contract expected `/fixture/libcurl-contract` to be refused as no versioned site
   path; it is the fixture, which the policy admits (`CURLE_OK`, recorded first). The artifacts'
   seed test stripped a `/vVERSION/` prefix from SOURCE locations, so `libdolly-display` seemed
   not to take its header.
3. **runSteps makes and enters a case file's `directory`** (ws/modules, 778f3efbb): the cmake,
   sdl2 (ws/packages, 8464fd6ca) and mojo cases that made it failed at `mkdir`, and rust's
   `rustc -o` wrote over it.
4. **ws/recipes: cc installs make, git installs vi, vi is a core package.** The zig package's
   record lists make before cc; `config/npm-images.txt` lacked make and vi
   (`scripts/package-npm.mjs`: "cc installs make, which it does not list"); vi's amy case stayed in
   demos/tools, so amy-browser.mjs found a core package no core test uses (moved to
   `test/cases/amy-tools.json`); the artifacts' list of the core images' programs lacked vi and
   git-http.
5. **Godot's packages declare touch@0** (6d3098c39): godot-gpu-browser.mjs composed them without
   it, the page failed to build, and the test read `__dolly` of a failed page.
6. **godot-flyover-touch-browser.mjs needs a GPU window** (c87eba2b7) but was not among
   run-browser-tests.mjs' display tests, so the demo stage launched it headed without X.
7. **default has no `/usr/bin/env`**: system-tools links it (450698c9b, b4712f467), but default is
   built from packages and gets env from posix, which did not keep the link. pip's NumPy build in
   "python on default" failed on `gitversion.py` (`#!/usr/bin/env python3`). posix keeps it
   (`FILE /usr/bin/env`, the link its base made); system-tools keeps its own, since the
   toolchains built on it have its env too. `default.json` runs a `#!/usr/bin/env` script.
8. **The whole catalog**: lean-browser.mjs (amy has no lean) and "dist registers every image of
   the catalog" need the Lean images.
9. **A successful SIG_SETMASK sets errno to EINVAL** (`process/signal.c` set_mask), and
   emacs's build check failed with `file-error ("Failed select" "Invalid argument")` in the
   round on 0ae1331a2. set_mask walks every number below `_NSIG` and calls musl's sigdelset,
   which refuses the three musl keeps for itself (32 to 34) with errno EINVAL. Emacs's
   really_call_select (src/thread.c) restores its mask with pthread_sigmask(SIG_SETMASK) after
   pselect and before it reads errno: when the child's SIGCHLD interrupts the wait (EINTR),
   Emacs reads EINVAL. That happens only when the signal lands during the poll, so the check
   fails by timing: 4, 3 and 2 of 10 runs in Chromium, 1 of 10 in Firefox (work/triage,
   `build/triage/emacs-check.mjs` on system with the emacs package). It needs no timer, and it
   does not happen with no timeout (0 of 10). A worker trace of the failing runs shows FD_POLL
   answered EINTR, the handler's WAIT, write and acknowledgement, then Emacs's error and no further
   select. `build/triage/mask-probe.c` shows it in both browsers: errno is EINTR before
   `sigprocmask(SIG_SETMASK, &old, NULL)`, which returns 0, and EINVAL after it; SIG_BLOCK leaves it.
   The fix is set_mask's: skip the numbers musl reserves. It changes the seed's
   libdolly-process.a (scripts/build.sh), and with it every image.
