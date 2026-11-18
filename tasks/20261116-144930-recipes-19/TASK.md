# Two amy commands at once: the second fails at once with "the page's image directory: Resource busy"

- STATUS: CLOSED
- PRIORITY: 160
- TAGS: audit,amy,packages,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`), looking for why "sometimes amy install doesn't work".

## State (2026-11-17)

Closed: confirmed on `ws/recipes`, below.

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

## Closed (2026-11-17)

Merged into `integrate/0.1.8` (02b7ba436, `fix/amy`). Confirmed on `ws/recipes` with the kernel
built from it (`npm run build:runtime`, runtime `8917011b…`, image inputs `87c27243…` unchanged):
`test/amy-browser.mjs`'s "amy" session, which installs python and cc at once beside `amy list`
and asserts every status, passed in Chromium (23.6 s) and Firefox (26.3 s), with "amy another
directory", "amy cc", "amy refusal" and "USE" (`work/audit-1116-evidence/recipes/ws-recipes/logs/a-amy.log`). Rebuilds: no image (the kernel;
the image inputs are unchanged).
