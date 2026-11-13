# Session cases the audit could not drive: a hidden tab's save, Firefox's storage prompt

- STATUS: OPEN
- PRIORITY: 120
- TAGS: sessions,audit,0.1.6

Left by `20261113-221000-session-audit`.

## State (2026-11-13)

Filed; nothing done. Each needs a person at a real browser window.

- A save while its tab is hidden. Playwright keeps a headed page `visible` when another tab is
  brought to the front, so the audit's background save (600 MB, 12 s in Chrome, 17 s in Firefox)
  ran unthrottled. By reading, the save needs no page timer: the Worker waits with
  `Atomics.waitAsync` and its own `setTimeout`, the page answers messages. A tab Chrome freezes or
  discards is another matter: the kernel ends a save whose chunk is not taken in 30 s
  (`host/snapshot/kernel.c`), and a discarded tab loses what was not saved.
- Firefox's prompt for `navigator.storage.persist()`, which every save calls
  (`host/snapshot/ui.mjs`): whether it shows at each save until answered, and what "Not now"
  leaves. Playwright's Firefox answers `persisted() === false` without a visible prompt.
- A private window: saves, restores and keeps the runtime in both browsers (measured), and all
  of it goes with the window, as the browser means it to. The page says "Saved NAME locally" as
  anywhere else; a page cannot tell that it is in a private window.

## Done when

Each is tried by hand in Chrome and Firefox and either works as described or has its own task.
