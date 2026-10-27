# Git is built with threads, so a push to a local repository works

- STATUS: OPEN
- PRIORITY: 300
- TAGS: git,bug,0.1.4

Owner (2026-10-28, after "wait why doesn't git work?"): "Yes. Build git with threads."

## Reproduction (2026-10-28, `system` image of the round on `7857c9ad`, Chromium)

```
git init -q --bare ../origin.git
git push ../origin.git HEAD:refs/heads/main
error: fork (async) failed: Function not implemented
error: fork (async) failed: Function not implemented
 ! [remote rejected] HEAD -> main (missing necessary objects)
```

Git runs some work as an "async", a function beside the main one behind a pipe: the side
band's demultiplexer and `receive-pack`'s relay of its children's messages. Upstream runs it
in a thread, or in a `fork`ed child where Git is built without threads. `Dollyfile-git` has
passed `-DNO_PTHREADS` since the first prototype (2026-08-29), before `threads@0`, and Dolly
has no `fork`. `config/git-dolly.patch` replaced the two client halves' asyncs (`fetch-pack`,
`send-pack`) with a spool file, so clone, fetch and push over HTTP work (`test/network-browser.mjs`
pushes twice to `git http-backend`). A local push also runs `receive-pack` in Dolly: its async
fails, and `unpack_with_sideband` then returns as if the pack were unpacked.

Not true, and to correct: `9223689e` wrote in `docs/http.md` and the skill that push fails over
HTTP too.

## Done-when

- Git is built with `-pthread` and declares `threads@0`; the `fetch-pack` and `send-pack` parts
  of `config/git-dolly.patch` are gone, since upstream's asyncs run as threads.
- A push to a local repository works, in the recipe's check and in the shell test, in Chromium
  and Firefox; HTTP clone, fetch and push still pass (`test/network-browser.mjs`).
- The docs and Pi's guidance say what works.
