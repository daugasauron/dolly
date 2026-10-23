# tar's message for a file that is not a tar archive says <header> and errno 29

- STATUS: OPEN
- PRIORITY: 110
- TAGS: core,commands,agent-experience,0.1.4

No description.

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
