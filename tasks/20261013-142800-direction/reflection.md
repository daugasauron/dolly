# Is the core in line with the direction?

**Short answer.** At the machine layer, yes: one import, one packet shape, one error vocabulary, and a module table that gives nena a 30-line kernel side are exactly the small typed substrate `AGENTS.md` asks for. One layer up, in three places, no. (1) The process contract carries a shell's job-control policy (`SPAWN_INTERACTIVE`) and a page-automation channel (`TERMINAL_PUBLISH_RESULT`), while it withholds the two services every interactive Unix program assumes, a line discipline and a stored file mode, so each program rewrites them. (2) The Dollyfile says "retain" four ways and "run" two, and `COPY` lets a build image serve as a library with no interface, which is why 24 of 79 packages are shadows of a toolchain's build instead of builds. (3) The supervisor and the page re-derive what the kernel and the engine already decided: the process tree, the process limit, the recipe's declarations.

**Unix philosophy, as I apply it here.** A part does one thing and its name says which. Parts compose through plain interfaces: bytes on a descriptor, an exit status, a spawn, a text file. Mechanism in the kernel, policy in the program above it. Nothing in the core that a program could provide; nothing missing from the core that every program then provides for itself. Where a thing can be a file, it is a file. Two ways to say one thing is one too many.

## 1. The process contract

**Judgement.** Small and uniform in shape; not minimal in count; carries one policy and one test hook; refuses two services wrongly.

**Evidence.** 50 operations in `include/dolly/process.h`, every error a negated `dolly_process_error`, packets with offsets, never pointers (`process.h:19-27`); modules dispatch through the same range table (`process-kernel.c:122-139`). Twins: `FD_STAT`/`PATH_STAT`, `FD_STAT_FILESYSTEM`/`PATH_STAT_FILESYSTEM`, `FD_SET_TIMES`/`PATH_SET_TIMES`, though `dolly_process_path_request` already carries `directory_descriptor` (`process.h:586-592`); `ARGUMENT_SIZES`+`ARGUMENTS`; the two flag pairs; `CLOCK_RESOLUTION` returning a constant (`process-kernel.c:2201-2215`). Three packet conventions in one contract: `TERMINAL` alone multiplexes six sub-operations (`process.h:298-305`), `FD_LOCK` alone changes its response type by a flag (`:157-159`), everything else is one op, one packet. The earlier audit's 50→36 is right in direction; I would keep `READ`/`PREAD` apart, since an offset flag on every read is a worse interface than two operations.

Policy: `DOLLY_PROCESS_SPAWN_INTERACTIVE`, "an interactive owner with running descendants is spared" (`process.h:181`; `process-supervisor.mjs:275-279`; `process-kernel.c:180-195`). That is a shell deciding how Ctrl+C reaches it, encoded as a spawn bit and implemented twice. POSIX says the same thing with `SIG_IGN`, which `src/process/signal.c:107` already honours. `SPAWN_FOREGROUND` is mechanism (who owns the terminal) and stays.

Test hook: `TERMINAL_PUBLISH_RESULT` and two of the six terminal-mailbox words (`abi/dolly-supervisor-0.wat`) exist for `submit()` in `host/input/input.mjs:284`, reachable only through `window.__dolly`; the one producer is `slop.c:5269`.

`runtime.h`: 19 functions; `dolly_isatty`, `dolly_kill`, `dolly_waitpid`, `dolly_terminal_mode_*`, `dolly_write_file` duplicate libc (`libc-adapter.c:51` is `isatty() { return dolly_isatty(); }`); six spawn wrappers of one call (`runtime-adapter.c:123-178`). Callers outside `src/process`: seven demo files, Slop, `dollyfile.c`, `amy.c`. The substrate's one real addition to POSIX is spawn-without-fork: `dolly_spawn_mapped` and `dolly_wait` are the interface; the rest is libc's job.

**Missing, and whether it belongs.**
- *Line discipline.* `ICANON`/`ECHO` "round-trip without a line discipline" (`docs/process-model.md:103`); Slop edits its own line (`slop.c:5010-5050`), and the tools round found `unzip`, `sqlite3`, `dc`, `vi` each needing an editor (audit task, item 17). Belongs: Unix put it in the kernel precisely so programs do not carry it. `dolly_kernel_socket_kind.terminal` (`process-kernel.h:61`) already gives one place per terminal kind. No new operation: with `ICANON`, a terminal read returns an edited line (BS, ^U, ^W, ^D), echoed when `ECHO`.
- *File mode.* `encode_stat` passes mode bits through (`process-kernel.c:963-964`) but nothing sets them (`__syscall_chmod` no-op, `libc-adapter.c:948-962`) and `PATH_OPEN` has no mode field. Storing twelve bits is mechanism; enforcing is policy, and the one-user decision only argues against enforcing. Today git commits every file as 644 and tar/`install -m` lose the x bit. Smallest: a mode in `dolly_process_path_request`'s `reserved` word for `OPEN|CREATE` and `CREATE_DIRECTORY`, and `SET_TIMES` becomes `SET_ATTRIBUTES` carrying mode. Enforce nothing.
- *Process listing.* `INFO` returns pid and parent (`process.h:553-556`); sbase's `kill` exists and nothing can tell it a pid. Belongs: no program can list processes without the kernel. The Unix form costs no operation: `/proc/PID/stat` as text from the kernel's path layer, which already special-cases `/proc/self/exe` (`process-model.md:40`); `ps` is then `cat`.
- *A child that outlives its parent.* Exit reclaims the subtree (`process-kernel.c:2259-2265`). Refusing is right for now: without sessions or an init to reparent to, the tree is the only ownership model, and it is what makes forced termination safe; the interactive shell is the init. Keep the refusal explicit in "Unsupported".

## 2. Host modules and `nena`

**Judgement.** One registry over five kinds of thing. The registry is uniform; the things are not; the code is honest about it. GPU is "just a module" in the kernel and the registry, and the page still names it.

**Evidence.** Eighteen manifests: seven import devices (gpu, audio, microphone, buttons, nena, http, download), four mailbox devices (display, input, upload, snapshot), two kernel kinds with no page side (`sockets.mjs` 2 lines, `pty.mjs` 3), one supervisor budget (threads), one served in the process Worker (dso, 1,176 lines of JS), two page services with no WAT, C or header (build, packages: six of ten fields empty), one runtime. Four manifest fields exist for one module each: `switches`, `provides`, `processWorker`, `boot(route)`. Operation numbers: download 51 and upload 57 inside the core's 48-59 block, the rest 128-133; `process.h:110` says "never reuse a number below" and nothing says where to start. `DOLLY_NAME_VERSION` in five of eighteen WATs.

Declaring, recording and switching are one model (demand; the page grants): `REQUIRES HOST` sealed by the engine, `dolly.host` checked by the loader, nena's switch held by the page with `/etc/dolly/enabled` a record and not an authority (`nena.mjs:11-14`). What breaks it is the page reading the declaration from two sources: the sealed artifact for packaged images, its own JS parser for custom ones (`runtime-worker.mjs:111-112`, `browser.mjs:114`).

Where a module is special: `browser.mjs:223 if (!host.enabled.includes("gpu@0")) indicateNoGpu()` and `page-indicators.mjs:33-41`; the lint's "an APPLICATION needs display@0" (`lint-dollyfiles.mjs:68`); the seed packs every module's header and client archive (`Dollyfile-system-build:9-35, 65-67`; `build.sh:234`), so the compiler image knows all eighteen modules and `gpu.h` is a toolchain input rather than a module's. `sockets@0` and `pty@0` say `HOST` though no host is involved: for them the word is wrong, and the mechanism (a kernel feature a program asks for by linking) is right.

**Smallest changes.** Each module with a client owns a package of its header and archive (`host/gpu/Dollyfile-gpu`: `gpu.h`, `gpu-abi.h`, `libdolly-gpu.a`), and `REQUIRES HEADER gpu` becomes a real interface; the seed keeps `process.h`, `runtime.h`, `toolchain.h` and libc. Delete `indicateNoGpu` and the lint's display rule: "opens" is "has ENTRY". A sixteen-number block per manifest, asserted by `test/host-modules.test.mjs:114`, which already checks collisions; drop the five `VERSION` globals. The page reads `REQUIRES HOST` from the sealed artifact only; a custom build needs the runtime line and nothing more before sealing.

`nena` itself is the shape the rest should copy: one operation, a lease device (`host/nena/kernel.c`, 30 lines), the set held outside Wasm, `fixed` a field not a name list.

## 3. The Dollyfile language

**Judgement.** Eleven directives but about twenty-two ideas; retention said four ways; `REQUIRES` has one type that checks an interface and one that checks the filesystem; three nouns for two behaviours; the language already allows the Unix composition and makes the shortcut cheaper.

**Evidence** (133 recipes on `main`: 79 packages, 34 toolchains, 20 applications).
- Retention: `FILE /p` without a body (181 of 364 `FILE` rows), `FOLDER` (41), `EXPORTS FILE name /p` (18; `REQUIRES FILE` 0 uses), `EXPORTS FOLDER name /p` (78; required twice). 256 rows retain licences and manual pages by hand.
- `REQUIRES TOOL`: 678 rows, the largest class after `SLOP` (769); it resolves `PATH` (`dollyfile.c:1586-1589`), 73 rows say `cc`, 71 `tar`. `REQUIRES ENV`: code at `:1585`, 0 uses. `REQUIRES HEADER`/`LIB` look up an export (`:1591-1594`): that is the interface check, and it is the right one.
- `RUN`: 5 rows, all `Dollyfile-system-build:88-112`, to compile Slop before Slop exists. `SLOP` is one line: 25 rows run a script a `FILE` row wrote.
- Roles: the engine distinguishes `APPLICATION` from `TOOLCHAIN` by one check, "missing ENTRY" (`:1810`); 32 of 34 toolchains have `ENTRY` and open; both are `FROM`-able (`zero-ad FROM default`, `pi-local FROM pi-agent`). The real split is `:1401`, `keep = !(package_recipe && mode != IMPORT_COPY)`.
- Composition: 54 packages hold their build; 20 are `FROM builder` plus `EXPORTS` (`Dollyfile-ninja`: eleven lines, three of substance); 4 are `COPY` roots. `COPY`: 108 rows out of 19 images (neovim-build 23, zero-ad-deps 15, wine-build 15), 5 relocate. SpiderMonkey has a toolchain of its own, `zero-ad-spidermonkey`, and no package; the game copies two rows from it. The right shape is already in the tree: `demos/tools/` holds 24 packages `FROM tools-build`, each with its own build (`jq`, `sqlite`, `sbase`). Note that `sbase` is now built twice: in `system-tools:20-42` (viewed by `posix`) and in `demos/tools/Dollyfile-sbase`.

Why the shortcut is easy: a view or a `COPY` row declares no interface and builds nothing; the language already has what the right thing needs (`INSTALL` anywhere, a package `FROM` a toolchain), and nothing makes the wrong thing hard.

**Smallest changes.**
1. `FILE` and `FOLDER` retain; `EXPORTS` is `TOOL | LIB | HEADER | ENV`; `REQUIRES` is `HOST | LIB | HEADER`. Six sub-types gone, 700 rows gone, one meaning per word.
2. `COPY` goes. A build's output enters the catalog only as a package: either the package holds the build, or, until it does, it is `FROM builder` with `EXPORTS`/`FILE` rows (the view form, which at least names an interface). The five relocations become a `mv` in the package. `docs/dollyfile.md:262`, "the same COPY rows in two recipes are a missing package", is then the language.
3. Two roles, `IMAGE` and `PACKAGE`; "opens" is a property.
4. `SLOP` takes an indented body with the lexer `FILE` has; `bootstrap.c` compiles Slop as it compiles `/bin/dollyfile`, and `RUN` goes.
5. `/usr/share/licenses/**` and `/usr/share/man/**` retained by path.

Pins and versions in references stay as they are.

## 4. The browser runtime

**Judgement.** The import boundary is mechanism and small (twelve imports, `abi/dolly-browser-0.wat` 43 lines); around it, 10,578 lines of trusted JavaScript (`src/` 4,199, `host/` 6,379) re-derive three things the sandbox owns and ship a test harness.

**Evidence.**
- *The process tree, twice.* The supervisor keeps `parent` per process (`process-supervisor.mjs:227`) and walks it (`#descendantDepth` `:238-247`, `#interruptForeground` `:268-280`, `#terminateDescendantWorkers` `:757-769`); the kernel has `dolly_process_descends_from` (`process-kernel.c:168`) and decides the foreground (`:180-195`). The supervisor chooses whom SIGINT reaches (`:277`): the INTERACTIVE policy lives in JS and C. The limit twice: `processWorkerLimit = 32` (`:23`, `:201`, `:538`) beside `DOLLY_KERNEL_PROCESS_LIMIT = 32` (`:21`, `EAGAIN` at `:697`). The pattern that removes this exists: `take_alarm` and `_dolly_pty_take_signal` hand the supervisor the next pid to signal (`:253-265`).
- *The recipe language, twice.* `dollyfile-view.mjs` (317) + `dollyfile-graph.mjs` (125) + `image-build.mjs` (98) compute the build closure and the trust set (`hostRequirements`, `from`, `entry`) on the page. The engine already drives a fetch-on-demand loop for `INSTALL` rows, `ROW_FIRST` (`dollyfile.c:1329-1350`), which amy obeys; the page's packaged-image path reads `hostRequirements` from the sealed artifact (`runtime-worker.mjs:111`).
- *Test surface as product.* `window.__dolly` (`browser.mjs:226-230`), `terminal-text.mjs` (63 lines), input's `submit/input/paste/key` (`input.mjs:489-495`), display's `page`, the `PUBLISH_RESULT` channel. Sixty-three test files use it; outside tests only two release scripts do.
- *A dynamic linker in JavaScript.* `host/dso/process.mjs` and `ffi.mjs` (1,176 lines) do what `ld.so` does, in the process Worker, with no browser authority. Wasm cannot call `WebAssembly.instantiate`; it can do everything else.
- *Rightly JS:* `host/http/*` (policy before Fetch), display's painter, input's listeners, snapshot's IndexedDB, threads' Worker budget, `modules.mjs` (the registry and the switch, 334 lines).

**Smallest changes.** `take_interrupt` iterates like `take_alarm`, returning each target the kernel chose; one export lists a process's descendants deepest-first; delete the JS tree walk and the JS limit. The engine asks for every pin it lacks (`FROM`, `COPY`, `INSTALL`) and the page hands over bytes by pin, as `packages@0` already does; the page then parses no recipe, and `dollyfile-view.mjs` stays a script-side tool. `__dolly`, `terminal-text.mjs`, the four input members and `PUBLISH_RESULT` move to a module the test harness injects. The dso loader is a direction, not a first step: a `libdl` in the process resolves symbols; JS keeps one call.

## 5. The base images

**Judgement.** The engine composes; the recipes mostly do not. Builds live in toolchains and packages are their shadows, which the owner's SpiderMonkey example names exactly.

**Evidence.** `system-tools` has 104 `FROM`-descendants of 133 (`system-build` 122); it holds sbase, git, awk, samurai, sixteen commands, download and upload in 449 lines, and `INSTALL display` at `:447`, so the terminal emulator is an input of every compiler build. `posix`, `git`, `ninja`, `transfer`, `amy` are views of it; `system` is `system-tools` plus one `SLOP`. Twenty views over twelve builders; a demo's build image is a library: `zero-ad-deps` has five `FROM`-descendants and fifteen `COPY` rows into it from `wine-build` and `xonotic-build`. The counter-example is in the tree: `demos/tools/` packages each hold their build and `tools-build` is a composition.

**Smallest change.** Invert the base, with no new syntax: `system-build` keeps the seed, the compiler and Slop; `sbase`, `awk`, `git`, `ninja`, `transfer`, `amy` are packages `FROM system-build` that hold their builds; `system-tools` is `FROM system-build` plus `INSTALL` rows; `system` is `system-tools` plus `INSTALL display`. `zero-ad-spidermonkey` gets a `mozjs` package the game installs. The two sbase builds become one.

## 6. What is good, specifically

- `dolly_process_call` with offset packets and the negated error enum (`process.h:19-27`); modules dispatch through `dolly_kernel_module` (`process-kernel.h:21-26`). The template for every operation.
- `src/device-lease.c` (84 lines) and `host/lease-bridge.mjs` (65): gpu's kernel side is 111 lines, nena's 30. A new device is a WAT, a header, thirty lines of C and a provider.
- `dolly_kernel_socket_kind` (`process-kernel.h:55-63`): pty and sockets as descriptor kinds with two- and three-line JS files; the terminal request answered per kind. This is how "a kernel feature is a module" works.
- `socket-refusals.c` and archive order; `ENOSYS` as the one answer of a disabled module (`modules.mjs:264-269`).
- `/etc/dolly/installed`, `enabled`, `files/NAME`, `environment`, `entry`: text files amy, nena, the engine and the page all read; the record is never the authority.
- The terminal emulator as a file in the image (`/usr/lib/libdisplay.so`, `EXPORTS ENV DISPLAY`) rather than page code; `/bin/foreground` as a command, so "the browser knows no command names" (`process-model.md:252`).
- `fixed` as a manifest field; `module.json` naming every file; WAT canonical; the digest over exact bytes.
- `SOURCE LOCATION SHA256 DEST`; `INSTALL` anywhere; a package's record naming its rows so amy needs no solver; `REQUIRES HEADER`/`LIB` checking an export.
- `demos/tools/`: built the way packages should be.

## In order of how much smaller and more composable the core gets

1. `FILE`/`FOLDER` retain; `EXPORTS` is TOOL/LIB/HEADER/ENV; `REQUIRES` is HOST/LIB/HEADER.
2. `COPY` goes; a build's output enters the catalog only as a package, and the base inverts into packages that hold their builds.
3. `SPAWN_INTERACTIVE` goes (Slop ignores SIGINT while it waits); the kernel hands the supervisor its signal targets; the JS tree and limit are deleted.
4. Two roles, `IMAGE` and `PACKAGE`.
5. Module SDKs leave the seed as packages; the page and the lint stop naming gpu and display.
6. `PUBLISH_RESULT`, its mailbox words, `__dolly` and `terminal-text.mjs` leave the product.
7. A line discipline in the terminal kind; a stored, unenforced file mode; `/proc/PID/stat`.
8. The engine asks for every pin; the page parses no recipe.
9. `SLOP` with a body; `RUN` gone.
10. `runtime.h` to `dolly_spawn_mapped` and `dolly_wait`; fd/path and size twins merged; a number block per module.

## What I could not judge

Whether Slop can ignore SIGINT across a `WAIT` cleanly without the flag (`SA_RESTART` on wait is documented, not run by me). Whether pack reassembly in `image-artifact.mjs` must stay in JS or could be a kernel import of bytes by pin. The cost of moving the dso loader's resolution into Wasm. Nothing here was run in a browser; every claim is from reading `main` at `d89bca74`.