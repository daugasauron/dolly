# Make more of the catalog installable packages

- STATUS: OPEN
- PRIORITY: 300
- TAGS: dollyfile,packages,amy

Owner (2026-10-05): "Make more things into packages, it works really nicely."

## Work

Survey every image of the catalog. Convert to `PACKAGE` what a user would
`amy install` into a running session or what several images repeat, so
applications become thin compositions of `INSTALL` lines and `default` stays
small. Candidates to measure, not a decision: fd, protox, Neovim, CMake,
TypeScript, SDL2, Zig, curl, the llama runtime, Codex. State the rule for
"what is a package" in `docs/dollyfile.md` if it is not already crisp, and
remove any core special case the survey exposes.

Owned elsewhere, do not edit: `demos/pi`, `demos/studio`
(`20261005-131647-pi-1`), `demos/local-llm` (`20261005-131646-webgpu-any-gpu`),
`demos/zero-ad`, `demos/slopyard`.

## Done when

- A table here lists each image's role before and after, snapshot bytes before
  and after, and the `amy install` time of each new package.
- Each new package installs and runs in a running `default` session in a real
  browser, covered by a test.
- The touched images' demo tests pass.
