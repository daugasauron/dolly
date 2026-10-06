# ls -l output misleads agents; help names a chmod that does not exist

- STATUS: OPEN
- PRIORITY: 250
- TAGS: userspace,agent

Dolly's `ls` (`Dollyfile-system-build`, `/tmp/core-tools/ls.c`) prints a long
listing as a type letter, size, ISO date and name, with no mode string, link
count, owner or `total` line:

```
d       4096 2026-10-06 00:20 .
d       4096 2026-10-06 00:20 ..
```

Agents are trained on POSIX/GNU `ls -l`. In task
`20261005-215204-pi-local-loop` Qwen3.5-2B read the first column as a file
named `d` and ran `ls -la /workspace/d/`, and Qwen3.5-0.8B and 2B re-ran
`ls -la /workspace/` because an empty directory listing did not look empty
(the owner's "keeps doing ls -la /workspace on repeat"). Dolly has no
permission bits, but POSIX's format can still be printed (a mode string from
the file type, `1`, one user and group name, size, date, name, and `total`).

`help` says "one user and no permission bits: chmod, chown and install -m
change nothing", yet no image ships `chmod` or `chown`: `chmod --help` and
`chmod +x hello.c` give `slop: chmod: command not found`, which the 4B and
2B models both reported as a missing tool. Either the text should say they
are absent, or the commands should exist and say what they do here.

## Done when

- `ls -l` output parses as POSIX's long format; a test covers an empty and a
  populated directory.
- `help` and the image agree about `chmod`/`chown`.
