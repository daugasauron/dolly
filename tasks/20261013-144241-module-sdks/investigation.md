# Host modules' headers and clients in the seed, and what a host module is: the investigation

Read at `/home/daug/dev/dolly/work/rust` (branch `integrate/round-1013`, head `3e48fb4e`, 2026-10-14); history shared with `main`; tasks at `/home/daug/dev/dolly/tasks/` and in this tree. The reflection's tree is `d89bca74`. Nothing was built or run; every number comes from `git`, `grep`, the files and the manifests. Line numbers are of this tree unless a commit is named.

## Summary (findings, no advice)

1. The seed has held every module header since before host modules had a name: `018c5f27` (2026-09-27) lists `gpu.h`, `gpu-abi.h`, `http.h`, `display.h`, `threads.h`, `upload.h`, `snapshot.h` among the files packed into `/seed/usr/include/dolly`, and the process sysroot (client archives) has been in the seed since `b95459ce` (2026-09-05). The manifests (`fe9cac9a`, 2026-10-01) replaced the hand list with "every manifest's headers"; they did not put headers into the seed.
2. The reason at least two module headers must be in the seed is mechanical: the bootstrap compiles the Dollyfile engine from the seed before the first recipe runs (`src/process/bootstrap.c:38-51`, `docs/sources.md:21`), and `src/dollyfile.c:16-17` includes `<dolly/host-abi.h>` and `<dolly/http.h>`. The libc adapter includes `<dolly/pty.h>` (`src/process/libc-adapter.c:4`) and `<dolly/threads.h>` (`src/process/threads.c:5`); the display plugin includes `display.h` and `input.h` (`src/ghostty/display.c:15-16`). Five headed modules are included by no core or base source: gpu, audio, microphone, buttons, sockets.
3. A module's client as a recipe-built library existed: `modules/gpu.dm` (2026-09-24 to 2026-10-01) fetched `gpu.h`, `gpu-abi.h` and `client.c` and ran `cc` and `ar` to make `/usr/lib/libdolly-gpu.a`. It was removed by `07cf1657` because "The GPU client shipped twice (seed sysroot and modules/gpu.dm) and audio only in-image", six minutes after `790d66ec` made `cc` link every client archive by default.
4. `gpu-sdk` and `audio-sdk` were made on 2026-09-24 (`a433b000`, no message body) as `system` plus `USE gpu.dm`; from 2026-10-01 they were `system` plus one `REQUIRES HOST` line, whose recorded purpose was a shell in which programs compiled after boot could use the module (`tasks/20261001-214000-dollyfile-v6/TASK.md:224-227`); `nena@0` gave that purpose a command and `b005aad5` deleted them: "Each of the two added no file to `system`: it existed to pin one REQUIRES HOST line".
5. Today the seed (`dist/dolly.data`, an image input: `scripts/write-build-id.mjs:8-11`) holds 33 headers (14 modules' pairs and the runtime's 5) and 15 client archives. The root recipe pins 25 of the headers by `SOURCE` (`Dollyfile-system-build:9-35`: 20 of ten modules, 5 of the runtime) and two archives by `EXPORTS LIB` (`:66-67`); the four newest modules' headers (microphone, buttons, nena, pty) are in the seed and have no row. A change to any of these files, or to a WAT that changes a digest, makes every image stale; kernel C and page JavaScript do not (measured in the pty, nena and microphone tasks).
6. The reflection's `browser.mjs:223` and `page-indicators.mjs:33-41` were true at `d89bca74` and are gone here (`990b2e28`); `src/browser.mjs` and `src/page-indicators.mjs` name no module. The lint names `display@0` (`scripts/lint-dollyfiles.mjs:67-68`); so do `generate-routes.mjs:39`, `image-menu.mjs:30` and `dolly.artifacts.mjs:341` (openability), `host/modules.mjs:13` (the build host: `http@0`, `threads@0`, `dso@0`), `host/requirements.mjs:57` and `src/dollyfile.c:2207` (`nena@0`), `src/process-supervisor.mjs:196,418,427` (`threads@0`), `src/commands/amy.c:232` (`packages@0`).
7. "Five kinds under one name": the reflection's own list has seven groups and they sum to 18; each group is true by the manifests, and the project's own review map draws the same groups (`docs/browser-boundary.md:13-47`). "Mailbox" does not partition them: ten module contracts export a mailbox, not four. What is uniform across all 18 is the manifest, the `name@version`, the `REQUIRES HOST` line, the registry's lifecycle, `ENOSYS` when disabled, and `nena`'s list.
8. `sockets@0` and `pty@0` have no import, no page side (2 and 3 lines of JS), and nothing outside Wasm (`docs/browser-boundary.md:75-76`). `pty@0` does have a supervisor contract that trusted code polls (`host/pty/dolly-pty-supervisor-0.wat`). The word is the owner's: "Of course it needs to be declared" and "declared only by programs that require only at link time" (2026-10-08); the agent's recommendation of that day, "no declaration; local sockets as core process operations", was not taken. The one fact the line holds that nothing else holds: that a program linked `-ldolly-sockets` runs only in an image that lists `sockets@0`.
9. Measured cost of a new module, from its commits: files outside `host/NAME/` were 5 and 13 (pty, two commits), 22 (microphone), 15 (buttons), 46 (nena), 78 (sockets, 73 of them recipe repins); images rebuilt: all, in each case, because the seed changed. The design's "adding a module touches only its directory plus the two review points" (`tasks/20261001-000000-host-modules/TASK.md`) holds for neither the documents (four images pin them) nor `host/manifests.mjs`.
10. Not found: why the root recipe pins headers the seed already holds (the rows and the seed list have coexisted since `018c5f27`, no message says); why the four newest modules have no rows; whether a package-installed archive would be linked by `cc` by default (it scans one directory, `src/compiler.cpp:811-823`); the owner's reason for the SDK images on 2026-09-24.

---

## 1. History

### 1.1 Before the word (2026-08-29 to 2026-09-26)

- The GPU came as "a sandbox GPU ABI with a separate shader demo image" (`d19df4bc`, 2026-09-14) with `include/dolly/gpu.h` and `gpu-abi.h`; `2a14ff91` and `f85dedf1` (same day) built llama.cpp and the fluid demo against it. Audio: `548f87ee` (2026-09-24). Headers lived in `include/dolly/`.
- The seed already carried them. At `018c5f27` (2026-09-27) `toolchain/CMakeLists.txt:88-104` packed into `/seed/usr/include/dolly`: `http.h`, `display.h`, `download.h`, `runtime.h`, `process.h`, `threads.h`, `threads-abi.h`, `toolchain.h`, `host.h`, `host-abi.h`, `gpu.h`, `gpu-abi.h`, `upload.h`, `snapshot.h`. The process sysroot went into the seed at `b95459ce` (2026-09-05, `@/seed/usr/lib/dolly/process`). `fa691966` (2026-09-24, "Build the compiler seed from fresh pinned SDK headers") replaced the SDK cache's `include` with a fresh Emscripten sysroot so that ports' headers (`png.h`, Boost, ICU) stopped leaking into the seed (`test/dolly.artifacts.mjs:101-103` still checks this).

### 1.2 The definition (2026-09-26, `tasks/20260926-092542-codex-host-modules/TASK.md`)

The owner's request, as recorded: "User wants images to declare host requirements such as threads, with each module exposed through one public host JS module paired with one public C header." The design that followed (an agent's, verified 2026-09-26):

> "Headers declare types and functions; programs link small Wasm client libraries (`-ldolly-gpu`, `-ldolly-http`). Libraries marshal calls into the existing process/kernel substrate. They contain no browser implementation." (`:43-45`)
>
> "Linking a module must record its required ABI in the executable. Merely including a header must not require a host provider." (`:51-52`)
>
> "Build and run requirements are distinct. Compiling a GPU program must work on a headless builder without a GPU. FROM inherits base runtime requirements; COPY must not import a donor image's ENTRY requirements." (`:101-103`)
>
> "Runtime is the mandatory base." (`:63`)

`REQUIRES HOST` came with DOLLY 4 in `018c5f27` (2026-09-27): "`REQUIRES HOST module@abi`: Require a host provider when running the image" (`docs/dollyfile.md` at that commit, `:96`), "Host requirements propagate through `FROM` and `USE`. `COPY FROM` copies files without importing the donor's runtime requirements" (`:125-126`), and "Build hosts supply their own providers. Compiling a GPU program needs no GPU" (diff line 96).

### 1.3 The SDK images and the in-image client (2026-09-24 to 2026-10-01)

- `a433b000` (2026-09-24, "Build reusable audio and GPU SDKs inside Dolly and harden PCM lifecycle", no body) created `Dollyfile-gpu-sdk` (`IMAGE gpu-sdk`, `FROM HOST /Dollyfile-system`, `USE HOST /modules/gpu.dm`, `ENTRY /bin/foreground -i /bin/slop`) and `Dollyfile-audio-sdk`, plus `modules/gpu.dm` and `modules/audio.dm`. `gpu.dm` was the package shape, in DOLLY 3 words:

  > `SOURCE HOST /include/dolly/gpu.h /usr/include/dolly/gpu.h …`, `SOURCE HOST /static/gpu/client.c /usr/src/dolly/gpu/client.c …`, `SLOP cc -std=c17 -O2 -c /usr/src/dolly/gpu/client.c -o /tmp/dolly-gpu.o`, `SLOP ar rcs /usr/lib/libdolly-gpu.a /tmp/dolly-gpu.o`, `EXPORTS HEADER gpu …`, `EXPORTS LIB dolly-gpu /usr/lib/libdolly-gpu.a` (`a433b000:modules/gpu.dm`)

  At the same time the seed held `gpu.h` and `gpu-abi.h` (1.1). So from 2026-09-24 to 2026-10-01 the header was in two places and the client was built by a recipe.
- `790d66ec` (2026-10-01 00:48, "Link every host module client by default"): "The compiler, build.sh and CMake named five default client archives; the compiler now links every libdolly-NAME.a in the process sysroot and the host build uses the manifests. Static archives contribute only referenced members, so an executable still records only the host modules it calls."
- `07cf1657` (2026-10-01 00:54, "Deliver GPU and audio clients through the seed only"): "The GPU client shipped twice (seed sysroot and modules/gpu.dm) and audio only in-image. Every module's header and client now come from the seed: bootstrap.dm publishes the audio headers and exports the dolly-gpu and dolly-audio libraries from the process sysroot; modules/gpu.dm and modules/audio.dm and their staged client sources are gone." The diff removed `USE HOST /modules/gpu.dm` from `Dollyfile-gpu-sdk` and added `EXPORTS LIB dolly-gpu /usr/lib/dolly/process/libdolly-gpu.a` and the audio rows to `modules/bootstrap.dm` (today `Dollyfile-system-build:54-55, 66-67`). 43 recipes were repinned by it.
- The host-modules task records both as its result: "`cc` links every client archive by default; GPU and audio clients ship once, in the seed (`790d66e`, `07cf165`)" (`tasks/20261001-000000-host-modules/TASK.md`, Progress 2026-10-01).

### 1.4 One directory and one manifest per bridge (2026-09-30 to 2026-10-06)

`tasks/20261001-000000-host-modules/TASK.md`:

> "Owner direction (2026-09-30/10-01): the core is library code for a generic, extensible runtime. A host bridge is one modular component: a host JS module plus the runtime C header that maps to it. Chosen layout: one directory per module." (`:7-10`)
>
> "Each module is described by one manifest, `host/<name>/module.json`, the only place its files are listed (owner, 2026-10-01). Everything reads it generically: the registry loads the manifest and the provider it names; the build takes kernel sources, process clients, headers and WAT contracts from it" (`:22-26`)
>
> "Adding a bridge = its directory + one registry line + its import in `abi/dolly-browser-0.wat` + its row in `docs/browser-boundary.md`. The last two stay hand-written: they are where a human reviews authority." (`:33-36`)
>
> Done when: "Adding a module touches only its directory plus the two review points." (`:70`)

The memory note of 2026-10-01 holds the owner's reason: "If the core is slop it will be impossible to extend it"; "the owner likes the host JS module ↔ runtime C header mapping as the unit of extension" (`host-module-architecture.md`).

`fe9cac9a` (2026-10-01) made the seed's header list `/src/build/include/dolly@/seed/usr/include/dolly` in place of the hand list (diff of `toolchain/CMakeLists.txt`), fed by `scripts/build.sh:93-95` from every manifest's `headers`. Owner decision of 2026-10-01, stage 3: "Per-module digests: display, HTTP, download and upload packets move from `process.h` into their modules' headers, each with a layout digest its client stamps … `process.h` keeps only the core process ABI" (`:144-148`); `cec22729` did it ("Identify host modules by their own ABI digest"). `97c34d4d` (2026-10-06) made the seed a Dolly snapshot (`dolly.data`), "Image inputs change … so every image is rebuilt".

### 1.5 Phase 3: explicit and never inherited (2026-10-01 night, `9fc8b997`, `5ec4783c`)

`5ec4783c`'s message: "REQUIRES HOST is the image's complete list: nothing is inherited through FROM, INSTALL or COPY, a package's lines must be declared by its installer, and sealing scans every retained Wasm module's dolly.host records against the declared set. Every image now declares what its executables stamp (the engine stamps http@0; download and upload tools from system-tools on; gpu@0 for local-llm-build). Receipt v5 records the role, the host list and the exports."

The design task records the owner's correction and a reason that bears on this task:

> "**Host requirements are explicit and never inherited.** (Owner correction.) The image's own recipe is the complete list … The derivation was checked and rejected as a replacement: only audio, display, download, gpu, http, threads and upload have stamping clients; `snapshot@0` and `build@0` have none, and `gpu-sdk`, `audio-sdk` and `system` enable modules for programs compiled after boot, which nothing retained stamps. At run time enabled equals declared" (`tasks/20261001-214000-dollyfile-v6/TASK.md:217-230`)

So the SDK images had a recorded purpose after `07cf1657`: a shell image whose list includes `gpu@0`, so that a program compiled inside it can run there. Before `nena@0` no other mechanism gave a session a module its image did not list.

### 1.6 What became a module, when, and by whose word

| Module | First manifest | What it was before | The word |
| --- | --- | --- | --- |
| display, http, download, upload, snapshot, threads | `fe9cac9a` 2026-10-01 | `include/dolly/*.h` and `src/*-provider.mjs`; "Dollyfile v4 host modules" (`018c5f27`, 2026-09-27) | owner's 09-26 request; threads "the first new module" (`:117`) |
| gpu, audio | `fe9cac9a` | a "GPU extension" with op 128 (`d19df4bc`, 09-14); SDK images and `.dm` clients (`a433b000`, 09-24) | |
| runtime | `fe9cac9a` (implicit); explicit `REQUIRES HOST runtime@0` 2026-10-07 | "the one implicit host module" | owner 2026-10-02: "I thought subprocesses would be a host module? And the dolly-runtime? Not sure if it makes sense or not to have the runtime as a requirement but seems modular and nice."; 2026-10-06: "I like explicit things, add runtime@0. Ideally people can create their own runtimes with the same syntax." (`tasks/20261005-222057-explicit-runtime/TASK.md:7-9`) |
| build | `98876f02` 2026-10-01 | build wiring in `browser.mjs` | owner direction 09-30: "a running image cannot start builds or write the image cache unless it explicitly requires a build capability" (`tasks/20260930-090100-owner-direction/TASK.md:26-27`) |
| packages | `b60b426a` 2026-10-02 | the package service for `amy` | packages task |
| dso | `5dbcfad9` 2026-10-06 | 7 operations of `process.h`, 1,028 lines in every process Worker | owner 2026-10-06: "I like the dso thing." (`tasks/20261006-111835-dso-module/TASK.md:13-15`) |
| input | `56255e61` 2026-10-06 (merged `a1284224`, 10-08) | part of `display@0` | owner 2026-10-02: "I feel like mouse/keyboard should be a host module." (`tasks/20261002-072000-input-host-module/TASK.md:19-20`) |
| sockets | `21c855b7` 2026-10-08; opt-in `ef4b01dc` | 18 `ENOSYS` stubs in `runtime-adapter.c` | owner 2026-10-07: "The reason I didn't want them was mainly to restrict network stuff, but maybe worth adding something like that."; 2026-10-08: "Of course it needs to be declared, thats why I want to include it with the other neccesary rebuilds"; "git with 3rd, declared only by programs that require only at link time. Things that don't need it to run shouldnt require it." (`tasks/20261007-074904-sockets-module/TASK.md:163-187`) |
| microphone | `ef06bf34` 2026-10-10 | nothing (`audio@0` "grants no capture") | owner 2026-10-10: "implement and add a host module that can capture the microphone through the browser." (`tasks/20261010-114415-microphone/TASK.md:7-8`) |
| buttons | `7a6daada` 2026-10-10 | nothing | owner 2026-10-10: "I think the phone input stuff requires it's own host bridge to be nice? separate from the "normal" input module." (`tasks/20261010-193000-phone-voice-pi/TASK.md:49-50`); 2026-10-13: "rework the "buttons module" completely … the module hsould be very generic … I don't like the module contract" (`tasks/20261013-144001-touch-module/TASK.md:7-12`) |
| pty | `d9f8104e` 2026-10-12 (prototype); contract `706afa45` 10-13 | nothing (`openpty` found no `/dev/ptmx`) | owner 2026-10-13: "adding pty is fine" (`tasks/20261012-130814-tmux/TASK.md:30`) |
| nena | `a182787a` 2026-10-13 | nothing | owner 2026-10-13: "add a new host module that makes it possible to add host bridges from inside the runtime … The config/status of the host bridge should be controlled by a command line tool called nena."; "if you have the nena bridge you can freely configure which host bridges are enabled during runtime. If you don't have it, the runtime can't change any host bridge related functionality" (`tasks/20261012-230015-bridges/TASK.md:7-16`) |

Not made modules, and why: `spawn@0` (recommendation "no: the line would be in 52 of 61 recipes" and "spawn grants no browser authority beyond the Workers and memory the ENTRY process already has", `tasks/20261002-073000-runtime-process-modules/TASK.md:67-77`; owner 2026-10-06 "undecided, leaning toward a module", `:113-124`; not built); smaller runtime splits (clocks, environment, backing store, output, terminal: "each costs a manifest, a contract, a digest and a boundary row, and every image needs all of them", `:78-85`; owner: "none, as recommended", `:125`); a time-zone bridge ("I don't want to add like timezone host bridges", `tasks/20261013-133111-tmux-use/TASK.md:51`).

### 1.7 Every recorded statement of what a module is

Owner's:

- 2026-09-26: "each module exposed through one public host JS module paired with one public C header" (1.2).
- 2026-09-30/10-01: "A host bridge is one modular component: a host JS module plus the runtime C header that maps to it" (1.4).
- 2026-10-02: subprocesses and the runtime as modules "seems modular and nice" (1.6).
- 2026-10-06: "I like explicit things, add runtime@0. Ideally people can create their own runtimes with the same syntax."
- 2026-10-08: sockets "needs to be declared"; "declared only by programs that require only at link time".
- 2026-10-13: "host bridges … enabled during runtime"; "GPU is just a module, and the other programs has no dependency on being run on a CPU, they only need POSIX" (`tasks/20261013-135951-no-cpu-gpu-category/TASK.md:7-10`); the buttons contract is a module's contract and he does not like it; "I don't want to add like timezone host bridges".

Agents', with what became of them:

- 2026-10-05 (review of the runtime split, concurred by the big-picture review): "a module is browser authority that some image omits, and no runnable image can omit spawn, clocks or the filesystem" (`tasks/20261002-073000-runtime-process-modules/TASK.md:89-91`). The owner's next decisions went past it twice: `runtime@0` is a module no image omits, and `sockets@0` and `pty@0` are modules with no browser authority.
- 2026-10-08 (sockets): "Recommendation: no declaration; local sockets as core process operations, as `spawn@0` was decided … The line would be in every runnable image and omitting it sheds no kernel import, no trusted JavaScript and no browser authority" (`:261-264`). Not taken; the opt-in at link time was the owner's answer to the 51-recipe count.
- The documents today: "A host module is one bridge between the Wasm userspace and the browser, in one directory" (`host/README.md:3-4`); "`REQUIRES HOST` lines and executable `dolly.host` records … are compatibility demands, not grants" (`docs/browser-boundary.md:81-83`); "`REQUIRES HOST name@abi` describes running the image: a module name of at most 31 bytes" (`docs/dollyfile.md:208-209`); "Executables carry no `dolly.host` record for their runtime … runtimes that implement the same contract run the same executables" (`host/README.md:150-157`).

### 1.8 `gpu-sdk` and `audio-sdk`, from birth to deletion

| When | What |
| --- | --- |
| 2026-09-24 `a433b000` | born as `system` + `USE gpu.dm` (the client built in-image) + shell `ENTRY`; `test/dolly.artifacts.mjs` of `fa691966` expected `/usr/lib/libdolly-gpu.a` in `gpu-sdk` and `/usr/lib/libdolly-audio.a` in `audio-sdk` |
| 2026-09-30 `faf8f364` | `REQUIRES HOST gpu@0` added ("explicit v4 host modules") |
| 2026-10-01 `07cf1657` | `USE gpu.dm` removed: the client comes from the seed; the image is `system` + one line |
| 2026-10-01 `5ec4783c` | the line becomes the complete list (6 lines, then 8 with runtime and input) |
| 2026-10-07 | "`gpu-sdk`, `audio-sdk`: named in the brief, but they are TOOLCHAIN images, not packages: `amy install` cannot name them" (`tasks/20261007-003116-package-needs/TASK.md:83`) |
| 2026-10-10 `ef06bf34` | `audio-sdk` gains `microphone@0`: "`audio-sdk` declares it; no other image does" |
| 2026-10-12 | packages rules: "Not a package: … a host-module set without files (`gpu-sdk`, `audio-sdk`: a package cannot add a module to a booted image)" (`tasks/20261012-130814-packages/TASK.md:39-42`); the table: "stay: their client libraries and headers are in `cc`" (`:69`) |
| 2026-10-12 audit | finding 1: "`audio-sdk` and `gpu-sdk` are empty images; nena makes their one purpose a command … 0 files added … two of 54 opened images exist to pin one `REQUIRES HOST` line; with nena, "a shell with a GPU" is `default` plus `nena enable gpu`" (`tasks/20261012-230015-audit-fable/packages.md:36`) |
| 2026-10-13 `b005aad5` | deleted: "Each of the two added no file to `system`: it existed to pin one REQUIRES HOST line … With nena@0 a shell with a GPU is `default` and `nena enable gpu`." The tests "open `system` with the module added, composed in the page" |

So the SDK images carried a module's client for one week (1.3) and a module's declaration for twelve days (1.5). Neither was ever a package.

### 1.9 The seed and the root recipe, side by side

- Seed, today: `toolchain/CMakeLists.txt:83-96` packs `/src/build/include/dolly@/usr/include/dolly` (`:87`; `build/include/dolly` is every manifest's `headers`, `scripts/build.sh:93-95`), `${DOLLY_PROCESS_SYSROOT_DIR}@/usr/lib/dolly/process` (`:93`; every manifest's client archive, `scripts/build.sh:234-235`, `scripts/prepare-process-sysroot.sh:54-58`), and `/src/src/dollyfile.c@/usr/src/dolly/dollyfile.c` (`:88`), which `bootstrap` compiles (`src/process/bootstrap.c:38-51`) before any recipe. `docs/sources.md:21`: "the seed holds headers and the Dollyfile engine source, which `bootstrap.c` compiles before the first recipe".
- Root recipe, today: `Dollyfile-system-build:6-8` says "its exact compiler commands and C headers are the externally supplied bootstrap seed. How those headers eventually map to the lower-level machine contract is deliberately open." Then 25 `SOURCE` rows (`:9-35`) fetch headers from the site at their checkout paths (`/v0.1.3/host/gpu/gpu.h …`) onto the same paths the seed already has, 26 `EXPORTS HEADER` rows (`:37-63`) name them for `REQUIRES HEADER`, and three `EXPORTS LIB` rows (`:65-67`) name `compiler-rt`, `dolly-gpu` and `dolly-audio`; `EXPORTS FOLDER process-sdk /usr/lib/dolly/process` (`:71`) retains every archive.
- The rows descend from `modules/bootstrap.dm` (there at `018c5f27`), the paths changed at `9c56fcf7` (2026-10-01, "Serve the checkout as plain static files at their repository paths") and `5ec4783c`; `dso` rows came with `5dbcfad9`, `sockets` rows with `21c855b7`; `microphone` (`ef06bf34`), `buttons` (`7a6daada`), `pty` (`706afa45`) and `nena` (`a182787a`) added none (`grep -c host/microphone Dollyfile-system-build`: 0, same for the other three). No message says why the rows exist beside the seed, nor why the four newest modules have none (section 6).

### 1.10 Reasons in the history that the reflection does not cite

- The headers were in the seed before host modules existed (1.1); the manifests only changed how the list is made.
- The engine, the libc and the display plugin include module headers and are compiled from the seed or its first bases (summary 2), so "the toolchain knows the module" is partly a consequence of the core using its own modules.
- The package shape for a client was tried and removed for duplication, not for a design reason (`07cf1657`), on the day the compiler began linking every client by default (`790d66ec`).
- The owner's 09-26 design made "build" and "run" distinct ("Compiling a GPU program must work on a headless builder without a GPU") and "Merely including a header must not require a host provider"; both are in the code today (`abi/dolly-host-0.wat:9-11`: "Header inclusion alone contributes nothing").
- `sockets@0`'s word was decided by the owner against a recorded recommendation (1.7); `pty@0` followed it "as for `sockets@0`" (`tasks/20261012-130814-tmux/TASK.md`, proposal point 1).
- The "browser authority that some image omits" definition is an agent's of 2026-10-05, not the owner's, and the owner's later decisions do not fit it.

## 2. What it is today

### 2.1 The eighteen manifests (`host/manifests.mjs:3-4`; `host/*/module.json`)

| Module | `phase` | `fixed` | Imports | Contract WAT (lines) | Process WAT | Headers (lines) | Kernel C (lines) | Client C (lines) | Page or Worker JS (lines) | Mailbox export | What `nena` does (`tasks/20261012-230015-bridges/TASK.md:147-173`) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| runtime | kernel | "it is the kernel"; `provides: kernel` | 5 (`memory`, `bootstrap_write_bytes`, 2 clocks, `entropy`) | supervisor, image (`abi/`) | process, gate (`abi/`) | `runtime.h`, `process.h`, `host.h`, `host-abi.h`, `toolchain.h` | `dolly.c`, `process-kernel.c`, `system-snapshot.c`, `device-lease.c`, `file-blocks.cpp`, `libc-host.c` | `runtime-adapter.c`, `socket-refusals.c` | `runtime.mjs` 129, `boot-files.mjs` 45 (+ `src/process-supervisor.mjs`) | terminal mailbox | fixed |
| display | image | "its driver is installed once, before ENTRY" | 0 | 82 | | `display.h` 249, `-abi.h` 40 | 503 | 213 | 364 | yes | fixed (measured: second start refused) |
| input | image | "it is the terminal's input" | 0 | 48 | | `input.h` 185 | 267 + `ring.c` 67 | 62 | 537 | yes | fixed |
| http | kernel | "the page's HTTP policy is consumed once" | 1 | 70 | | `http.h` 168 | 333 | 207 | 67 + broker 275 + policy 308 + local-services 37 | yes | fixed |
| gpu | kernel | | 1 | 181 | | `gpu.h` 46 | 29 | 82 | 110 + bridge 45 + worker 699 | yes | switched (`check()` asks for the adapter) |
| audio | kernel | | 1 | 41 | | `audio.h` 24 | 29 | 78 | 54 + provider 120 (+ `lease-bridge.mjs` 65 shared) | yes | switched |
| microphone | kernel | | 1 | 50 | | `microphone.h` 28 | 30 | 84 | 66 + provider 132 + worklet 19 | yes | switched (the prompt still decides) |
| buttons | kernel | | 1 | 64 | | `buttons.h` 50 | 34 | 112 | 89 + provider 94 | yes | switched |
| nena | image | `switches: true` | 1 | 53 | | `nena.h` 38 | 30 | 81 | 133 | yes | disabled only |
| download | (absent) | | 1 | 27 | | `download.h` 20 | 95 | 30 | 153 | no | switched |
| upload | image | | 0 | 46 | | `upload.h` 21 | 134 | 30 | 43 + transport 154 | yes | switched (measured) |
| snapshot | image | "its baseline is the image as loaded" | 0 | 44 | | none in the manifest (`snapshot.h` 18, kernel-private) | 464 | none | 111 + transport 132 + ui 218 | yes | fixed (not tried) |
| threads | (absent) | | 0 | supervisor 10 | 18 | `threads.h` 31 | 170 | 36 | 36 | no | switched (its Workers terminated) |
| dso | kernel | | 0 | none | 48 | `dso.h` 81 | none | 206 + `ffi.c` 26 | 25 + `processWorker` 386 + ffi 693 + interface 60 | no | switched (served to programs started after) |
| sockets | (absent) | | 0 | none | 45 | `sockets.h` 10 | 330 | 251 | 2 | no | "only the loader's check changes" |
| pty | (absent) | | 0 | supervisor 12 | 45 | `pty.h` 9 | 237 | 41 | 3 | no | as sockets |
| build | (absent) | "its panel and service are never taken down" | 0 (`dependencies: http@0`) | none | | none | none | none | 17 + service 113 + ui 69 | no | fixed (not tried) |
| packages | (absent) | | 0 (`dependencies: http@0`) | none | | none | none | none | 15 + service 59 | no | switched |

Fields present on one module each: `provides` (runtime), `switches` (nena), `processWorker` (dso). `fixed` on six, `phase` on twelve. Five WATs export a `DOLLY_NAME_VERSION` global (buttons, nena, audio, microphone, gpu); process operation numbers in the manifests' WATs: gpu 128, audio 129, microphone 130, buttons 131-132, nena 133 (other modules' numbers were not re-checked). `test/host-modules.test.mjs:114-135` asserts that no two contracts claim one operation number.

### 2.2 How a program reaches a module

- Header: `#include <dolly/NAME.h>`, found at `/usr/include/dolly/` of the seed (2.6). Including it stamps nothing (`abi/dolly-host-0.wat:9-11`).
- Archive: `cc` adds `-l` for every `libdolly-*.a` in `/usr/lib/dolly/process` except `libdolly-process.a`, `libdolly-sockets.a` and `libdolly-pty.a` (`src/compiler.cpp:803-823`, link line `:890-899`); the two excluded are asked for with `-ldolly-sockets` and `-ldolly-pty` because they define libc names (`host/README.md:99-117`). `-pthread` selects the threads client (`src/process/threads.c`); `-rdynamic` or a `dolly_ffi_*` call selects dso's (`tasks/20261006-111835-dso-module/TASK.md`, the linker table).
- Stamp: each client file has `DOLLY_HOST_REQUIRE(name, 0, DOLLY_NAME_ABI_DIGEST)` (`host/gpu/client.c:4`; macro `include/dolly/host.h:10-11`), a 72-byte record in the `dolly.host` custom section (`abi/dolly-host-0.wat`), present only when the linker extracted that member (`790d66ec`). The digest is the SHA-256 of the module's WAT and headers, generated into `NAME-abi.h` by `scripts/generate-abi-constants.mjs` and committed (`host/gpu/gpu-abi.h` is tracked).
- `REQUIRES HEADER gpu` and `REQUIRES LIB dolly-gpu` look up the export names of `Dollyfile-system-build:52-53, 66` (used by `gpu-fluid:14-15`, `mojo-runtime:17-18`, `mojo-gpu:17`, `slopyard:52`).

### 2.3 What the engine checks

- Parse: `REQUIRES HOST` is the one `REQUIRES` the engine treats as a declaration, not a check (`src/dollyfile.c:1569-1575`); it must follow the role line (`:1651-1652`, message `:1571`).
- Seal: `check_executable_hosts` walks the sections of every retained file (`:2020-2041`), `check_host_section` fails on a record the recipe does not declare: "`dollyfile: PATH uses NAME@V: add REQUIRES HOST NAME@V`" (`:1999-2017`); the loop is `:2114`.
- Receipt v5 writes the host list (`:1030-1032`); `INSTALL` and a live install compare the package's list with the installer's declared set and, where the image declares `nena@0`, with `/etc/dolly/enabled` (`:1105-1116`, `:2207-2211`): "`needs X: nena enable x`" or "`needs X: add REQUIRES HOST X`". `nena@0` is the one module name the engine knows as a string (`:2207`).

### 2.4 What the page checks

- Boot: `src/runtime-worker.mjs:111-114` takes the declared list from the sealed snapshot's metadata, else the catalog definition, else the custom recipe's parse; `host.require(declared)` refuses before ENTRY: "`Required host module X is unavailable: unknown host module | host provides ABI N | not enabled by the host`" (`host/modules.mjs:60-67`). The page creates the host from the declared list plus the build host on a rebuild route (`src/browser.mjs:110-117`, `:139`; `host/modules.mjs:13-14`).
- Launch: the supervisor parses `dolly.host` records of each executable (`host/requirements.mjs:26-50`) and checks name, version and digest against the enabled providers at every launch (`src/process-supervisor.mjs:341-348, 410-418`; `checkHostAbi`, `requirements.mjs:54-61`: "`is not enabled: nena enable x`" where the session has `nena@0`, else "`is not declared by this image (REQUIRES HOST)`").
- Imports of a disabled or absent module answer `ENOSYS` (`host/modules.mjs:264-269`).

### 2.5 What `nena` switches and never switches

- Switches any manifest without `fixed` (`host/modules.mjs:172-176, 201-205`); the registry hands `list`, `enable`, `disable` to the one manifest with `switches` (`:105`, `test/host-modules.test.mjs:105-107`). Fixed: runtime, http, build, display, input, snapshot (manifests; the reasons measured or not tried are in `tasks/20261012-230015-bridges/TASK.md:128-139`).
- Never: a module outside `host/manifests.mjs`; one an embedding's `DOLLY_HOST_MODULES` leaves out (`docs/browser-boundary.md:112`); itself, back on (`nena disable nena`); the browser's prompts or the HTTP policy.
- For `sockets@0` and `pty@0` a switch changes the loader's check and the `/etc/dolly/enabled` file only; "sockets stay with their processes" (`:165, 169-172`).

### 2.6 Seed, root recipe, image inputs

- Image inputs are five files: `dolly.data`, `dolly-process-0.wasm`, `dolly-dso-0.wasm`, `dolly-kernel-plugin-0.wasm`, `dolly-image-0.wasm` (`scripts/write-build-id.mjs:8-11`).
- In `dolly.data`: 33 headers under `/usr/include/dolly/` (14 modules with `headers`: audio, buttons, display, download, dso, gpu, http, input, microphone, nena, pty, sockets, threads, upload, two each; the runtime's five) and 15 client archives under `/usr/lib/dolly/process/` (the same 14 plus `libdolly-runtime.a`); `build`, `packages` and `snapshot` have neither.
- In `Dollyfile-system-build`: 25 `SOURCE` rows (`:9-35`; 20 headers of ten modules, 5 of the runtime), 26 `EXPORTS HEADER` (`:37-63`), 3 `EXPORTS LIB` (`:65-67`), `EXPORTS FOLDER process-sdk` (`:71`). Not pinned by a row: microphone, buttons, nena, pty.
- Consequence, measured by the tasks: a header, client or digest change moves `dolly.data` and "every image is stale until the round" (`tasks/20261012-130814-tmux/TASK.md`, `706afa45`: "image inputs go from `a7ee26c5…` to `09ec882b…`"; `tasks/20261012-230015-bridges/TASK.md:175-180`; `tasks/20261010-114415-microphone/TASK.md`: "every image rebuilds at the next release"). Kernel-only commits keep the hash (`tasks/20261012-130814-tmux/TASK.md`: "`npm run build:runtime` prints image inputs `a7ee26c5…` before and after each"); page-only fixes too (`bridges` audit: "no image input changed"). Documents are inputs of four images: `docs/browser-boundary.md`, `docs/process-model.md`, `host/README.md` and the WATs are pinned by `Dollyfile-dolly-docs`, which repins `pi-agent`, `pi-local`, `dollyfile-studio` (`706afa45`, `19660a44`, `990b2e28`'s note).
- The `cc` package exports `/usr/include` and `/usr/lib/dolly/process` whole (`Dollyfile-cc:9-12`), so `amy install cc` in a running image brings every module's header and archive. The Rust seed's link line names six client archives by hand (`demos/rust/toolchain/link.sh:49`: runtime, http, display, download, upload, dso).

### 2.7 What a new module cost, measured on the newest ones

| Module | Commit | Files | In `host/NAME/` | Outside | What was outside | Images rebuilt |
| --- | --- | --- | --- | --- | --- | --- |
| sockets | `21c855b7` (10-08) | 86 | 8 | 78 | `host/manifests.mjs`, `src/process-kernel.{c,h}`, 73 recipes repinned (seed change), 2 tests | all |
| pty | `d9f8104e` (10-12, prototype) | 12 | 7 | 5 | `manifests.mjs`, `host/sockets/kernel.c`, `src/process-kernel.{c,h}`, test fixture | none (kernel only) |
| pty | `706afa45` (10-13, contract) | 21 | 8 | 13 | `Dollyfile-dolly-docs` + 3 repins, `docs/browser-boundary.md`, `docs/process-model.md`, `host/README.md`, `scripts/build.sh`, `src/compiler.cpp`, `src/process/libc-adapter.c`, `src/process/runtime-adapter.c`, 2 tests (+ `ec45edee`: `src/process-supervisor.mjs`) | all |
| microphone | `ef06bf34` (10-10) | 32 | 10 | 22 | `AGENTS.md`, `Dollyfile-audio-sdk`, `Dollyfile-dolly-docs` + 3 repins, `README.md`, `abi/dolly-browser-0.wat`, 2 docs, `host/audio/audio.mjs`, `host/lease-bridge.mjs`, `manifests.mjs`, `src/device-lease.h`, 7 tests and fixtures | all |
| buttons | `7a6daada` (10-10) | 23 | 8 | 15 | `AGENTS.md`, `Dollyfile-dolly-docs` + 3 repins, `abi/dolly-browser-0.wat`, 2 docs, `host/input/kernel.c`, `manifests.mjs`, `src/dolly.c`, `src/process-kernel.h`, 3 tests | all |
| nena | `a182787a` (10-13) | 57 | 11 | 46 | `AGENTS.md`, `Dollyfile`, `Dollyfile-nena`, `Dollyfile-dolly-docs` + 4 repins, `README.md`, `abi/dolly-browser-0.wat`, 3 docs, `host/README.md`, 13 other manifests (`gives`, `fixed`), `modules.mjs`, `requirements.mjs`, `runtime.mjs`, `threads.mjs`, `dso.mjs`, `packages.mjs`, `scripts/prepare-image-sources.sh`, `src/browser.mjs`, `src/commands/nena.c`, `src/dollyfile.c`, `src/process-supervisor.mjs`, 7 tests | all |

The design's two review points (`abi/dolly-browser-0.wat`, the boundary row) were touched by every module with an import; `host/manifests.mjs` by all; the documents package and its three dependents by all five contract commits.

## 3. Counted

**`REQUIRES HOST` over 130 recipes.** runtime 130, http 68, display 54, input 53, download 51, upload 48, threads 32, snapshot 25, dso 21, sockets 18, gpu 10, packages 8, microphone 5, audio 4, buttons 3, pty 2, nena 2, build 1.

gpu@0: `gpu-fluid`, `slopyard`, `mojo-runtime`, `mojo-gpu`, `local-llm-build`, `llama`, `pi-local`, `dollyfile-studio`, `zero-ad-engine`, `zero-ad`. pty@0: `tmux`, `tmux-panes`. audio@0: `zero-ad`, `zero-ad-deps`, `zero-ad-spidermonkey`, `zero-ad-engine`. microphone@0: `speech-build`, `voice`, `speech-to-text`, `speech-to-text-mic`, `pi-phone`. buttons@0: `speech-build`, `voice`, `pi-phone`. nena@0: `default`, `nena`. build@0: `dollyfile-studio`.

**Files outside `host/NAME/` that include a module's header** (sources, recipes, tests, docs of tasks excluded): gpu 14 (`Dollyfile-system-build`, `test/fixtures/host-compute.c`, `gpu-render.c`, `demos/slopyard/src/render.c`, `demos/local-llm/webgpu.cpp`, `demos/zero-ad/engine.patch:1740`, `demos/gpu-fluid/src/platform.h`, `demos/mojo/Dollyfile-mojo-runtime:286`, four tests); audio 6 (`engine.patch:1283`, `Dollyfile-openal`, two fixtures, a test); display 13 (the plugin `src/ghostty/display.c`, SDL2, Wine's driver, slopyard, fluid, three fixtures); input 11; http 12 (`src/dollyfile.c`, `src/commands/amy.c`, `src/libcurl-fetch.c`, `src/process/http-check.c`, Python, Janis, ENet, two tests); download 3; upload 2; threads 4 (`src/process/threads.c`, `src/compiler.cpp` text, a test); dso 9; sockets 1 (`test/fixtures/sockets.c`); pty 2 (`src/process/libc-adapter.c`, a fixture); nena 2; buttons 3; microphone 3.

**Explicit `-ldolly-NAME` in recipes and sources.** gpu: `gpu-fluid` (`REQUIRES LIB`), `slopyard:59`, `local-llm-build:27`, `mojo:25` (`modular.cfg`), `mojo-gpu:17`, `mojo-runtime:18`, four tests; sockets: `python:…` (`LIBS=-ldolly-sockets`), `tmux:70`, `demos/wine/Makefile`, Tokio probe, three tests; pty: `tmux:70`, two tests. No other module is named on a link line; the rest arrive by the default scan.

**Modules with no client header at all:** build, packages, snapshot (manifests `headers: []`, `client: []`). Modules with a header the root recipe does not pin: microphone, buttons, nena, pty.

**Code outside `host/` that names a particular module.**

| Place | Names | What it does with the name |
| --- | --- | --- |
| `scripts/lint-dollyfiles.mjs:64-65` | the `runtimes` list, by `provides` field | refuses a recipe without a runtime line |
| `scripts/lint-dollyfiles.mjs:67-68` | `display@0` | an APPLICATION must declare it |
| `scripts/generate-routes.mjs:39`, `scripts/image-menu.mjs:30`, `test/dolly.artifacts.mjs:341` | `display@0` | openable = `ENTRY` and `display@0` |
| `host/modules.mjs:13-14` | `http@0`, `threads@0`, `dso@0` | the build host's set |
| `host/requirements.mjs:57`, `src/dollyfile.c:1111, 2207` | `nena@0` | the refusal names the command; the engine reads `/etc/dolly/enabled` only where declared |
| `src/process-supervisor.mjs:196, 418, 427` | `threads@0` | messages; a threaded program may not record a process-Worker module |
| `src/commands/amy.c:232` | `packages@0` | message |
| `src/compiler.cpp:811-823`, `scripts/build.sh:195-197` | `sockets`, `pty` | excluded from the default link |
| `src/process/libc-adapter.c:4, 1322` | `pty` | `ioctl(TIOCSWINSZ)` on a master |
| `test/host-modules.test.mjs:18-32` | the complete sets of `default`, `system`, `system-build`, `zig-build`, `ghostty-build`, `system-tools`, `zlib`, `gzip`, `curl`, `display`, `nena` | pins each core image's list; every image with `ENTRY` must declare `display@0` and `input@0` |
| `test/browser.mjs:63-69` | any, by argument | composes `system` with named modules |
| `src/browser.mjs`, `src/page-indicators.mjs`, `src/runtime-worker.mjs`, `src/dolly.c`, `src/process-kernel.c` | none | (the host-modules task's done-when grep) |

## 4. Each claim of the reflection, checked

**"`Dollyfile-system-build:9-35, 65-67` pins 24 headers of 10 modules and `scripts/build.sh:234` packs every `libdolly-NAME.a` into the seed."** Partly. Lines 9-35 hold 25 `SOURCE` rows in both trees: 20 headers of ten modules (http, display, input, download, gpu, audio, upload, threads, dso, sockets) and 5 of the runtime (`toolchain.h`, `runtime.h`, `process.h`, `host.h`, `host-abi.h`). Lines 65-67 are `compiler-rt`, `dolly-gpu`, `dolly-audio`. `scripts/build.sh:234-235` (the same line at `d89bca74`) lists every client archive for `prepare-process-sysroot.sh`, which the seed packs (`CMakeLists.txt:93`). The claim omits that the seed also holds the four unpinned modules' headers (`CMakeLists.txt:87`), that the seed held module headers before the manifests (`018c5f27`), and that the compiler links all of them by default except two (`compiler.cpp:811-823`).

**"A module is then not 'just a module': its header is the toolchain's."** True of the bytes, false of the admission model; both are in the code. For: every header and client is in `dolly.data`, an image input, so a change to `gpu.h` invalidates 130 images; `cc` links fourteen clients unasked; the `cc` package carries them all (`Dollyfile-cc:9-12`); seven module headers are included by core sources that the seed or its first bases compile (`dollyfile.c`, `libc-adapter.c`, `threads.c`, `dso-check.c`, `amy.c`, `display.c`), so for http, pty, threads, dso, display and input the toolchain's own parts depend on the header. Against: including a header stamps nothing (`abi/dolly-host-0.wat:10-11`; the 09-26 design `:51-52`); a GPU program compiles in `system-build`, which declares no `gpu@0` (`:3-4`), by design ("Compiling a GPU program must work on a headless builder without a GPU"); the digest the client stamps is the module's, not the toolchain's; `runtime@0` carries no stamp at all so that "runtimes that implement the same contract run the same executables" (`host/README.md:150-157`). The owner's "GPU is just a module" was said of a page label, not of the seed.

**"The page and the lint name modules (`src/browser.mjs:223`, `src/page-indicators.mjs:33-41`, the lint's display rule)."** True at `d89bca74`: `browser.mjs:223` was `if (!host.enabled.includes("gpu@0")) indicateNoGpu();` and `page-indicators.mjs:31-42` held `gpuIndicator`. False here: `990b2e28` (2026-10-13) removed both; `src/browser.mjs` names no module, `src/page-indicators.mjs` is 27 lines of show/hold/toggle, and the indicator element is made in `host/gpu/gpu.mjs:38-59` by the module it belongs to. The lint's rule is true (`:67-68`), as is the lint's runtime rule (`:64-65`, by field). The names outside `host/` are listed in section 3; the biggest are the openability test (`display@0`, three places) and the build host (`http@0`, `threads@0`, `dso@0`).

**"Eighteen manifests are five kinds of thing under one name (seven devices with an import, four with a mailbox, two kernel features with no page side, a supervisor budget, a loader in the process's Worker, two page services, a runtime)."** The groups are seven, not five, and each is true by the manifests: imports on gpu, audio, microphone, buttons, nena, http, download; `imports: []` plus a mailbox on display, input, upload, snapshot; sockets and pty with 2 and 3 lines of JS; threads with a supervisor contract; dso with `processWorker`; build and packages with no WAT, C or header; runtime with `provides: kernel`. "Mailbox" is not what distinguishes the four: ten module contracts export a mailbox address (http, input, gpu, microphone, display, audio, snapshot, nena, buttons, upload). The project's own review map draws the same picture (`docs/browser-boundary.md:13-47`: imports, mailboxes, threads, dso, two services through http), and `host/README.md` has a section each for the Worker-served module, local sockets, pseudo-terminals and runtimes (`:95-157`). Four manifest fields on one module each: `provides`, `switches`, `processWorker`; and `boot(route)` is a module export, not a field (`host/README.md:76-78`). What is one across all eighteen: the manifest, `name@version`, the `REQUIRES HOST` line, the registry's `check/browser/worker/dispose/disabled` lifecycle, `ENOSYS` for a disabled import, `nena`'s one list, and (where a client exists) the stamp and its digest.

**"`sockets@0` and `pty@0` say `HOST` where no host is involved."** True of what crosses the boundary: `imports: []`, absent from `abi/dolly-browser-0.wat`, boundary rows "Channel: none" and "supervisor", "Nothing outside Wasm" (`docs/browser-boundary.md:75-76`), `sockets.mjs` "Local sockets are kernel state only: no page or Worker side, no import." Qualified for `pty@0`: its supervisor contract (`dolly-pty-supervisor-0.wat`, two exports) is polled by the trusted supervisor to deliver SIGINT, SIGWINCH and SIGHUP (`ec45edee`; `src/process-supervisor.mjs`), after "marked pending in the kernel alone … Ctrl+C left `for (;;) {}` running in its pane (measured)" (`tasks/20261012-130814-tmux/TASK.md`). By the same measure `threads@0` (a Worker budget, no import), `dso@0` (code in the process Worker, no import) and `runtime@0` (the kernel) are not "a host provider" in the DOLLY 4 sense either; `build@0` and `packages@0` are providers with no C side. The word was the owner's choice for sockets against a recorded recommendation (1.7), and `pty@0` followed "as for `sockets@0`". What the docs say the word means now: "describes running the image: a module name" (`docs/dollyfile.md:208`), "compatibility demands, not grants" (`browser-boundary.md:81-83`).

## 5. What a change would mean, on real cases

Observations only, read not run.

### (a) A module's header and archive as a package the programs install

**`gpu@0` today.** `gpu.h`, `gpu-abi.h` in the seed (`CMakeLists.txt:87`) and pinned (`Dollyfile-system-build:23-24`), exported as `gpu`, `gpu-abi`, `dolly-gpu` (`:52-53, 66`); `libdolly-gpu.a` in `/usr/lib/dolly/process` and linked by default. Users and how each reaches it: `gpu-fluid` (`FROM system`; `REQUIRES HEADER gpu`, `REQUIRES LIB dolly-gpu`; includes `<dolly/gpu.h>` in `src/platform.h`); `slopyard` (`FROM gamedev-sdk`; `REQUIRES HEADER gpu`; `-ldolly-gpu` on its `cc` line, `:59`); `local-llm-build` (`FROM llama-build FROM cmake-build`; `webgpu.cpp`; `-ldolly-gpu`, `:27`) copied into `llama`, `pi-local` and so `dollyfile-studio`; `mojo-runtime` (`FROM system`; `REQUIRES HEADER gpu`, `REQUIRES LIB dolly-gpu`; `gpu.c` at `:279-286` builds `libmojo-gpu.a` over `dolly_gpu_*`), copied into the `mojo` package whose `modular.cfg` says `shared_libs = -lmojo-gpu,-ldolly-gpu` (`Dollyfile-mojo:25`) and whose comment says "A program with a kernel needs gpu@0, which this package does not declare: it runs in an image that does" (`:18-19`); `mojo-gpu` (`FROM system`, `REQUIRES LIB dolly-gpu`); `zero-ad-engine` (`engine.patch:1740` includes `gpu.h`, `:1283` `audio.h`) into `zero-ad`; four tests compile `cc … -ldolly-gpu` in `system` composed with `gpu@0` (`test/browser.mjs:63-69`; `host-modules-browser.mjs:67`, `host-compute`, `gpu-render`, `gpu-indicator`).

**Written out as a package.** The recipe would be `modules/gpu.dm` of 2026-09-24 in DOLLY 7 words: `PACKAGE dolly-gpu`, `REQUIRES HOST runtime@0`, `FROM system-build`, three `SOURCE` rows (`host/gpu/gpu.h`, `gpu-abi.h`, `client.c`), `RUN` or `SLOP` for `cc -c` and `ar`, `EXPORTS HEADER gpu`, `gpu-abi`, `EXPORTS LIB dolly-gpu`. The package would declare no `gpu@0` (a library "starts nothing", the 2026-10-07 ruling for `sdl2` and `zlib`, `tasks/20261007-003116-package-needs/TASK.md`), as `mojo` does not. Consumers: `gpu-fluid`, `mojo-runtime`, `slopyard`, `local-llm-build`, `zero-ad-engine` each gain `INSTALL …/Dollyfile-dolly-gpu`; `mojo` gains it as a by-reference row, so `amy install mojo` brings it (`2283e960`: "a package names what it installs; whoever installs it installs those rows first"); the four tests pass it in `composed(hosts, packages)`; `Dollyfile-system-build` loses rows 23-24, 52-53, 66; `docs/gpu.md:17-19` changes.

**What the seed would no longer hold:** `gpu.h`, `gpu-abi.h`, `libdolly-gpu.a`. **Which images rebuild on a `gpu.h` change:** today 130 (the seed); then the package and its installers and their dependents, read from the recipes: `dolly-gpu`, `gpu-fluid`, `mojo-runtime`, `mojo`, `mojo-gpu`, `slopyard`, `local-llm-build`, `llama`, `pi-local`, `dollyfile-studio`, `zero-ad-engine`, `zero-ad` (12), plus the four tests' compositions at run time. The kernel still compiles `host/gpu/kernel.c` against `gpu-abi.h` from `build/include` (`CMakeLists.txt:23-24`), which is not an image input.

**What would differ or break, by file:**

- `cc` links what it finds in `/usr/lib/dolly/process` (`compiler.cpp:811-823`) and passes `-L` for that directory and the sysroot only (`:895-896`). A package that installs the archive there is linked by default as today; one that installs `/usr/lib/libdolly-gpu.a`, as `gpu.dm` did, needs `-ldolly-gpu` and a `-L` the line does not show (not checked: whether `/usr/lib` is searched).
- `scripts/prepare-process-sysroot.sh:54-58, 124-132` hashes the archives it is given into the sysroot's key; one fewer archive is a different key, not a breakage.
- The Rust seed's link (`link.sh:49`) does not name gpu; unchanged. `demos/rust/toolchain/dlopen.c` includes `dso.h`; so dso is not in the same position.
- `REQUIRES HEADER gpu` and `REQUIRES LIB dolly-gpu` keep working if the package exports the same names (`:1591-1594`).
- The engine does not compile `gpu.h` (`dollyfile.c` includes `http.h` and `host-abi.h` only), so the bootstrap is unaffected for gpu. For `http` the same move is not available in this form: the engine compiled from the seed needs `http.h` (`bootstrap.c:38`, `dollyfile.c:17`).
- `amy install cc` then brings no `gpu.h`; a session wanting it does `amy install dolly-gpu` and, to run, `nena enable gpu` (`default` declares `nena@0`).
- The property "compile a GPU program on a headless builder" stays: the package is `FROM system-build`, which declares no `gpu@0`.
- `host/gpu/module.json`'s `headers` and `client` fields would then describe files the build still needs for the digest (`generate-abi-constants.mjs` writes `gpu-abi.h` and `abi.mjs` from the WAT and headers) but no longer packs; what reads `headers` today: `build.sh:93-95` (seed), `scripts/host-modules.mjs:14-16, 23-33` (publishing and a staged include dir for tests), `scripts/prepare-image-sources.sh` (publishing at checkout paths, which the `SOURCE` rows need either way).

**`pty@0` with tmux.** `pty.h` is 9 lines, `client.c` 41 lines, and `cc` never links it unasked; `tmux` already says `-ldolly-pty` (`Dollyfile-tmux:70`) and `REQUIRES HOST pty@0`. A `dolly-pty` package would be `INSTALL`ed by `tmux` (`FROM tools-build`) and by the two tests. The difference from gpu: the libc adapter includes `<dolly/pty.h>` (`libc-adapter.c:4`) to forward `ioctl(TIOCSWINSZ)` on a master (`:1322`), and `libdolly-process.a` is built by `build.sh` into the seed; so `pty.h` must still be in `build/include` for the seed's libc, and a change to its packet layout changes the libc (seed) whether or not the client is a package. The same holds for `threads.h` (`threads.c:5`), `dso.h` (`dso-check.c`), `http.h` (the engine, `amy`, libcurl) and `display.h`/`input.h` (the plugin, pinned by `ghostty-build:11-12`). Of the fourteen headed modules, five have a header no core or base source includes: gpu, audio, microphone, buttons, sockets.

### (b) A new module added tomorrow

Today, from the measured cases (2.7): its directory; `host/manifests.mjs`; `abi/dolly-browser-0.wat` and a boundary row if it imports; `AGENTS.md` if it adds authority; `docs/process-model.md` or `host/README.md` where its contract is explained; `Dollyfile-dolly-docs` and its three dependents repinned for those documents; tests; and, because its header and client enter `dolly.data`, every image rebuilt (five of five contract commits). With the SDK as a package: the seed changes only if a core source includes the header; the documents still repin four images; the package and its installers rebuild; `manifests.mjs`, the WAT allowlist and the boundary row are untouched by the move. Not measured: whether the generated `NAME-abi.h` and `abi.mjs` would be produced the same way (they are committed today, so a package `SOURCE` row can pin them as `Dollyfile-system-build:24` does).

### (c) `sockets@0` and `pty@0` under another word than `HOST`

**What reads the word.** The engine parses `REQUIRES HOST` (`src/dollyfile.c:1569-1575`, position `:1651-1652`), writes the list into the receipt without the word (`:1030-1032`), reads it back for `INSTALL` (`:1105-1116`) and checks stamps at sealing (`:1999-2017`); the page's parser (`src/dollyfile-view.mjs:228-230, 303-306`), the graph (`src/dollyfile-graph.mjs:63-65`), the custom recipe template (`src/custom-dollyfile.mjs:14`), the catalog (`scripts/image-definitions.mjs:136, 153`), the lint (`:64-68`), `amy` (`:232`), `nena` (the registry's list, not the recipe's word), the Studio skill (`demos/studio/skills/dollyfiles/SKILL.md:33-38`), `test/browser.mjs:69`, the documents (`docs/dollyfile.md:86, 208-245`; `docs/process-model.md:154, 202, 337, 341-`; `docs/browser-boundary.md:81-87`), the start page's recipe view, `README.md:20, 29`.

**What the stamp carries.** A `dolly.host` record is a name, a version and a digest (`abi/dolly-host-0.wat`); it has no kind field. The loader (`host/requirements.mjs`) and the sealer compare names; neither knows what kind of thing the name is. The manifest is the only place a kind could be read from (`imports`, `fixed`, `phase`, `provides`, `processWorker`).

**What is different about the two in practice.** Not linked by default (`compiler.cpp:816-817`, `build.sh:197`); no `check()`, no `phase`, no `fixed`; not in `abi/dolly-browser-0.wat`; a `nena` switch changes the loader's answer and the `/etc/dolly/enabled` file only; `pty@0` has two supervisor exports. At sealing and at launch nothing differs from `gpu@0`: the same scan, the same record, the same refusal text. `threads@0` and `dso@0` share "no import" with them; `runtime@0` shares "nothing outside the kernel's own imports".

**What a second word would have to mean in code.** Two parsers would accept it (`dollyfile.c:1569`, `dollyfile-view.mjs:228`); the receipt would need a second list or a tag (`:1030-1032`); `INSTALL`'s check and the sealing scan would need to know which list a stamped name belongs to (from the manifest, since the stamp has no kind); `nena`'s record (`dolly-nena-0.wat`, 256 bytes a module) would say which; the lint, the Studio skill and three documents would say which; and the boundary table already says which (Channel "none"). Where the present arrangement is the only place a fact is held: the recipe line is the one statement that a program linked with `-ldolly-sockets` or `-ldolly-pty` belongs to this image (the owner's rule of 2026-10-08), and `host/manifests.mjs` plus `docs/browser-boundary.md:60-79` are the only places that say what each of the eighteen is.

## 6. What could not be found out

- Why `Dollyfile-system-build` pins by `SOURCE` the headers the seed already holds, and has since `018c5f27`. No commit message or task says; `:6-8`'s comment says the headers "are the externally supplied bootstrap seed" and leaves the mapping "deliberately open". The `EXPORTS HEADER`/`EXPORTS LIB` rows serve six recipes' `REQUIRES HEADER`/`REQUIRES LIB` rows (section 3), which would be one reason for the exports; it does not explain the `SOURCE` rows.
- Why microphone, buttons, nena and pty have no rows while the ten older modules do: their commits did not add any, and no recipe uses `REQUIRES HEADER` for them; whether that is a rule or an omission is not recorded.
- The owner's reason for making `gpu-sdk` and `audio-sdk` on 2026-09-24: `a433b000` has no body and no task of that day explains the images.
- Whether the owner's 09-26 pairing ("one public host JS module paired with one public C header") is meant to hold for modules without a header (build, packages, snapshot) or without JavaScript (sockets, pty): no owner statement after 2026-10-01 on the pairing.
- Whether `cc` would link a package-installed archive by default: it scans `/usr/lib/dolly/process` only (`compiler.cpp:811-823`); whether `/usr/lib` is on its search path was not run.
- Which images would actually rebuild under the package shape: computed from recipes (12 for gpu); the by-reference cascade through `mojo` and `amy` was not run, and `demos/zero-ad` was not built here.
- Build times for either arrangement: none measured here; the tasks' figures (a seed round "about 3.5 h of builds", `tasks/20261002-072000-input-host-module/TASK.md`; the 2026-10-13 chain 1095-1136 s for 24-28 images) are the only numbers.
- The reflection's operation numbers (download 51, upload 57 "inside the core's 48-59 block") and its "twelve imports, 43 lines": not re-checked; `abi/dolly-browser-0.wat` here has 12 function imports and the memory.
- What the owner thinks of the headers' two homes, of the lint's `display@0` rule, or of a second word for kernel-only modules: no statement found; the one adjacent owner word is "GPU is just a module" (2026-10-13), said of a page label.