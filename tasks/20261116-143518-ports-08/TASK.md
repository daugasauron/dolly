# Bytecode made outside Dolly: Emacs's Lisp, for a stack overflow that no longer happens (upstream's whole bootstrap runs inside in 24 to 32 min), and CPython's frozen modules

- STATUS: CLOSED
- PRIORITY: 90
- TAGS: audit,ports,emacs,python,0.1.8

## State (2026-11-17)

Closed: decided and done on `ws/ports` (`2493b117e`), both built inside Dolly and verified in
this tree. It rebuilds `emacs` and `gnu-emacs`, and `python` and what installs it.

- Emacs: `prepare-emacs.sh` stages the release without its `.elc` files, and
  `Dollyfile-emacs` runs upstream's bootstrap (`make -C src bootstrap-emacs bootstrap-emacs.pdmp`,
  `make -C lisp -j4 compile-main EMACS=../src/bootstrap-emacs`, then `make -C src`); the
  README's stack-overflow limit is gone. Built in this tree: the bootstrap compiled the 1,641
  files without a stack overflow and every check of the recipe passed (`31.1 dolly`, the
  installed `subr.el.gz` among them); the build took 3,578 s at a load of 35 to 42, where
  round 1117's `emacs`, with the shipped bytecode, took 49 s and the other images of this pass
  took 3.3 to 5.7 times their round's time, so a round's is about 11 to 18 minutes. The
  snapshot is 146,018,443 bytes against the release's 146,024,489. The emacs demo test passes in
  Chromium and Firefox, `gnu-emacs` and the package on `default` (`cc-6`, `both-9`; the first
  Chromium run had started before `gnu-emacs`'s metadata was written).
- CPython: `prepare-cpython.sh` no longer freezes modules with the host's Python, and its key no
  longer holds that Python's version; `Dollyfile-python`'s `make` names CPython's own C freezer
  (`FREEZE_MODULE_BOOTSTRAP`, `FREEZE_MODULE` and their `_DEPS`, `./Programs/_freeze_module`),
  which it builds and runs. configure still asks the host for a Python 3.14 (a cross build
  refuses to start without one of its version), which it only names in the Makefile. The
  archive is `4d96d70f…`, the same when prepared again from nothing (`cpython-again.sh`).
  `python` builds in this tree (253 s, `build-3.log`): Dolly compiles `Programs/_freeze_module`,
  which writes the 24 frozen modules (`./Programs/_freeze_module importlib._bootstrap
  ./Lib/importlib/_bootstrap.py Python/frozen_modules/importlib._bootstrap.h` among them), and
  every check of the recipe passes (snapshot 49,945,675 bytes, the release's 49,836,173). The
  python demo test passes on it in Chromium and Firefox, the `python` image and `python on
  default` (`both-18`).

## What

`demos/emacs/Dollyfile-emacs:32-33` and `demos/emacs/README.md` ("Limits"): "The release's
byte-compiled Lisp is used as shipped: bootstrapping it from source interprets the loadup files
and overflows a browser Worker's stack." So the `.elc` files of the `emacs` package are the
release tarball's, compiled outside Dolly, while AGENTS.md's goal is programs "built from their
upstream sources inside the sandbox itself". The limit was written on 2026-10-02 (`03014e5f2`).

Measured 2026-11-16 in Chromium 156 on round 1117's `system`, from the staged
`dist/static/emacs/emacs.tar.gz` built as `Dollyfile-emacs` builds it (the `dolly.process.stack`
section appended, `make` of `lib`, `lib-src` and `src temacs`: 10 to 13 s), with all 1,640
`.elc` files removed and `make -C lisp update-subdirs` run:

1. `./temacs --batch -l loadup --temacs=pbootstrap`, upstream's bootstrap dump, loads the
   preloaded Lisp from source and writes `bootstrap-emacs.pdmp` (29,819,608 bytes) in 33.5 s,
   status 0; the same `temacs` rewritten by `stack-wrap` with `stack@0` does it in 34.3 s
   (`emacs-bootstrap.mjs`, `emacs-bootstrap-2.log`; a first run with `--temacs=pdump`, not the
   bootstrap mode, stops at `(require pcase)`: `emacs-bootstrap.log`).
2. Upstream's rule `make bootstrap-emacs bootstrap-emacs.pdmp` in `src` (the dump, then `lisp`'s
   `compile-first`: `macroexp`, `cconv`, `byte-opt`, `bytecomp`, `loaddefs-gen`, `radix-tree`):
   61.5 s, status 0.
3. `make -j4 compile-main EMACS=../src/bootstrap-emacs` in `lisp`: 1,395.8 s, status 0, 1,640
   `.elc` files, the number the release ships, and no line of its log names a stack, an overflow
   or a recursion (`emacs-lisp.mjs`, `emacs-lisp.log`).

All three run on the plain `temacs`; `stack@0` is not needed. A second session ran the whole
sequence again from a fresh tree, on a machine at load average 22 to 28 (`emacs-full.mjs`,
`emacs-full.log`): bootstrap 76.4 s; `compile-main` 1,830.9 s, 1,640 `.elc`; then upstream's
`make -j4 emacs emacs.pdmp` in `src`, 6.9 s, "Dump complete", an `emacs.pdmp` of 12,877,192 bytes;
and that `emacs` runs `Dollyfile-emacs`'s check (`:70-94`) without its installed-layout part
(`emacs-check.el`: a UTF-8 file round trip, `shell-command-to-string`, `call-process`'s status,
an asynchronous `make-process` with a timer, `cl-remove-if` compiled, `garbage-collect`), printing
`31.1 dolly /tmp/emacs/lisp/emacs-lisp/cl-seq.elc`, status 0. Scripts and logs are in
`work/audit-1116-evidence/ports/`.

The same kind: CPython's frozen modules (the bytecode of `importlib._bootstrap` and the rest it
freezes into the interpreter) are made on the build host by the host's own Python 3.14
(`demos/python/prepare-cpython.sh:8-14,118-123`: `make -n python | grep
"/Programs/_freeze_module.py" | ... eval`), where a native upstream build runs the C freezer it
has just built. Tried in a session (round 1117's `system` with the python recipe's packages):
`Dollyfile-python`'s rows replayed with `Python/frozen_modules/*.h` removed and `make` given
`FREEZE_MODULE_BOOTSTRAP=./Programs/_freeze_module` (and its `_DEPS`, `FREEZE_MODULE`) builds and
runs `Programs/_freeze_module` inside Dolly, writes the headers again and links `python` in
144 s; it runs `json` and `subprocess` (`python-freeze.mjs`, `python-freeze.log`). So
`prepare-cpython.sh`'s freezing step and its need of a host Python 3.14 can go.

## Smallest fix

In `Dollyfile-emacs`, remove the release's `.elc` files and run upstream's bootstrap (`make` in
`src` makes `bootstrap-emacs`, then `lisp` compiles, then the dump), keeping the release's `.el`
sources; drop the README's limit. Or, if 24 to 32 more minutes per `emacs` build are not worth it,
keep the shipped bytecode and say that it is a choice, not a limit. In `prepare-cpython.sh` drop
the freezing step (and the host Python 3.14 it needs), and give `Dollyfile-python`'s `make` the
four freezer variables; this one costs seconds.

## Done when

The `emacs` package's Lisp is compiled inside Dolly and the emacs demo test passes in Chromium
and Firefox, or the README and the recipe say why the release's bytecode is kept, without the
stack overflow; and the `python` package's frozen modules are made by its own build in Dolly,
its demo test passing.
