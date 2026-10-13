# Image builds keep every dependency snapshot twice more than they need

- STATUS: OPEN
- PRIORITY: 180
- TAGS: core,builder,memory

## State (2026-10-13)

Both copies are gone on `core/polish`; the done-when's measurement is not made.

- **The page's copy** (`39615bcc`, page only): the build that ends a caller's work says
  `consume`, and the Worker frees each dependency snapshot once it is in the kernel instead of
  handing it back to the page. The command-line builder, the page's own build and Studio's say
  it; dependency builds in a page still get their inputs back for the next build.
  `test/image-browser.mjs` builds with consumed inputs and requires the page to hold none
  afterwards and the same image.
- **The kernel's copy** (`b1e07029`, a seed change: `src/dollyfile.c`): `dollyfile` removes a
  snapshot from `/etc/dolly/artifacts` with the recipe's last line that names it, so its blocks
  are malloc's again before the first `RUN`. `dollyfile install` keeps it, because `amy` lists
  it afterwards. The image suite's recipe checks that the directory is empty after `FROM`; it
  passes in Chromium and Firefox on a chain rebuilt on that seed.

Left: the measurement. Kernel memory never shrinks, so the kernel half shows only in a build
that writes as much as its inputs; and the base is still in kernel memory twice until `FROM`
has read it (the restore that starts the builder, and the snapshot `FROM` reads). The installer's
side, `amy install` of a 1.4 GB package peaking at 6.6 to 8.2 GB
(`tasks/20261012-130814-packages`), is the same file read twice and is not changed by either
commit: `amy` keeps the snapshot to list it.

## The finding

Found on the Cargo track (2026-10-06, `tasks/20260930-231102-cargo-native`).

## Measured

The same Patti build of Cargo (`-j 4`, last crate `cargo` with 16 codegen
units), memory of the systemd scope around the browser:

- in a plain `rust-build` session driven over a control port: 4.4 GB steady
  in the last crate, peak 5.05 GB;
- as the `cargo` image build (`FROM rust-build`, `INSTALL rust`): 5.64 GB
  anonymous memory in the last crate when it passed (22:57), 5.94 GB when the
  6 GB cap killed it (23:57, "page.evaluate: Target crashed"); 3.8 GB against
  2.7 GB two minutes in.

So the image build holds 1.2 to 1.5 GB more from the start. `rust-build`'s
snapshot is 397 MB, the `rust` package's about 290 MB.

## Cause (by reading)

- `src/runtime-worker.mjs` writes every dependency artifact, the base
  included, to `/etc/dolly/artifacts/SHA.snapshot` in the guest file system
  and unlinks them only after the recipe has run. The base is restored into
  the kernel besides, so its bytes are in kernel memory twice for the whole
  build; a package waits there until its `INSTALL` line and stays after it.
- The Worker returns each buffer to the page after importing it
  (`build-input`, "so shared dependencies remain reusable"), and
  `src/image-builder.mjs` keeps it. The command-line builder starts one
  browser per image, so nothing reuses them there.

For `cargo` that is twice 687 MB, about what was measured. Every image pays
its dependencies' size this way; a Codex builder was seen at about 10 GB.

## Fix to consider

- `src/dollyfile.c`: `load_artifact` reads the file for `FROM`, `INSTALL` and
  `COPY`; unlink it after the last statement that names it (a recipe may
  `COPY` several times from one image). A seed change.
- The page: drop a returned buffer when no later build in the page can use
  it.

## Done when

- The `cargo` image build stays within a few hundred MB of the same build in
  a session, measured the same way, and the image suites pass.
