# After 64 package snapshots a page refuses every amy install with Quota exceeded, and does not say a reload resets it

- STATUS: CLOSED
- PRIORITY: 220
- TAGS: audit,amy,packages,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`), looking for why "sometimes amy install doesn't work".

## State (2026-11-17)

Changed on `fix/amy` (`work/fix-amy`, commit `d5216e1b5`), page JavaScript only: 1024 snapshots per
page load (`maxSnapshots`, `host/packages/transport.mjs`, which `service.mjs` imports: the mailbox
and the service for another directory count 1024 each), several times the 165 packages of the index,
and still a bound against a loop. A refusal past it shows the page's status line: "This page has
handed over the 1024 package snapshots a page load gives: save the session (Ctrl+Shift+S) and reload
the page to install more"; the service's 429 body says the same. The review map's row says 1024 and
the notice. `test/packages-transport.test.mjs`: past the quota a request ends with EDQUOT and the page
is told. The amy test's 65 misses (a miss spends nothing) cannot exceed 1024 any more and are one.

Checked on round1113's images: the 70 installs of `cases-quota.json` in one default session all
succeed, 79 rows recorded (Chromium, `fix-amy/quota-chromium.jsonl`); with transport.mjs's quota set
to 2 by a source override, the third install fails with Quota exceeded and the status line shows the
notice, Chromium and Firefox (`fix-amy/scripts/quota-notice.mjs`, `quota-notice.log`).

amy's part, on `ws/seed` (`7079a2d21`; amy.c is in the seed): on `-EDQUOT` `channel()` says "amy:
NAME: this page has handed over all the package snapshots a page load gives: save the session
(Ctrl+Shift+S) and reload the page to install more" instead of `strerror`. `amy-browser`'s new
`amy quota` case (the page's quota set to 2 by a source override) checks that the third install is
refused naming the reload, Chromium and Firefox, on the rebuilt seed
(`work/audit-1116-evidence/core/fix-seed/amy-subset-2.log`). The 64 KiB `MAX_INDEX_BYTES` (about
318 packages) is not reached: the index is 34 KB for 165 packages.

## Found

`host/packages/transport.mjs:8` (`maxSnapshots = 64`, "enough for every package, not for a loop")
and `host/packages/service.mjs:9` hand over at most 64 package snapshots per page load. Every row
of a package's record is a snapshot of its own (`tasks/20261012-230015-package-dependencies`:
"a row's snapshot counts as one"), and `amy files NAME` of a package not installed fetches one too.
The published 0.1.7 index lists 165 packages; `amy install pi-dolly` in `default` fetches 13 snapshots,
`amy install seaborn` 8.

In one `default` session, 70 small packages installed one after another: the first 64 install,
then every `amy install` fails, until the page is reloaded:

```
failed at 65: libxml2
...
amy: fetching flex from http://127.0.0.1:40633/
amy: flex: Quota exceeded
amy: flex: not installed
```

`amy` prints `strerror(EDQUOT)` (`programs/commands/amy.c`, `channel()`), which says nothing of
the page, the count or the reload; a session that already installed a few large applications'
worth of packages meets it with no hint. The foreign-directory path (`service.mjs:58`) does say
"this page's package snapshot quota is spent".

A second fixed limit of the same path, not reached yet: `amy` reads at most 64 KiB of index
(`amy.c`, `MAX_INDEX_BYTES`; past it `amy list`, `info` and `install` fail for every package). The
published indexes are 28,073 bytes (v0.1.5, 141 rows), 33,970 (v0.1.6 and v0.1.7, 165 rows)
(`work/locks/published/vX.Y.Z/amy-index.txt`): about 206 bytes a row, so the limit is near 318
packages. And a package's snapshot is at most 2 GiB (`DOLLY_PACKAGES_MAX_SIZE`, as an imported
image is, `docs/dollyfile.md`): `qwen3.5-4b`'s is 2,105,962,841 bytes, 98.1% of it, `zero-ad-data`'s
89.9%; a larger model is a package amy cannot hand over (`EFBIG`). The session's own bound
answers explicitly: with lean-meta, lean-std, qwen3.5-4b and zero-ad-data installed (6.4 GB of
files), the next install, lfm2.5 (1.67 GB), ends with `dollyfile: artifact ...: No space left on
device` and installs nothing (`capacity.jsonl`), below the "8 GiB a save holds" of
`docs/dollyfile.md`; how the kernel counts that bound was not traced.

Evidence: `work/audit-1116-evidence/recipes/quota.jsonl` (case `quota`, `cases-quota.json`).

## Do

- `amy.c` `channel()`: on `-EDQUOT`, say that this page has handed over its package snapshots and
  that reloading the page (after saving the session) gives more.
- Size the quota to the catalog rather than below it: at least the number of packages the page's
  `amy-index.txt` lists, or a budget in bytes; update the boundary map's row.

## Done when

In one `default` session, the 70 installs of `cases-quota.json` succeed (the whole index does not
fit a session's 8 GiB), and the refusal past the quota names the reload; `test/amy-browser.mjs`
covers the message.

## Closed (2026-11-17)

The quota is 1024 snapshots a page load (`fix/amy`, `d5216e1b5`, in `integrate/0.1.8`): the 70
installs of `cases-quota.json` succeed in one `default` session (`fix-amy/quota-chromium.jsonl`),
and past it the page and amy name the reload (`fix-amy/quota-notice.log`; `amy quota` in
`test/amy-browser.mjs`, `ws/seed` `7079a2d21`, Chromium and Firefox).
