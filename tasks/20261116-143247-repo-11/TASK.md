# The showcase's videos are 88% of the repository's history, and each recording made again stays in it

- STATUS: CLOSED
- PRIORITY: 70
- TAGS: audit,repo,recording,0.1.8

## State (2026-11-16): measured, waits for the owner

The owner put the videos in git on 2026-11-12 ("Just add all the videos to git ?",
`tasks/20261112-081500-demo-videos`). This task records what that costs now. Whether to change it
is the owner's call.

## Measured (2026-11-16)

`git rev-list --objects` with `git cat-file --batch-check='%(objectsize:disk)'`:

| | Objects | On disk |
| --- | --- | --- |
| `origin/main`'s history, everything | 86,667 | 845 MB |
| `origin/main`'s history, `sites/slopshare.dev/agents/videos/` and `posters/` | 114 blobs | 745 MB (88%) |
| Those directories at `HEAD` | 89 files | 597 MB |
| Every local ref, those directories | 126 blobs | 894 MB |

GitHub reports the repository at 807,211 KB. 25 of the 114 blobs in `origin/main` are no longer at
`HEAD`: replaced or removed, about 148 MB. Videos went in on 2026-10-11 (2) and 2026-11-12 (37), and then 18
additions or replacements came between 2026-11-13 and 2026-11-15. Among them was 0.1.7's showcase,
recorded again on the published site (`ad0ee49bf`, `c69669274`, `ab631b836`).
A clone fetches all of it, and every recording made again adds its full size for good. The mp4
and jpg files do not compress.

## Do

One of these two, the owner's:
- Keep the videos in git. Then a recording that replaces one is made once per release at most,
  and this task closes on that rule written in `docs/deployment.md`.
- Keep them out of git. The showcase's media are files of the release, from a directory beside the
  archive or a GitHub release asset, named in `sites/slopshare.dev/agents/` by their SHA-256, as a
  recipe names a source. `package-domain.mjs` copies them in when it packages and checks each
  digest. History keeps what is there today.

## Done when

The owner has chosen. With the second, a re-recorded video adds no bytes to git.

## Closed (2026-11-17): the owner's decision

The owner (2026-11-17): the showcase's videos in git history are "Not ideal but fine for now". The
videos stay in git as they are; nothing is changed.
