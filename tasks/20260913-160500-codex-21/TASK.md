# Include the process startup object in the sysroot cache identity

- STATUS: OPEN
- PRIORITY: 300
- TAGS: audit,bug,build,core

## Evidence

`prepare-process-sysroot.sh` copies `build/process-crt1.o` into `crt1.o`, but
omits it from `SHA256SUMS` and therefore from the sysroot cache key. A changed
startup implementation can leave the target compiler using old startup code.

Reproduced with the actual pinned Wasm archives and preparer in an isolated
`build/core-sysroot-proof` tree. Adding a valid custom section to the copied
startup object changed its bytes, but preparation returned the same
`process-sysroot-fcc76715e9c70251a3ec6bf58a99c419b766ac774e0f35d2be28c7f31c9ba599`
and retained the old `crt1.o`. The original build inputs were untouched.

## Done when

- Include every published runtime input, including startup code, in the key.
- Prove changed startup bytes publish a new sysroot and unchanged inputs reuse it.
- Rebuild and validate the seed and affected images in a browser.

## Progress

Adding `crt1.o` to the published checksum set fixes the reproduced Wasm case:
the changed startup object now selects a new directory and the old sysroot stays
intact. A regression executes the complete preparer on small, real native
archives; it failed before the change and passes afterward, including unchanged
reuse and a missing-input failure. All 279 source checks pass in 3.30 s.
The corrected seed and affected browser images still need rebuilding.
