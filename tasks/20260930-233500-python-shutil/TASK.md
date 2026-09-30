# Ship a Slop-compatible shutil with Python

- STATUS: OPEN
- PRIORITY: 150
- TAGS: python,demo,slop,compatibility

Owner request (2026-09-30): "for python, it should ship with a slop compatible
version of shutil."

Before changing anything, find which `shutil` behaviour breaks under Dolly's
Slop and single-user filesystem (for example `which`, `copymode`/`copystat`,
`chown`, `rmtree`, `disk_usage`, archive helpers, and anything reaching for
`/bin/sh` or process groups), reproduce each case in the `python` image, and
check how CPython is patched today (`demos/python/`).

Done when: the python image ships the Slop-compatible `shutil`, and each broken
case has a behaviour test in the Python demo's browser checks.
