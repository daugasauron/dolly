# Reloading or closing a tab loses the changes since the last save without a word

- STATUS: OPEN
- PRIORITY: 200
- TAGS: sessions,ux,owner,0.1.6

Found by `20261113-221000-session-audit` (user testing).

## State (2026-11-13)

Filed; a decision for the owner. Nothing done.

A saved session's tab is at `/session/?name=NAME`. A person works on, presses F5 (or closes the
tab, or follows "Reload to start again"), and the tab opens the last save: everything since is
gone, and nothing asked. The Save button says "Save · 10:41 PM" and its dialog says later changes
need another save; the page has no `beforeunload` prompt, and the kernel does not know whether a
file changed since the save. The same holds for two tabs on one session: a reload of the older
tab takes the other tab's save.

## Reproduce

Open `/system/`, `echo a > /workspace/a`, Ctrl+Shift+S, save as `work`. `echo b > /workspace/b`.
Press F5. `/workspace/b` is gone.

## Options

1. A `beforeunload` prompt once the session has been saved or restored and a program has run
   since (the page sees input, not file changes): the browser's own "Leave site?" dialog. It asks
   also when nothing changed.
2. The kernel counts changes to files since the last capture (one counter beside
   `dolly_kernel_hold_calls`) and the page asks only when it is not zero.
3. Leave it and say it where it is seen: the Save button shows the changes are unsaved
   ("Save · unsaved changes") from the first key after a save.

## Done when

The owner has chosen and the steps above either ask or show that `b` is unsaved.
