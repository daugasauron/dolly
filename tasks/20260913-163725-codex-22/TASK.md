# Avoid relinking unchanged compiler tools on every runtime build

- STATUS: CLOSED
- PRIORITY: 350
- TAGS: audit,build,core

## Evidence

Both unchanged official runtime builds relinked `dolly-process-compiler` and
`dolly-process-zig`, taking 101.96 s and 96.98 s overall. The process archive
publisher preserves its timestamp when bytes match, but `build.sh` recompiles
`process-crt1.o` directly into its final path on every run. Both compiler targets
list that object as a link input. The linkers' individual time share has not yet
been measured.

## Done when

- Preserve an unchanged startup object's timestamp through owned atomic staging.
- Confirm that unchanged compiler targets stop relinking and measure the complete runtime build.
- Confirm that changed startup bytes still schedule both tool links and change the sysroot identity.
- Preserve image compatibility and verify the resulting runtime in a browser.

## Resolution

Compile startup code into an owned temporary directory and replace the published
object only when its bytes change. The next official runtime build took 28.40 s
(previous runs 101.96 s and 96.98 s), with neither compiler tool relinked. The
startup timestamp and both compiler hashes stayed unchanged. This run also
compiled an actual kernel session-decoder refactor: the runtime hash changed,
the image identity stayed unchanged, and all 18 selected images were reused.
The core gate passed Chrome (22.3 s) and Firefox (28.5 s); the normal session
save/export/import/restore and failure cases passed in Chrome.

A real CMake dry run scheduled no compiler links with unchanged inputs, then
scheduled both links after adding a valid custom section to the startup object.
The original object's exact bytes and timestamp were restored afterward. This
checks dependency scheduling, without relinking or deploying the altered object.
The separate sysroot regression proves changed startup bytes select a new key.
