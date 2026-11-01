# Audit: every claim in the documentation, against the code

- STATUS: OPEN
- PRIORITY: 260
- TAGS: docs,audit

## State (2026-11-02)

In progress on `core/docs-audit` (from `integrate/2026-11-02`, fa949c1b).

Scope: `README.md`, `docs/*.md`, `host/README.md`, `abi/README.md`, `demos/*/README.md`,
and the help texts and manual pages the core ships. Method: each document's factual claims
(an operation exists, a limit, an option, a test, a path, a measurement) checked against the
code or by running it; a wrong document fixed, a gone feature cut, a claim the code should meet
but does not filed here as a finding.

## Per document

### README.md

- `gzip` compresses since 68824453 (the night): the core image list said it only unpacks
  (`gzip -dc`) and that `pigz` writes `.gz` files.

### docs/architecture.md

- The core image diagram missed `gzip` among `system-tools`' packages (installed since
  5ec4783c, 2026-10-01). The sentence naming which images install `amy` and `transfer` was
  partial (`x11-desktop`, `tmux-panes` and `ghostty-x11` install `amy` too); it now says
  the rule only.
- Checked: 56 processes (`process-supervisor.mjs`, `process-kernel.c`), 1 MiB packets
  (`process.h`), 1 MiB file blocks and the 128 MiB reserve (`file-blocks.cpp`), `chmod` and
  `chown` (`libc-adapter.c`), `/tmp` and `/workspace` kept empty (`system-snapshot.c`),
  `/run` out of sessions (`session-records.h`), `xargs -P`.

### docs/dollyfile.md

- The host-module examples were wrong: `sdl2` declares `audio@0` and `touch@0` too, `rust`
  `dso@0` as well as `threads@0`.
- "FROM and only EXPORTS (`cc`, `cmake`) or COPY rows (`nvim`, `rust`, `codex`)": `cmake`,
  `nvim` and `codex` hold their builds (SLOP steps, no COPY). Now `cc`, `zig`; `display`,
  `rust`, `cargo`, the packages that do.
- Checked: 128 KiB and 64 KiB text limits (`dollyfile.c`), the role table against the
  recipes, `system`'s and `default`'s host lists, `amy`'s subcommands, the image logs'
  path, Studio's composition.

### docs/slop.md

- Cut the dated native `configure` survey (2026-10-06, a task path in a shipped document): it
  cannot be re-run today, and "once `umask` exists" reads against the owner's decision that
  `umask` stays refused.
- Checked: the builtin list against `builtin_name()` and the refusals against
  `unsupported_builtin()` in `slop.c`, 1,000 history entries, 32 background programs, the
  interrupt poll every 64 commands, `nproc` printing 4, Samurai's two jobs for one processor
  (`samu.c`), Make 4.4.1, `tar` extracting only, `ls -l`'s KiB total.

### host/README.md

- The provider's records missed `configuration` and `transfers`, through which the page side
  hands its Worker side data and objects (the display's and the GPU's canvas, the snapshot's
  bytes). Checked every `module.json` field against the table, the runtime-machinery list
  against what each provider imports outside its directory, and the `package` field's modules.

### abi/README.md

- The contract table had no row for `sockets@0` and `pty@0`. Operation numbers checked against
  the generated headers (112-123 dso, 116 stack, 128-133, 160-169 sockets, 176-177 pty).

### docs/browser-boundary.md

- The trusted-files map missed `src/sha256.mjs` (imported by `packaged-snapshot.mjs`) and the
  runtime's generated modules the page imports (`dist/dolly-build-id.mjs`,
  `dist/dolly-image-build-id.mjs`, `dist/dolly-process-abi.mjs`): found by walking the static
  imports of `browser.mjs`, `site.mjs` and the Worker entries.
- Checked every number of the module table against the code: 16 HTTP slots, download and upload
  1 MiB chunks and 1 GiB, 4 waiting offers, the 2 s upload quiet time, touch 10 fingers and
  512 records, GPU 8 scopes, 4,096 objects and 4 GiB, audio 4 streams of 48,000 frames,
  microphone 96,000 frames, 64 package snapshots, 20 MiB parts and the 2 GiB snapshot bound,
  the 32-image, 8 GiB cache, the fixed modules and `buildHost`.

### docs/display.md, docs/sessions.md, docs/sources.md

- display: "`system` copies only that plugin": the `display` package does (eight `COPY` rows).
  Font sizes measured: Droid Sans Fallback 3,451,744 bytes, Noto Emoji 880,860.
- sessions: cut "saves made before 0.1.0 are not carried over" (about a release that is gone).
- sources: the image build ID's inputs named "its loader", `dolly-seed.mjs`, gone since
  97c34d4d; `write-build-id.mjs` hashes `dolly.data` and four contracts.

### docs/deployment.md

- Re-measured the archive (`work/locks/published`, read only, with `pagesHeaders` of
  `export-cloudflare-pages.mjs`): v0.1.4 is 3,785 files and 21.9 GB and alone needs 55
  header rules (6 + 37 sources by path + 12 packs by content); the five published versions are
  14,037 files and need 92 of Pages' 100 rules. The 2026-10-08 figures (71 images, 2,139 files,
  45 rules, "nine versions fit") are replaced. The packing figures of a 67-image catalog
  (221 MB peak, 3.5 minutes) are dropped: not re-measured.

### docs/licences.md, README.md

- 12 files carry the GPL marker, not 10: the Xonotic port added `dpgpurast.c` and
  `dpshaders.c` (2026-10-27). README's own list was a stale copy of licences.md's; it now
  links there.
- The Claude Code row linked a task, which a `docs/` page may not.

### docs/embedding.md, docs/agent-frontend.md, docs/image-build-service.md, docs/http.md, docs/input.md, docs/audio.md, docs/gpu.md

- No wrong claim found. Checked: the npm package split in `package-npm.mjs` (`runtimeModules`,
  `dolly-host-save`), `pi-minimal`'s modules and installs, `boot()`'s options, pi-minimal's
  packs (27.5 MB encoded, measured on this branch's and the integration tree's metadata),
  the tests the frontend guide names, the build service's 128 KiB, 8 MiB, 45 minutes, 10 s,
  409 and 400, the HTTP caps and defaults (`policy.mjs`), curl 8.21, the input record size and
  touch reserve (20), the terminal padding 12 by 10, the GPU quotas and feature bits, the audio
  and microphone constants.

## Findings (claims the code should meet but does not)

- Pages' header rules (measured above): the deployment of v0.1.4 uses 92 of 100. The exporter
  fails at 100 naming the versions, by design, and removing a version is the owner's act; the
  next release should expect that choice if it adds more than eight large files that the
  published versions do not store the same way.

## Not checked
