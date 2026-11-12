# amy's package service off the broker, http@0 switchable

- STATUS: OPEN
- PRIORITY: 340
- TAGS: host-modules,audit,amy,http

From the module audit (`tasks/20261104-135806-module-audit`, R5, section 4 item 3).

## State (2026-11-12)

Decided: do it. Owner (2026-11-04): "the only place I expect to see @http is on the pi-agent
images"; the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, A5) ranks it above cleanup:
`http@0` is on 78 of 217 recipes and 18 of 26 applications. With it, the audit's S2: since
`0df7aa0b1` the service asks the policy about a foreign directory's URL once, then fetches its
catalog, metadata and packs unjudged and keeps the packs in the origin's store, so
`docs/browser-boundary.md:247` and `src/pack-store.mjs:8-9` ("nothing of the guest reaches it") are
no longer true. Over its own channel: a foreign directory's packs are not kept, each URL fetched is
admitted, the two JSON files are fetched with a byte bound, and the two sentences are corrected.

`packages@0` rides the HTTP broker as a reserved origin (`https://packages.dolly.invalid`,
b60b426a2; `host/packages/module.json` depends on `http@0`), so `amy` needs `http@0`, and so does
every image that installs it (`default`, `tmux-panes`, `ghostty-x11`, `x11-desktop`, the agents).
`http@0` is fixed: "the page's HTTP policy is consumed once, at load" (`host/http/module.json`), so
`nena` cannot give it to a session later.

- `packages@0` hands the verified snapshot over its own channel, as `upload@0` hands a file: one
  dispatch import, a client, `amy.c`'s `fetch` replaced; a row in `docs/browser-boundary.md`.
- The index (`amy-index.txt`) comes over the same channel.
- Then `default` either drops `curl`, or `http@0` stops being fixed so `amy install curl` can be
  followed by `nena enable http` (`host/http/http.mjs` keeps the policy from load; the transport
  could start on enable).

Cost: a module contract, the client in the seed, amy, `default` and the images with amy; a round.

Design (2026-11-12), for the next full round (amy and the client are in the seed):
- packages@0 gets a mailbox of its own, as upload@0 has: amy's one operation names a kind
  (the page's directory, a directory's `amy-index.txt`, a package snapshot by directory and
  recipe pin) and a destination file; the page streams the bytes into it a chunk at a time, the
  kernel writes and renames. No dispatch import; the host side is a Worker (`worker.mjs`).
- A foreign directory (`amy server URL`, Donna's request) is judged by the page's HTTP policy.
  That policy is boot()'s configuration, today held by http@0's page side: it becomes a page
  resource every provider receives (as `mount` and `showStatus` are), so packages@0 judges a URL
  without depending on http@0. Its packs are not kept in the origin's store; the catalog and the
  metadata are read with a byte bound.
- Then `default` drops `curl` and `http@0` (owner, 2026-11-04: http only where an agent fetches),
  and `http@0` stops being fixed: its page side keeps the policy from load and starts its
  transport when enabled, so `amy install curl` and `nena enable http` give a session curl.

## State (2026-11-12, evening): the channel for the page's own directory

On `fix/packages-channel` (from main): packages@0 has a mailbox of its own,
`host/packages/dolly-packages-0.wat` (process operation 134), as upload@0 has. amy's one
operation, `dolly_packages_fetch(kind, directory, pin, destination)` (`client.c`), names the page's
directory, a directory's `amy-index.txt` or a package snapshot by directory and pin, and a
destination that must not exist; the kernel (`kernel.c`) writes each chunk into a temporary file
and renames it at the end; the runtime Worker (`transport.mjs`) answers from the page's own
directory, the snapshot from `worker.mjs` as before, 64 per page, and refuses another directory
(`EACCES`). amy (`src/commands/amy.c`) uses it for the page's own directory and keeps HTTP for
`amy server URL`. The header and client are in the seed (amy is a core source), so the seed and
every image's inputs change: checked on default and its closure built on that seed in the root,
with less and jq: `amy server`, `list`, `info`, `install less` and `files` in Chromium and Firefox,
with no request through http@0's broker (`work/packages-check.mjs`); the source suite passes.
On merging into the round: `dolly_kernel_change_waits(descriptor)` before the chunk write, as
upload's has there (main lacks it).
Left: the page's HTTP policy as a page resource, so a foreign directory comes over the channel
too, judged by it, with its packs not kept; then `amy` declares `packages@0` alone, `default`
drops `curl` and `http@0`, and `http@0` stops being fixed; amy-browser in both browsers on a full
round.

## Done when

- The owner has decided whether `default` keeps `http@0`. If not: `amy` declares `packages@0`
  alone, `amy install` works in an image without `http@0` in Chromium and Firefox
  (`test/amy-browser.mjs`), and `http@0` appears only on images with a program that fetches.
