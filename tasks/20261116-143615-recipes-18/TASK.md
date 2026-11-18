# In tmux-panes, pi-phone and closed-source-agent amy refuses a third of the packages, telling the session to add REQUIRES HOST

- STATUS: CLOSED
- PRIORITY: 90
- TAGS: audit,amy,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`).

## State (2026-11-17)

Fixed on `ws/seed` (`7079a2d21`; the engine is in the seed: every image rebuilds). In a live
install the engine knows it is a session (`Engine.live`, `install_live`); without `nena@0` the
refusal names the modules, says the image does not declare them and cannot enable them, and names
`default`; a build still says `add REQUIRES HOST M`, and a session with `nena@0` `nena enable M`.
The same engine answers in `pi-phone` and `closed-source-agent`.

## Found

Three applications install `amy` but do not declare `nena@0`: `tmux-panes`, `pi-phone` and
`closed-source-agent`. There `amy` cannot have modules enabled, and the engine refuses every
package that needs a module the image does not declare (`docs/dollyfile.md`: "a package whose host
modules the booted image does not declare is refused by name"). For tmux-panes this is the
intent (`demos/tmux/README.md:15-19`: "The image declares no `nena@0`, so a package that needs
another module, such as `nvim`'s `dso@0`, is refused there"). Counted from
`dist/dolly-images.json` (a package's own `REQUIRES HOST` against the image's):

| Image | Packages refused, of 169 | For example |
| --- | --- | --- |
| tmux-panes | 62 | python, rust, cargo, codex, ffmpeg, fd, ripgrep |
| closed-source-agent | 54 | python, cargo, codex, glib, ghostty-gtk |
| pi-phone | 48 | python, cargo, codex, glib, ghostty-gtk |

The refusal is the build's message: without `nena@0` the engine prints
`dollyfile: LOCATOR needs M: add REQUIRES HOST M` (`programs/dollyfile.c:1031`), which tells a
session to edit a recipe it does not have; with `nena@0` it names the command instead (`:1030`).
The release's own test asserts that text in a session of `system`, which has no `nena@0`
(`test/amy-browser.mjs:371-375`: `Dollyfile-connects needs sockets@0: add REQUIRES HOST sockets@0`).
`amy list` shows the refused packages like any other.

## Do

The refusal stays; its words change. In a live install without `nena@0` (the engine knows:
`host_declared(engine, "nena@0")`, `:2116`), say that this image does not declare M and cannot
enable it, and name an image that can (`default`).

## Done when

`amy install python` in `tmux-panes` is refused with that message, and `amy-browser`'s refusal
case checks it.

## Closed (2026-11-17)

On the rebuilt seed (image inputs `58c25885…`), `amy install python` typed into a pane of
`tmux-panes` is refused, nothing installed, Chromium and Firefox
(`work/audit-1116-evidence/core/fix-seed/tmux-refusal-chromium.log`, `-firefox.log`):

```
dollyfile: /v0.1.7/demos/python/Dollyfile-python needs dso@0 and threads@0, which this image does
not declare and, without nena@0, cannot enable: install it in an image with nena@0, such as default
amy: python: not installed
```

`amy-browser`'s `amy refusal` case (`system`) checks that the refusal names the modules and
`default`, Chromium and Firefox (`amy-subset-1.log`).
