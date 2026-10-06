# Xonotic

Xonotic 0.8.6 (DarkPlaces engine), being ported to Dolly. State: the dedicated
server and gmqcc build inside Dolly and a bot match runs to its end headless;
no client, rendering or sound yet. The task is
`tasks/20261006-122433-xonotic/TASK.md`.

## Images

- `xonotic-build`: the dedicated server (`xonotic-dedicated`) and the QuakeC
  compiler (`gmqcc`), compiled from the pinned release source with `cc`, `c++`
  and Make on `system-tools`; the engine, gmqcc and `qcsrc` stay under
  `/usr/src/xonotic`.

Build with `npm run image -- xonotic-build`.

## How it works

- [`prepare-xonotic.sh`](prepare-xonotic.sh) takes the release's source zip
  (identical to the tags `xonotic-v0.8.6` of DarkPlaces, gmqcc and
  xonotic-data.pk3dir's `qcsrc`) and applies
  [`darkplaces-dolly.patch`](darkplaces-dolly.patch): the dedicated server
  listens on the in-process loopback, sleeps and polls the console without
  `select`, and loads no dynamic libraries (zlib is linked; JPEG, PNG, curl,
  ODE and d0_blind_id report themselves unavailable). Everything else is
  unchanged upstream; the engine sees `__dolly__`, never `__linux__`.
- Dolly's libc answers the engine's socket calls with failures, so the INET
  ports are reported unavailable; only the loopback address type carries
  packets.
- [`Makefile`](Makefile) builds DarkPlaces' `OBJ_SV` unit list (the `*_null.c`
  video, thread and sound units) at `-O1`, and gmqcc with `-std=c++11`.

## Data

The release's `data/*.pk3` archives (1.2 GB) are pinned but not yet staged as
image sources. The browser test fetches `xonotic-20230620-data.pk3` (318 MB)
and `xonotic-20230620-maps.pk3` (626 MB) through its fixture server into
`/home/dolly/xonotic/data`; that is the test's arrangement, not how the image
will ship its data. `bash demos/xonotic/prepare-xonotic-data.sh` extracts them
from the pinned zip into `.cache/xonotic/release/Xonotic/data`.

## Native baseline

`build/xonotic-native/` and `build/xonotic-evidence/` in a worktree hold a host
build of the same engine (gcc, SDL2 2.0.20) used for measurement only; it is
never a build input. Measurements are in the task.

## Bootstrap exceptions

- The game logic (`progs.dat`, `csprogs.dat`, `menu.dat`) comes compiled inside
  `xonotic-20230620-data.pk3`; gmqcc builds in Dolly, but rebuilding the
  `.dat` files there from `/usr/src/xonotic/qcsrc` is not yet done.

Test: `npm run test:demos -- xonotic` ([`test/`](test/)).
