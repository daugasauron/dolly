# amy install tar gives a tar whose -z, -j and -J fail: the package does not install gzip, bzip2 or xz

- STATUS: OPEN
- PRIORITY: 250
- TAGS: audit,recipes,amy,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`): every package `amy` offers installed alone into a fresh `default` session.

## State (2026-11-17)

Fixed in source on `fix/amy` (`work/fix-amy`, commit `183b064ef`): `Dollyfile-tar` INSTALLs gzip,
bzip2 and xz, pins refreshed. glib's build USEs tar, so glib, gtk-build, mesa-build and the Godot and
Ghostty images rebuild with it. The core tar's hint ("amy install tar gives a tar with -z") is right
once it is built. By the audit's method on round1113's dist (`amy install tar gzip bzip2 xz` in a
fresh default session, then `-czf`, `-cjf`, `-cJf` and `-tzf`, `-tjf`, `-tJf`): passes in Chromium and
Firefox (`work/audit-1116-evidence/recipes/fix-amy/byhand-chromium.jsonl`, `byhand-ff.jsonl`, case
`tar-fixed`). Waits for the round to rebuild tar; `test/amy-browser.mjs`'s tar session, which installs
tar alone, then confirms it (it fails on today's image).

## Found

The core's `tar` refuses `-z` and tells the user what to do:

```
$ tar -czf in.tgz in
tar: -z is not supported here: gzip -dc in.tgz | tar -xf - (amy install gzip, where gzip is missing; amy install tar gives a tar with -z)
```

Following that advice in `default`, which holds no `gzip`, `bzip2` or `xz`:

```
$ amy install tar
$ tar -czf in.tgz in      ->  tar: posix_spawnp gzip: No such file or directory   (status 1)
$ tar -tzf in.tgz         ->  tar: posix_spawnp gzip: No such file or directory
$ tar -cjf in.tbz in      ->  tar: posix_spawnp bzip2: No such file or directory
$ tar -cJf in.txz in      ->  tar: posix_spawnp xz: No such file or directory
```

`demos/tools/README.md:34` describes the package as "sbase's `tar` ... `-z`, `-j` and `-J` run gzip,
bzip2 and xz", and `Dollyfile-tar` installs none of them. `Dollyfile-zip` installs `unzip` for the
same reason ("which `zip -T` starts", README:18). The release's `test/cases/amy-tools.json` tests
`tar -z` and `-j` only after `pigz`, `gzip` and `bzip2` were installed earlier in the same session
(`tasks/20261116-141504-recipes-03`). The three packages together are 1.6 MB.

With `amy install tar gzip bzip2 xz` the six commands succeed (`tar-fixed.jsonl`).

Evidence: `work/audit-1116-evidence/recipes/debug3.jsonl` (cases `tar-z`, `core-tar-z`).

## Do

`demos/tools/Dollyfile-tar`: `INSTALL` `Dollyfile-gzip`, `demos/tools/Dollyfile-bzip2` and
`demos/tools/Dollyfile-xz`, the programs it starts, as `Dollyfile-zip` installs `unzip`.

## Done when

In a fresh `default` session `amy install tar` alone, then `tar -czf`, `-cjf` and `-cJf` of a
directory and `-tzf`, `-tjf`, `-tJf` of the results succeed.
