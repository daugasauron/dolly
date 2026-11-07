# Docs: the sixteen statements and six comments the core audit found contradicting the code

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: docs

From the core audit of 2026-11-07 at 9684c7334 (`work/audit-core-2026-11-07/REPORT.md` 3.5, with
its tools under `docs/` there; evidence under `work/` exists only on that machine). Owner
(2026-11-07): "Create tasks for the bug and the docs." Links were clean (0 of 456 broken); these
are statements that say something the code does not. Fix each to match the code, or the code if
the document states the intended behaviour, and say which in the commit.

## Statements that contradict the code, most misleading first

1. `docs/architecture.md:108-126`: the image graph omits what `Dollyfile-system:15-24` installs
   (`html`, `session-recover`, `core`, `cc`, `make`, `posix`, `ninja`) and `Dollyfile:25-26` (`html`, `ps`).
2. `docs/dollyfile.md:341-342,364-367`: `amy-index.txt` is said to be served `no-store`;
   `scripts/export-cloudflare-pages.mjs:72-76` serves `/:version/*` immutable and
   `src/commands/amy.c:28` reads `/vX.Y.Z/amy-index.txt`; only `scripts/serve.mjs:33` sends `no-store`.
3. `abi/README.md:50-51`: the module digest is said to cover the bytes of the WAT contracts and
   headers; `scripts/generate-abi-constants.mjs:58-61` hashes the process WATs, the headers other
   than `NAME-abi.h` and the `#define` lines derived from the contracts (`host/README.md:85-87` is right).
4. `docs/licences.md:25-27,208-209`, `README.md:216-217`: "12 GPL files"; four more files carry LGPL
   SPDX lines (`demos/wine/`), as `config/upstreams.json` says; the audit date (`:3`) predates the Wine port.
5. `docs/licences.md:128-139`: describes GitHub Pages and Cloudflare; there is one Cloudflare project
   (`docs/deployment.md:3-8`, `scripts/release-checklist.sh:80`).
6. `docs/process-model.md:273`: "byte 3 is SIGINT" on a pty master; `host/pty/kernel.c:164-169` uses
   the slave's `VINTR`.
7. `docs/slop.md:172`: `nproc` gives 4, "the number of jobs Dolly's recipes give Make";
   `Dollyfile-system-build:381` uses `-j2`, `Dollyfile-less:58` and `Dollyfile-mandoc:100` `-j4`.
8. `docs/slop.md:86-88`: 12 special builtins; `src/slop.c:2881-2885` has 14 (`source`, `trap`).
9. `docs/sources.md:33-35`: Rust is the only external seed; Go is one too (`docs/licences.md:21`).
10. `docs/process-model.md:97-98`, `docs/browser-boundary.md:242`: only the compiler has
    `dolly.process.stack`; `demos/emacs/Dollyfile-emacs:29` adds one.
11. `host/README.md:26`: `phase` is `kernel` or `image`; 7 of 20 manifests omit it, and
    `host/modules.mjs:370` then never starts a Worker side.
12. `docs/dollyfile.md:319-323`: `Dollyfile-zig:8-9` also INSTALLs.
13. `docs/browser-stack.md:135-137` against `host/stack/stack-wrap.c:318,326-327`.
14. `docs/display.md:90-101`: seven operations; `host/display/dolly-display-0.wat:108-115` has eight.
15. `docs/process-model.md:443`: an unqualified "4 processors".
16. `docs/display.md:63-64`: 3.4 MB where the file is 3,451,744 bytes.

Also from the HTTP trace: `host/http/http.h:115` says one staged body per process, the kernel keeps
one per thread (`host/http/kernel.c:143-160`, as `docs/http.md:61` says); `docs/http.md:8-16`'s
diagram omits `HTTP_CANCEL` and the Worker-to-page hop; `docs/browser-boundary.md:181` says URLs must
be absolute while `:197` and `host/http/broker.mjs:149-154` accept site paths; and
`docs/architecture.md:79,84,89-90` say deferred calls retry when the kernel wakes them and the
mailbox is registered when the Worker starts, where `src/process-supervisor.mjs:200,320-331` also
polls every 16 ms and registers the mailbox before configuring the Worker (`:652`).

## Comments that no longer match the code

- `src/process/libc-adapter.c:1016-1021`: a "serialized fallback" that is compiled into the
  `-pthread` library, and a CPython facade that does not exist; also `:1844-1849`, `:86-87`.
- `src/process/pthread-stubs.c:2-5`: "the process target is serialized"; `threads@0` exists.
- `src/compiler.cpp:618-621`: "`__assert_fail` in JavaScript"; it is C (`src/dolly.c:216`).
- `abi/dolly-process-0.wat:27-28`: "Emscripten crt1"; it is `src/process/crt1.c`.
- `src/commands/help.c:27`: "`amy install ps`", while `Dollyfile:26` installs `ps`.

Cosmetic: `docs/architecture.md:41` and `docs/display.md:58` name `ghostty/display.c` without
`src/`; `docs/browser-stack.md:121` names `stage2-browser.mjs` without its `demos/llvm/test/` path.

## Gaps the audit noted (decide whether each earns a line)

The `boot()` handle's members are documented only in `docs/browser-boundary.md:268-291`;
`module.json`'s optional keys and the code that reads each; no sentence says the operation table is
`process.h` and its WAT; `README.md:90`'s install line lacks the host-module packages
`docs/embedding.md:17-19` requires; `docs/embedding.md:13` omits `libffi`.

## Done when

Each item above is fixed in the document, the comment or the code, `npm run test:source` passes,
and the commit says which side changed for each.

## Closed (2026-11-07)

Every item fixed on `docs/drift`; the document changed unless said:

- 1 the image graph (`system` installs html, session-recover, core, cc, make, posix, ninja;
  `default` html and the script package `ps`); 2 `amy-index.txt` is immutable where published,
  and the index is the one of `amy`'s own release: the code changed too, `amy.c:339-340`'s
  comment and message still said "the site has a newer release", false since `f9b2cb49b`
  (2026-10-08) made the index per release; 3 the module digest as the generator computes it;
  4 the four LGPL-2.1-or-later Wine files (also `README.md`); 5 one Cloudflare deployment;
  6 the pty's interrupt is the slave's `VINTR`; 7 `-j4` is what most recipes give Make (67 rows;
  `-j2` in 4); 8 the 14 special builtins; 9 the Go seed beside Rust's; 10 Emacs also carries
  `dolly.process.stack`; 11 `phase` absent on a module whose Worker side needs no `start`;
  12 `zig` also INSTALLs `cc`; 13 17 slots, two for a `v128`; 14 `present` sends
  `WRITE_FRAME` chunks (the table lists the header's functions, which were right); 15 the 4
  processors are a `-pthread` program's; 16 3.5 MB.
- From the HTTP trace: `http.h`'s staged body is per thread (the header changed: it is in the
  module's digest); the diagram has `HTTP_CANCEL` and the Worker; a URL is absolute or a site
  path; deferred calls also retry on the 16 ms tick, and the mailbox is registered before the
  Worker is configured.
- Comments: `libc-adapter.c` (three), `pthread-stubs.c`, `compiler.cpp` (same line count, so a
  plugin assertion's `__LINE__` does not move), `abi/dolly-process-0.wat`; `help.c` says `ps` is
  in `default`.
- Cosmetic paths fixed. Gaps: `README.md`'s install line points to the host modules
  `docs/embedding.md` lists; `embedding.md` names `libffi`. The handle's members are in
  `docs/embedding.md` already; the other two gaps add nothing a reader needs.

`npm run test:source` in a checkout without `dist/`: the link check passes; the 7 failures are
the tests that import `dist/` (the core audit's S4), the same on `main`.
