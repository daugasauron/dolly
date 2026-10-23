# OCaml in Dolly, built from upstream inside Dolly

- STATUS: CLOSED
- PRIORITY: 110
- TAGS: toolchain,packages

Owner (2026-10-23): "OCaml would also be cool." Route and costs:
`tasks/20261023-200001-languages/investigation.md`, section 3.

OCaml 5.5 bytecode: `ocamlrun` built by `cc` from `runtime/`, then `ocamlc`, the stdlib, the
toplevel, `ocamllex`, `ocamlyacc`, `unix` and `str` built inside Dolly from upstream's
`boot/ocamlc`, with upstream's own fixpoint (`make bootstrap`) as the recipe's check. configure
runs at preparation in the pinned container, as CPython's does, recorded as the bootstrap
exception. No native compiler exists for Wasm: say so in the README.

Done when: an `ocaml` package installs from `amy`; in a browser session `ocaml` evaluates an
expression, `ocamlc` compiles a program with `unix` that runs as a command, and the fixpoint
holds; a browser test proves it in Chromium and Firefox.

## Closed (2026-10-23, 18:30)

`amy install ocaml` installs the package (with `cc`) in default; the toplevel evaluates a
phrase typed at the terminal; `ocamlc` compiles a program with `unix` and `str` that runs
as a command and spawns another through a pipe, and one with a domain and a thread; and
upstream's `make bootstrap` reaches its fixpoint, in the recipe and in a session.
`demos/ocaml/test/ocaml-browser.mjs` and `fixpoint-browser.mjs` pass in Chromium and
Firefox (logs: `build/ocaml-evidence/` of the agent's tree). Measured in the fixpoint test,
`-j4`: `make world` 70 s and `make bootstrap` 84 s in Chromium, 71 s and 99 s in Firefox;
the image build (headless Chrome) 177 s with packaging, an 89 MB snapshot.

For the core (not changed here; each is a hunk or a stated result in this demo):
- Dolly's libc has `gethostbyname` (failing with `NO_RECOVERY`) but no `gethostbyaddr`.
- `posix_spawn` refuses `posix_spawn_file_actions_addclose` with `ENOTSUP`.
- `getrusage` succeeds with a user time of 1.000002 s whatever the process did: a
  success that measures nothing (`times` reports 0).
- Slop's `test` has no `-nt`: OCaml's Makefile prints "test: unsupported expression" at
  every make and takes the branch it wants anyway.

## Findings (2026-10-23, agent; probes in `tools-build` with `threads@0`, Chromium)

- Pinned: the release asset `ocaml-5.5.0.tar.gz` of GitHub's release page (1,676 files,
  `boot/ocamlc` and `boot/ocamllex` in it; INRIA's archive of the same name is a larger
  git export with the testsuite).
- Measured in Dolly: `sigaltstack` fails with `ENOSYS`; `mmap(PROT_NONE)` of 256 MiB
  takes 0.06 s and commits; `MAP_FIXED` fails with `ENOTSUP`; `mprotect` succeeds and does
  nothing; `posix_spawnp` works; `fork` fails with `ENOSYS`; the page size is 65,536.
- configure in the Emscripten container (`prepare-ocaml.sh`): its link test finds no
  `posix_spawnp` in Emscripten's libc, which Dolly's has, so the result is stated.
  configure records `ar`, `awk`, `sed`, `install -c` and `STRIP=:` (Dolly has no strip).
  OCaml 5's runtime is built with `-pthread`, so `ocamlrun` needs `threads@0`; no shared
  stub libraries (`--disable-shared`): `-rdynamic` and `-pthread` exclude each other.
- Runtime patch (`ocaml-dolly.patch`, three hunks): `MAP_FIXED` commit replaced by
  `mprotect` as on Cygwin; a missing `sigaltstack` (`ENOSYS`) no longer aborts start-up
  ("Failed to allocate signal stack for domain 0") or exit; `Max_domains_def` 16 instead
  of 128 on Dolly: with 128, every `ocamlrun` commits 256 MiB of minor heaps, and
  `make -j4 all` was killed by the 6 GB cap of the browser slot (OOM in the scope).
- In a session: the runtime (`boot/ocamlrun`, `libcamlrun.a`) builds in 10 s at `-j2`,
  `boot/ocamlrun boot/ocamlc -version` prints 5.5.0 in 0.08 s, `make coldstart` (the
  stdlib by `boot/ocamlc`) takes 5.5 s at `-j4`.
- `make -j4 world` reached `tools/ocamltex`, the first program linked with a custom
  runtime, and stopped at link: Dolly's libc has neither `gethostbyname_r` nor
  `gethostbyaddr_r` (stated absent) nor `gethostbyaddr` (it has a `gethostbyname` that
  fails with `NO_RECOVERY`). `HAS_SOCKETS` cannot go instead: `Unix` computes
  `inet_addr_any` at initialisation. Patch hunk: `Unix.gethostbyaddr` raises `Not_found`.
- configure's `-lpthread` alone links Dolly's non-threaded libc (`pthread_attr_init`
  undefined in systhreads): `LDFLAGS=-pthread` makes every OCaml executable a threads one.
  A `-pthread` hello world starts as fast as a plain one (10 runs, 0.03 s both).
- A custom runtime (`-custom`, and implicitly any program with `unix`, `str` or
  `threads`, since there are no shared libraries) is the C runtime with the bytecode
  appended; Dolly refuses it ("WebAssembly binary section 0 at byte 0: unexpected end
  of file"). The same executable with a custom section appended runs, and OCaml reads its
  trailer from the end of the file: patch hunk in `bytelink.ml`, when the runtime starts
  with `\0asm`, the bytecode is appended as the custom section `ocaml`.
- `Unix.create_process` failed with `EOPNOTSUPP`: Dolly's `posix_spawn` takes dup2 and
  chdir actions only, and OCaml adds a close of the source descriptor after its dup2.
  Patch hunk: no close action on Dolly (the child keeps that descriptor too).
- From scratch in Chromium at `-j4` (tools-build with `threads@0`): `make world` 70 s,
  `make bootstrap` 82 s ("Fixpoint reached, bootstrap succeeded."), `make install` 1 s;
  the browser scope's peak 4.1 GB (6 GB cap). Installed: 41 MB in `/usr/lib/ocaml`,
  the toplevel 27 MB, `ocamlc` 3.6 MB. The toplevel runs a script; `ocamlc` links a
  program with `unix` and `str` that spawns `echo` through a pipe; one with a domain and
  a systhread prints both results (`recommended_domain_count` 4); `#load "unix.cma"`
  fails ("dynamic loading not supported on this platform"); `ocamlmktop` with `unix`
  works.
- The installed package needs `cc` to link a custom runtime (the first browser test run
  failed with `cc: command not found`): the recipe installs the `cc` package, as `rust`
  and `cmake` do.
- Measured in a session (default with the package): `Unix.gethostbyaddr` and
  `gethostbyname` raise `Not_found`; `Unix.fork` and `Unix.socket` fail with "Function
  not implemented"; `Sys.command` and `Unix.open_process_in` run through Slop. `Sys.time`
  did not advance: Dolly's `getrusage` returns success with a user time of 1.000002 s
  whatever the process did, and `times` 0, while `clock` counts the process's time
  since it started. configure now states neither exists, so `Sys.time` reads `clock`.
