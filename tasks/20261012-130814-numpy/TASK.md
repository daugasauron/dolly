# pip cannot install numpy any more: the build stops at ninja

- STATUS: CLOSED
- PRIORITY: 310
- TAGS: bug,python,packages

Owner (2026-10-12): "Python can't install numpy anymore, fails on something
with ninja? I think ninja works already, why isn't it a package?"

## Reproduced (2026-10-12, Chromium, `core/packages` at main `caf7ed97`)

pip from the pinned wheelhouse of `demos/python/test/python-browser.mjs`
(`pip install --no-index --find-links …/fixture/wheels/ numpy`), scratch
script and logs in `build/packages-evidence/numpy-*.log`:

| Session | Result |
| --- | --- |
| `system` with `INSTALL python` (what the demo's test opens) | NumPy 2.5.2 builds and imports, 185 s |
| `default`, `amy install python` | fails after 6 s: `Installing backend dependencies … ERROR: No matching distribution found for ninja>=1.8.2` |
| `default`, `amy install python cc` | the same failure |
| `default`, `amy install python ninja` | `../meson.build:1:0: ERROR: Unknown compiler(s): [['cc'], ['gcc'], …]` |
| `default`, `amy install python cc ninja` | builds and imports, 154 s |

## Cause

NumPy builds with meson-python. When no `ninja` is on `PATH`, meson-python
adds `ninja>=1.8.2` to the build's requirements, and pip looks for it in the
index: from the wheelhouse that is "no matching distribution", from PyPI it is
the `ninja` sdist, which builds Ninja itself with CMake. That is the "something
with ninja".

It worked while `default` was `FROM system`, with the compiler, Make and
Samurai (`/usr/bin/ninja`) on board. `9d9064b3` (2026-10-06, "Make default
small") made `default` a composition of `core`, `posix`, `display`, `curl` and
`amy`. The `cc` package brought the compiler back for those who install it;
nothing held `ninja`, which only `system-tools` built. The test did not see
it: its NumPy build was opt-in (`DOLLY_PYTHON_PACKAGES=1`) and ran in `system`
with `INSTALL python`, where both programs are.

## Fixed

- `ninja` is a package (`Dollyfile-ninja`: Samurai's 133 KB, its manual page
  and licence, kept from `system-tools`; the image builds in 5 s and changes
  no other). Both sites publish it.
- `demos/python/README.md` and the package's description (`amy list`, the
  start page) say what pip needs: `amy install python cc ninja`.
- `demos/python/test/python-browser.mjs` gains "python on default": a
  `default` session, `amy install python cc ninja`, `pip install numpy` from
  the pinned sdist, `import numpy`. It runs always and in both browsers; the
  NumPy build had been opt-in (`DOLLY_PYTHON_PACKAGES=1`, which now adds only
  Pandas) and ran where both programs were.

## Verified (2026-10-12, this tree, load average 20 to 27 from another build)

- `npm run test:demos -- python`: `python` (the `system` session) 26.2 s,
  `python on default` Chromium 334.9 s, Firefox 502.6 s; all pass
  (`build/packages-evidence/test-python-1.log`).
- `node test/amy-browser.mjs`: `amy install ninja` on `default`, where the
  command was absent, then a build file runs; Chromium and Firefox.
- Source suite: 424 pass.

Left, in [packages](../20261012-130814-packages/TASK.md), held for a catalog
round: the `python` package installs `cc` and `ninja` itself, so that
`amy install python` is enough. `rust-llvm`, `llvm-tablegen` and
`zero-ad-spidermonkey` install `python` as a build tool, so its pin cascades
through the Rust, LLVM and 0 A.D. chains.
