# Docs: eight statements the code no longer matches, the bootstrap exceptions table among them

- STATUS: CLOSED
- PRIORITY: 90
- TAGS: audit,repo,docs,0.1.8

## State (2026-11-17)

The eight places say what the code does, on `cleanup/0.1.8`: the supervisor carries out the
kernel's events and the deadline is the kernel's; `html` is off the graph's `system` edge;
`audio.md` has the page's question for a session-enabled microphone; the README row is 0.1.7's
round (1049 s, 161 runs, 2026-11-15); the demos index has PhotoCraft and Godot's line as its
README has it; the bootstrap exceptions table has host Bison 3.8.2 for awk and the host Zig's
committed Ghostty files; `embedding.md`'s table has `clipboard` and `console`. Checked against the
code cited below; `platform-documents.test.mjs` passes after re-pinning `dolly-docs`, and
`lint:dollyfiles`.

The Ghostty item is done on `ws/ports`: `wuffs-c.zig` is written again by the README's command,
run in libghostty-vt's checkout by Zig 0.17.0's release archive unpacked at `/tmp/zig-0.17.0`;
the six comments now name `/tmp/zig-0.17.0/lib/include/stdint.h`, and nothing else in the file
changed (`diff`; the build stops where the README says, `ghostty-generate.log` in
`work/audit-1116-evidence/ports/fix-ports/`). The generated README names that path. It rebuilds
`ghostty-build` and every image after it. Closed: `ghostty-build` builds from it in that tree
(`22087f32c`, `build-6.log`: 131 s, snapshot 210,504,739 bytes against the release's
210,502,180), and the eight places were done on `cleanup/0.1.8`.

## Found

1. `docs/architecture.md:37`: the Supervisor "dispatches syscalls, enforces deadlines". Since
   `tasks/20261112-074502-supervisor-events` (in v0.1.6), the kernel arms a timed spawn's deadline
   and ends it. The supervisor asks for events (`abi/dolly-supervisor-0.wat:43-51`) and holds no
   deadline timer. Its one remaining deadline is the reclamation of a Worker
   (`page/process-supervisor.mjs:835`). `docs/process-model.md:446` already says it right ("the
   kernel decides").
2. `docs/architecture.md:130`, the image graph: `system-build`'s "packages: transfer, html,
   session-recover, core, cc, make" for `system`. `html` left `system` on 2026-11-11 (`65a4ad70f`).
   `Dollyfile-system` installs transfer, session-recover, core, cc, make, posix, ninja and five
   `libdolly-*` packages.
3. `docs/audio.md:44-47`: "The browser decides … Nothing is asked before a program opens the
   microphone". Since `9aaed3b15` (2026-11-12), a session that enabled `microphone@0` itself through
   `nena@0` first gets the page's own question ("A program in this session asks to use the
   microphone", Allow or Refuse, once a session: `host/microphone/microphone.mjs:28-50`).
   `docs/browser-boundary.md:114-116` says so, and the module's own document does not.
4. `README.md:170`, the iteration table: "442 s for the core tests in both browsers, four files at
   a time (2026-10-31)". 0.1.7's round measured 1049 s for the same command in both browsers, 161
   test runs (`work/round1113/build/round-1117-evidence/browser.log`). The round of 2026-11-14 measured
   1250 s. The row is dated, but at 2.4 times its number it misleads anyone choosing what to run
   before merging. Why the suite grew is the buildtime audit's.
5. `demos/README.md`, the demos index, has no line for `photocraft`. Its README has existed since
   2026-11-11 (`5b1eaf4e6`), and the index last changed on 2026-11-13.
6. `demos/README.md:17`, Godot's line: "its Compatibility renderer on Mesa … and Dodge the Creeps".
   Its README says Godot draws on `gpu@0` through Dolly's WebGPU driver, the Project Manager too,
   and that the Compatibility renderer "here is a software rasterizer". Airtime, Voxel Flyover and
   Truck Town are the demos the showcase plays.
7. `docs/sources.md:17-21`, "Bootstrap exceptions", lists Emscripten alone. AGENTS.md: "Keep
   bootstrap exceptions explicit in `docs/sources.md` or the owning demo's README". The core has
   two more inputs that a host program makes:
   - Awk's parser. `scripts/generate-awk.sh` runs a Bison that `scripts/build-bison.sh` builds
     natively on the host (`.cache/bison-VERSION-host`). Its output goes into `system-tools`' awk.
     The same document mentions it only in a cell of the ports table (`:107`, "Bison output
     prepared outside").
   - Ghostty's three generated Zig files, 5,669 lines committed in `programs/ghostty/generated/`:
     the two options modules and `wuffs-c.zig`, "translate-c's output … translate-c is not built
     inside Dolly", written by a host Zig 0.17.0 (that directory's README). `ghostty-build`, a core
     image, compiles them. `wuffs-c.zig` also holds six comments that name this machine's host Zig
     (`// /home/daug/dev/dolly/work/sdl2/build/zig017-evidence/hostzig/lib/include/stdint.h:291:9`,
     `:5088` and five more). Run from another directory, its README's command would write other
     paths there. The build reads the file at `/usr/src/ghostty/generated/wuffs-c.zig`
     (`Dollyfile-ghostty-build:126`).
   The demos that use the host Bison say so in their READMEs (`demos/wine/README.md:486`,
   `demos/ghostty-gtk/README.md:69`).
8. `docs/embedding.md:13`, the npm packages' table, lists eleven device modules:
   "`display` …, `input`, `gpu`, `audio`, `microphone`, `touch`, `download` …, `upload`, `html`,
   `sockets`, `pty`". 0.1.7 published thirteen `dolly-host-*` packages
   (`work/round1113/build/npm-v0.1.7/`): `clipboard` and `console` too. `docs/npm.md:228` lists all
   thirteen. The same document describes `console@0` further down (`:130`) and never names
   `clipboard@0` ("a clipboard a program copies to and reads the user's paste from").

## Do

Correct the eight: the kernel ends a timed spawn; drop `html` from the graph's `system` edge; one
line in `audio.md` on the page's question for a session-enabled microphone; the README row with a
current measurement and its date; a PhotoCraft line in the demos index; Godot's line as its README
has it; two rows in the bootstrap exceptions table, host Bison for awk and the host Zig's
generated Ghostty files; `clipboard` and `console` in `embedding.md`'s table. The generated file's
six host-path comments go when it is next written, from a checkout path that names no machine (a
rebuild of `ghostty-build` follows).

## Done when

The eight places say what the code does.
