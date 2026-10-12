# pip cannot install numpy any more: the build stops at ninja

- STATUS: OPEN
- PRIORITY: 310
- TAGS: bug,python,packages

Owner (2026-10-12): "Python can't install numpy anymore, fails on something
with ninja? I think ninja works already, why isn't it a package?"

## As filed

Not reproduced yet. `ninja` (samurai) is built in `Dollyfile-system-tools`
and exported there as a tool; no package holds it, so a session that got
Python from `amy install python` has no `ninja` for a Meson build.
[`package-needs`](../20261007-003116-package-needs/TASK.md) is the same
shape: a package that starts a program it does not install.

Done when: the failure is reproduced in a browser, its cause is named, numpy
installs again where the README says it does, and a test keeps it.
