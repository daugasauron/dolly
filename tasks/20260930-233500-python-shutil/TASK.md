# Ship a Slop-compatible shutil with Python

- STATUS: CLOSED
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

## Closed (2026-10-02)

Fixed on `fix/python-fixes` (unchanged upstream `shutil`; `chown` and `disk_usage` fixed in the port configuration and kernel) and merged.

Verified on the integration branch `work/dollyfile-v6` (`0d54a87`), release
`fcb204c0…`: 51 images rebuilt from scratch (image inputs `9f7a44a7…`),
artifacts 20/20, source 334/334, every browser suite in Chrome and Firefox,
image-inventory acceptance for every application and toolchain, and the demo
tests for python, javascript, emacs (Chrome and Firefox), pi, neovim, rust,
cmake, sdl2, studio, codex, bhop, classicube and rts in Chrome.
