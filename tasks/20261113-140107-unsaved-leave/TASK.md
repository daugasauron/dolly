# Reloading or closing a tab loses the changes since the last save without a word

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: sessions,ux,0.1.6

Found by `20261113-221000-session-audit` (user testing).

A saved session's tab is at `/session/?name=NAME`. A person works on, presses F5 (or closes the
tab, or follows "Reload to start again"), and the tab opens the last save: everything since is
gone, and nothing asked. The Save button says "Save · 10:41 PM" and its dialog says later changes
need another save; the page has no `beforeunload` prompt, and the kernel does not know whether a
file changed since the save. The same holds for two tabs on one session: a reload of the older
tab takes the other tab's save.

## Reproduce

Open `/system/`, `echo a > /workspace/a`, Ctrl+Shift+S, save as `work`. `echo b > /workspace/b`.
Press F5. `/workspace/b` is gone.

## Closed (2026-11-14)

Decided by the coordinator: the kernel counts. `src/process-kernel.c` counts every change a
process makes to what a save holds (a regular file's bytes, size or times; a file made, emptied,
removed or renamed; a directory, link or symlink made), `host/snapshot/kernel.c` clears the count
when a capture begins and publishes it at each service in the mailbox's new `changes` word
(`dolly-snapshot-0.wat`), and the Worker tells the page when it becomes or stops being zero. A tab
of the site whose session was saved or restored cancels `beforeunload` while the count is not
zero, or a failed save left such changes unsaved; the browser shows its own prompt. A tab never
saved and an embedding's page ask nothing.

What counts is what a save would hold: a line typed at the shell is a change (its history file),
and so is a command substitution (Slop's temporary file); a program that only reads, or writes
the terminal or `/dev/null`, is none.

Evidence: `test/session-unsaved-browser.mjs`, in Chromium and Firefox: no prompt in a tab never
saved; none after a save, nor after a script that only reads ran; the browser's `beforeunload`
dialog after `echo b > /workspace/b`, which keeps the tab when dismissed; none after the next
save, and the tab closes; a restored tab is quiet until `rm`.
