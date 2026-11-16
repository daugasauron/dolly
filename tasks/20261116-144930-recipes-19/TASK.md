# Two amy commands at once: the second fails at once with "the page's image directory: Resource busy"

- STATUS: OPEN
- PRIORITY: 160
- TAGS: audit,amy,packages,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`), looking for why "sometimes amy install doesn't work".

## State (2026-11-17)

Fixed on `fix/amy` (`work/fix-amy`, commit `9351b7fca`), kernel only (image inputs unchanged,
`87c27243`; a runtime build ships it). Deferring each request, as Do says, removed the EBUSY but
was not enough: amy fetches a package and the rows it needs into `/etc/dolly/artifacts/PIN.snapshot`
and removes that directory after each, so two installs sharing a row (python installs cc) broke
each other (cc: `dollyfile: execution failed: No such file or directory`; python: ENOENT at the
kernel's rename). `host/packages/kernel.c` now serves one process from its first request until it
ends (`holder`, cleared in `packages_release`); another process's request is deferred and retried
each scheduling turn, so amy commands run one after another and amy needs no change. A pipeline that
makes an amy command wait for output another amy has not written yet would wait for good; amy
commands do not do that. The review map's `packages@0` row says so.

Checked with the audit's cases, every status asserted (`fix-amy/cases-concurrent-fixed.json`), on
round1113's images with this kernel: the two backgrounded installs both end with 0 and both are
recorded; `amy list` and `amy server` run a second into `amy install python` wait, then list;
Chromium and Firefox (`fix-amy/conc-chromium.jsonl`, `conc-ff.jsonl`). `test/amy-browser.mjs`'s amy
session installs python and cc at once beside `amy list` (passes in Chromium, `rest-chromium.log`).
Close once merged.

## Found

`packages@0` serves one request at a time and refuses any other process while one is in progress
(`host/packages/kernel.c:72` and `:104-106`, `-EBUSY`). Every `amy` command asks the mailbox first
for the page's image directory (`find_server` → `channel_text(DOLLY_PACKAGES_KIND_DIRECTORY)`), so
a second `amy` while the first fetches a snapshot fails before doing anything:

```
$ amy install cc > /tmp/a.log 2>&1 & amy install python > /tmp/b.log 2>&1 & wait
cc: status 1      amy: the page's image directory: Resource busy
python: status 0  amy: python installed: 1556 files, 49384301 bytes, ...
```

`amy list` and `amy server` run a second into `amy install python` fail the same way
(`concurrent2.jsonl`); every amy command asks the mailbox first. Two shells install at once
wherever more than one program runs: an agent installing while the person types (pi-agent,
pi-local and dollyfile-studio hold amy and an agent), tmux panes, a script that backgrounds its
installs. The message names neither the other install nor what to do.

Evidence: `work/audit-1116-evidence/recipes/concurrent.jsonl` (case `concurrent`), `concurrent2.jsonl`.

## Do

Make a request that finds the mailbox busy wait its turn: the kernel defers it
(`DOLLY_PROCESS_DISPATCH_DEFERRED`, as it already defers a chunk not yet written) until the owner's
request completes, so concurrent amy commands run one after another; `amy` itself needs no change.

## Done when

The two backgrounded installs above both end with status 0, and `amy list` run while an install
is fetching waits and then lists.
