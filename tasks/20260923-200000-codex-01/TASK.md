# Reduce peak memory when saving a large restored session

- STATUS: OPEN
- PRIORITY: 300
- TAGS: runtime,persistence,memory

Restoring the 387804845-byte native Pi history and its 51-object world through
ordinary Dolly uploads succeeds, including an exact pre-tick world comparison.
Saving the restored session immediately afterwards exceeded the test browser's
4 GiB/no-swap cgroup on 2026-09-23 at 19:59 JST. The kernel OOM record identifies
the Chrome renderer, with 3921532 KiB anonymous RSS. The host remained responsive;
the original IndexedDB save and independent recovery archive remain intact.

Reproduction: `build/blockwalker-checkpoint-restore.mjs`, USTAR recovery chunks
under `build/blockwalker-recovery-20260923/`, log
`build/blockwalker-september-restore-ustar.log`. The failed scope was
`run-rf9f79c0de2e84e8ba07391dcc4e20829.scope`. Do not include relay credentials
in artifacts or print native reasoning signatures. Retain the complete history.

Explicit browser garbage collection after import and before save also exceeded
the bound (log `blockwalker-september-restore-collected.log`). Using the existing
uncompressed save path did too (`blockwalker-september-restore-identity.log`).
The renderer retained approximately 2.8 GiB before capture in these attempts;
removing compression alone does not resolve the peak. Both failures were
contained by the cgroup, with the original named session preserved.

Investigate retained upload buffers, process reclamation and snapshot capture.
Keep the 4 GiB limit. Completion requires a normal, unmodified save/reload within
the bound with every file hash preserved and no UI freeze. Offline session-file
migration is a recovery workaround, not completion of this issue.

That workaround succeeded: a private session-file export was rebased offline
after verifying the complete effective filesystem, then imported through the
normal session UI. All state hashes match except pausing Pi. Actual GPU execution
restored 51 bodies, 78 designs and the original removals; the existing biped
resumed upright with no HTTP requests. Evidence:
`build/blockwalker-recovery-20260923/{offline-migration,restored-session,running}-proof.json`
and `build/blockwalker-september-import-diagnostic.log` (73516 terminal 0).
The original named save remains untouched; this does not exercise live capture.

Checkpoint audit: the 387804845-byte native history contains 1217 images with
361869408 bytes of base64 payload (93.3% of the whole file). All 3717 JSONL
entries parse. Limiting model context to three images does not limit retained
history. Keep that complete history while reducing copy/serialization peaks;
do not solve this by truncating the user's experiments. Aggregate evidence:
`build/blockwalker-audit-20260923/history-size.json`. No new OOM run was needed.

September 24: capture now streams copied mailbox chunks into gzip with
backpressure. Session and image-cache records store opaque Blobs while retaining
legacy ArrayBuffer reads. Decompression grows one bounded buffer; boot detaches
consumed inputs after copying them into Wasm. The ABI and snapshot formats are
unchanged. No history truncation, forced GC or larger memory limit is needed.

Normal save followed by closing/reopening the tab passed under 4 GiB/no swap:
392381512 raw bytes, 278357296 compressed, sampled whole-tree peak 3307249664
bytes (3.08 GiB). All archived file hashes match except the intentional Pi pause
setting. The 387804845-byte history retains its original SHA-256
`42877acd66e131a97f868bcaa959a6ee4b4488ef46f08cefdfebb38f6485a287`.
Actual GPU execution restored 51 creatures and the original removals, with no
HTTP requests. The library retains its original 78 designs and appends the 29
current catalog designs. Evidence: `build/blockwalker-memory-reopen2.log` (exit
0), `build/blockwalker-memory-profile/reopen-proof-{result,memory,saved-files,restored-world}.json`
and `reopen-proof-restored-world.png`. The original profile/archive is untouched.

The remaining failure is immediate same-tab refresh: capture and storage finish,
then decoding and cached-image verification finish, but replacement runtime boot
exceeds the bound. `build/blockwalker-memory-release-save.log` records the latest
contained renderer OOM, sampled peak 4260159488 bytes. Upload/extraction already
raises the old kernel's Wasm memory to 2367881216 bytes; process and compiled-code
measurements do not account for that retained size. Fresh-tab restoration uses
1269039104 kernel bytes. Keep this issue open until same-tab refresh also passes;
do not present the successful reopen as a complete fix.

Final source checks passed: 12 session codec/transport tests; Chrome and Firefox
custom build/save/restore/export/import, legacy-record compatibility, exact-base
recovery and policy intersection; actual 9099 game Save/refresh, typing/F11,
held-key release, repeated quicksave and failed-save retention. Browser logs:
`build/session-stream-custom-browsers-final.log` and
`build/blockwalker-session-memory-final.log` (both exit 0). These ordinary-size
refresh checks do not substitute for the remaining large-session reproduction.

A credential-free lifecycle probe reproduces the remaining failure in seconds:
compile `build/session-lifecycle.c` inside Dolly, temporarily grow a file to
1800 MiB, unlink it, write a deterministic 256 MiB file, Save, then refresh.
The synthetic high-water mark isolates memory lifetime from the private history.
Kernel memory reaches 2376269824 bytes. Waiting two seconds for the old workers
to close still fails; diagnostic forced garbage collection drops the browser
tree from 3769479168 to 721170432 bytes and allows restoration. That is evidence
of reclaimable old allocations, not a production fix. An ordinary Chrome launch
without Playwright or a debugger also exhausted the cgroup after Save/reload
(sampled peak 4264382464 bytes, renderer OOM confirmed). Logs:
`build/session-lifecycle-{pause,gc}.log`, `build/session-lifecycle-native2.log`;
numeric memory and worker-lifetime records are in the matching build directories.
No diagnostic delay or explicit garbage collection was added to the application.

A candidate transferred compressed saves to the runtime Worker and decoded
directly into the existing Wasm staging allocation, using an optional checked
decoded-length field. Codec/consumer/error checks passed, but both the native
synthetic test and full learned-session refresh still exhausted the limit.
The latter peaked at 4284022784 bytes (`build/blockwalker-memory-direct-decode.log`).
The candidate was reverted; its patch remains in
`build/session-direct-decode-candidate.patch` for investigation. It is not part of
the preview, and does not justify changing the filesystem format or adding a
forced-GC workaround.
