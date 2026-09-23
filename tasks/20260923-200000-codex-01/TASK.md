# Reduce peak memory when saving a large restored session

- STATUS: OPEN
- PRIORITY: 200
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
