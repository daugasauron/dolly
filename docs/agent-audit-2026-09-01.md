# Pi agent workload audit, 2026-09-01

This audit ran upstream Pi in a fresh default Dolly browser sandbox against
`deepseek/deepseek-v4-flash-0731` through OpenRouter. The credential was copied
only into the ephemeral in-Wasm filesystem and was not written to source,
snapshots, or this report. The browser used Dolly's normal HTTP mailbox and
`env.dolly_http_dispatch`; no host shell, host filesystem, socket, or second
network path participated.

## Result

The final corrected end-to-end task completed in about 51 seconds over twelve model
requests. Pi created `/workspace/smoke`, wrote a C program and Makefile, built
and ran it, initialized and committed a Git repository, exercised the requested
utilities, wrote failure and audit reports, and exited normally. Independent
recovery-shell probes then verified the workspace, clean Git status,
`make clean all`, executable output, and both reports. The structured local
development artifact is `build/pi-agent-audit.json`.

The first run used an ambiguous destination phrase while the harness probed a
specific path. The agent correctly created a different directory; changing the
task to state `/workspace/smoke` made the workload and acceptance test agree.
That was an audit-specification error, not a runtime failure.

A later run similarly built `main` with a default Make target while hidden
probes expected an `all` target and a binary named `smoke`. The final prompt
states both requirements. This distinction matters: an agent benchmark should
not turn unstated harness preferences into alleged userspace failures.

## Compatibility findings

The workload exposed a few small conventional command assumptions:

- `which`, `cut`, `true`, and `false` were missing, so Dolly now compiles a
  separate Dolly-owned `/bin/which` and unchanged pinned sbase implementations
  of the other commands.
- A follow-up model report needed byte-level output inspection, so pinned sbase
  `/bin/od` is included as well.
- `test -x` was missing. Dolly has no permission model, so `-x` now means that
  the path is a regular file; command loading still performs exact Wasm and ABI
  validation. This does not introduce `chmod` or Unix permission fiction.
- One generated Makefile used `printf '%s' '\t...'`, expecting `%s` to expand
  the tab. POSIX `printf` does not do that. Dolly keeps the correct behavior and
  Pi's system guidance tells the agent to use its write tool for multiline
  source and Makefiles.
- Negated `test ! -e` already worked. The model's report was inaccurate, which
  is why every claimed gap is checked independently before changing Dolly.
- The final agent first tried a Bash here-document despite its system guidance,
  then recovered with the write tool. Slop still does not implement heredocs,
  but now recognizes `<<` and reports the exact unsupported feature plus the
  supported file-redirection alternative.

No finding required a browser capability, new network import,
multiprocessing, permission system, or host fallback. `if`/loop syntax remains
a documented Slop gap and should be implemented only when another concrete
source build makes its exact value clear.

## Related day work

The same session repaired Bonnie's PyPI path and expanded it to recursively
resolve and verify pure-Python wheels. A live browser test installs
`requests[socks]`, including its marker-selected PySocks extra and portable
dependency closure, and rejects contradictory constraints. CPython now has an
import-compatible `_socket` extension whose raw operations terminate at typed
in-Wasm `ENOSYS` stubs. It reports `sys.platform == "dolly"`, so current urllib3
does not mistake the runtime for Pyodide and request an ambient `js` module;
Requests imports without adding a browser capability. NumPy and Pandas
correctly fail as native-wheel ports rather than pretending to install.

A later package-focused browser pass strengthened this path: Bonnie resolves
and verifies the whole chosen graph before touching a fresh target, merges
extras from repeated requirements, installs and runs Pytest, and compiles its
`console_scripts` entry as a separate wasm64 `/usr/bin/pytest` command. Full
Pytest execution initially passed with only its `faulthandler` plugin disabled.
The follow-up source probe enabled upstream `faulthandler`: enable/disable and
synchronous traceback dumps work, while its core-dump suppression was removed
because Dolly has no OS resource limits. Pytest now runs with its normal
built-in plugin set; delayed watchdog dumps still fail explicitly because the
version-0 runtime does not create threads.

The gamedev path gained an animation-frame sequence, closed cursor enum,
bounded logical framebuffer sizing, and a raylib adapter with no intermediate
screen image. The browser boundary did not gain an import. At 800×450 the demo
measured about 48 frames per second on the audit machine, up from about 21 at
the full viewport resolution, and the terminal resumed normally after both
exit and Ctrl-C.
