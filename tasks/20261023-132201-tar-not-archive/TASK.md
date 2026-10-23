# tar's message for a file that is not a tar archive says <header> and errno 29

- STATUS: CLOSED
- PRIORITY: 110
- TAGS: core,commands,agent-experience,0.1.4

## Closed (2026-10-24, `core/terminal`, `9486fbb0`)

Nothing in Dolly returned ESPIPE: "errno 29" is EIO in Dolly's numbering (the Emscripten
one, `src/process-constants.mjs`: EIO 29, ESPIPE 70; Linux's ESPIPE is 29). `read_exact` in
Dolly's own `src/commands/tar.c` sets EIO when the file ends inside a block, and the second
line was `main` printing `strerror` of the same errno. No upstream is involved; the
message is fixed there.

- `extract` prints its one message: `tar: junk.tar: not a tar archive` when the first
  block is short or no header; `tar: x.tgz: gzip data, not a tar archive: gzip -dc x.tgz |
  tar -xf - (amy install gzip, where gzip is missing)` when it starts 1f 8b; otherwise
  `tar: FILE: STAGE MEMBER: strerror`, without the `<header>` placeholder.
- `-z`: the core `tar` does not take it; it extracts plain archives only (`tar -xf ARCHIVE
  [-C DIRECTORY]`). `default` has no gzip: `amy install gzip`, then `gzip -dc FILE | tar
  -xf -`. `amy install tar` replaces it with sbase's tar, whose `-z` starts gzip by
  `posix_spawn` (`b647d46f`); `demos/tools/README.md` still said that `-z` fails for want of
  `fork`, and no longer does.
- `test/core-browser.mjs` checks a text file, a 3-byte and a longer gzip file against the
  exact messages; it passes in Chromium and Firefox. The same step against the old `tar.c`,
  compiled in `system`, fails in both: `tar: read header at <header> (errno 29)` and
  `tar: junk.tar: I/O error` for the text and the 3-byte file, `tar: parse header at <header>
  (errno 28)` and `tar: long.tgz: Invalid argument` for the longer one.

Found by Opus 5.5 in Pi (`tasks/20261023-180000-opus-in-pi`, round 3, `r3-shell/`): it ran
the core `tar -xf` on a `.tar.gz` that `git archive` wrote and read

```
tar: read header at <header> (errno 29)
tar: x.tar.gz: I/O error
```

Reproduction, in `default` (`build/opus-evidence/r3/probe-tar.out` on the opus branch):

```sh
printf 'not an archive at all\n' > /tmp/junk.tar && tar -xf /tmp/junk.tar -C /tmp; echo $?   # the two lines above, status 1
```

Cause: `src/commands/tar.c`'s `extract` reports a short first block as EIO from "read header"
with the placeholder member name `<header>`; a gzip file shorter than 512 bytes takes the same
path, a longer one fails the header's checksum. Expected: "tar: FILE: not a tar archive", and
for gzip data (1f 8b) the way that works here, `gzip -dc FILE | tar -xf -`. It is the seed;
not fixed on the opus branch, by the brief.

Done when: both messages say what the file is, with cases that fail on the old tar.
