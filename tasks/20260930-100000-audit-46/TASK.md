# Rust seed and Codex configuration hazards

- STATUS: OPEN
- PRIORITY: 120
- TAGS: demo,rust,build

`src/commands/rustc.sh:24-28` injects `RUSTC_BOOTSTRAP=1` and `-Z unstable-options` for every
crate (build scripts probing nightly features will think they exist; suspected).
`config/codex/patti.toml:19,24` passes the debug flag `-Ztime-passes`.
`src/codex/config.toml:2-3` runs with `approval_policy = "never"` and `sandbox_mode =
"danger-full-access"`. `toolchain/rust/libc-0.2.185.patch` and `libc-0.2.186.patch` are near
duplicates. `prepare-codex-sources.py:60-86` edits the nix crate with inline string replacements
instead of a patch.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Nightly features are scoped to crates that need them; no debug flags in release builds; one libc
patch.

## Done when

- Codex build still succeeds without `-Ztime-passes`; unused patch removed.
