# Reject NUL bytes consistently before executing Dollyfiles

- STATUS: CLOSED
- PRIORITY: 100
- TAGS: audit,bug,build

## Evidence

A recipe containing a NUL byte is rejected by the JavaScript editor but accepted
by the C executor. The executor truncates affected physical lines and retained
source strings while hashing the complete input. A native reproduction also
applied an ENV declaration from such a recipe. A deterministic comparison of
10,628 recipe variants found this mismatch; the other cases agreed.

## Result

One check in `fetch_recipe` rejects NUL bytes before processing any declaration,
for both file and HTTP input. Native regressions cover directive, comment and
inline-file-body positions and verify that earlier ENV declarations do not run.
The regression failed before the fix. All 10,628 comparison cases agree after
the fix, with no AddressSanitizer/UndefinedBehaviorSanitizer findings.

Chrome and Firefox compiled the actual changed C executor inside Dolly and
passed the complete parser fixture set in 8.14 s and 7.13 s. The new browser case
places a file-writing command before the invalid byte and verifies that it never
runs. All 286 source checks pass in 3.70 s.

The previously sealed release at source `96f86c6` does not contain this final
source change. Rebuilding the compiler seed and selected images is required to
include it in a subsequent distribution; that rebuild was not started after the
overnight deadline. Browser verification compiled the changed source directly.
Logs: `/tmp/dolly-core-parser-nul-{red,green,browser,source}.log`.
