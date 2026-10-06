# Xonotic

Xonotic 0.8.6 (DarkPlaces engine), being ported to Dolly. State: the dedicated
server and gmqcc build inside Dolly, a bot match runs to its end headless, and
gmqcc rebuilds the game logic there; no client, rendering or sound yet. The
task is `tasks/20261006-122433-xonotic/TASK.md`.

## Images

- `xonotic-build`: the dedicated server (`xonotic-dedicated`) and the QuakeC
  compiler (`gmqcc`), compiled from the pinned release source with `cc`, `c++`
  and Make on `system-tools`; the engine, gmqcc and `qcsrc` stay under
  `/usr/src/xonotic`, and `make -f /usr/src/dolly/xonotic/Makefile qc`
  compiles `progs.dat`, `csprogs.dat` and `menu.dat` into `/tmp/xonotic/build/qc`.

Build with `npm run image -- xonotic-build`.

## How it works

- [`prepare-xonotic.sh`](prepare-xonotic.sh) takes the release's source zip
  (identical to the tags `xonotic-v0.8.6` of DarkPlaces, gmqcc and
  xonotic-data.pk3dir's `qcsrc`) and applies
  [`darkplaces-dolly.patch`](darkplaces-dolly.patch), six hunks under
  `__dolly__`: the dedicated server listens on the in-process loopback, sleeps
  and polls the console without `select`, loads no dynamic libraries (zlib is
  linked; JPEG, PNG, curl, ODE and d0_blind_id report themselves
  unavailable), keeps its session lock an ordinary file (Dolly has no file
  locks yet) and reads large plain files whole (Dolly's `read` returns at
  most 1 MiB per call until `core/full-read` lands; that hunk goes with it).
  Everything else is unchanged upstream; the engine sees `__dolly__`, never
  `__linux__`.
- Dolly's libc answers the engine's socket calls with failures, so the INET
  ports are reported unavailable; only the loopback address type carries
  packets.
- [`Makefile`](Makefile) builds DarkPlaces' `OBJ_SV` unit list (the `*_null.c`
  video, thread and sound units) at `-O1` with 64 MiB of initial memory for
  the engine's static data, gmqcc with `-std=c++11`, and the QuakeC programs
  the way `qcsrc/Makefile` and `tools/qcc.sh` do: `cc -xc -E`, the line
  markers turned into gmqcc pragmas, then gmqcc. The results differ from the
  release's `.dat` files only in `__LINE__`-derived strings, because clang
  places line markers where the release's gcc emitted blank lines.

## Data

The release's `data/*.pk3` archives (1.2 GB) are pinned but not yet staged as
image sources. The browser test fetches `xonotic-20230620-data.pk3` (318 MB)
and `xonotic-20230620-maps.pk3` (626 MB) through its fixture server into
`/home/dolly/xonotic/data`; that is the test's arrangement, not how the image
will ship its data. `bash demos/xonotic/prepare-xonotic-data.sh` extracts them
from the pinned zip into `.cache/xonotic/release/Xonotic/data`. The compiled
`progs.dat`, `csprogs.dat` and `menu.dat` inside `data.pk3` are the release's;
the test runs its second match on the `progs.dat` built in Dolly.

## Native baseline

`build/xonotic-native/` and `build/xonotic-evidence/` in a worktree hold a host
build of the same engine (gcc, SDL2 2.0.20) used for measurement only; it is
never a build input. Measurements are in the task.

Test: `npm run test:demos -- xonotic` ([`test/`](test/)); `DOLLY_BROWSER=firefox`
runs it in Firefox.
