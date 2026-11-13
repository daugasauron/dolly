# A rebuilt runtime under the same version leaves its saves with Recover files only

- STATUS: CLOSED
- PRIORITY: 320
- TAGS: sessions,ux,0.1.6

Found by `20261113-221000-session-audit`. Likely part of why saving "feels a bit buggy" on a
candidate.

A save opened only on the build that made it: `sessionCompatible` (`src/session-store.mjs`)
compared the record's `buildId` with `DOLLY_BUILD_ID`, the digest of the image inputs and
`dolly.wasm`. A release is immutable under its version, so its users never met this. A candidate
keeps its version while it changes (`scripts/serve.mjs`): every repackaging with a kernel change
turned each save made on it into a row that said "Older runtime; saved data retained." with no
link, and Recover files as the only way in (home and workspace copied into a fresh `system`;
system edits, deletions and symlinks skipped; nothing over 2 GiB,
`20261113-140028-recover-large`). The kernel fix of the audit itself did it to every save made on
the 0.1.6 candidate before it.

## Closed (2026-11-13)

A save since format 4 is a whole filesystem whose programs meet the kernel only through the
process contracts, so it is valid exactly where the images are: a save now records the image build
ID (`DOLLY_IMAGE_BUILD_ID`: the seed and the process, dso, kernel-plugin and image contracts) as
its `buildId`, and opens on any runtime with that ID. A kernel-only rebuild keeps it; a seed
change does not, and then the row says "Made on another build of this version".

Evidence: a session exported from the candidate on :9045 (main's kernel, runtime
`sha256:971a80af…`), imported into `fix/sessions` (runtime `sha256:c2ccff64…`, the same image
inputs `sha256:2ee43eaf…`) with the image build ID as its `buildId`, restores, and its compiler
compiles and runs a program (`build/audit/cross-kernel.log`); `test/session-save-browser.mjs`
checks what a save records. Saves made before this change carry the runtime's ID and stay rows
with Recover files.
