# Move the terminal to libghostty-vt 1.0.0

- STATUS: CLOSED
- PRIORITY: 120
- TAGS: display,terminal,upgrade

Owner (2026-11-07), on libghostty's first release: "I'm just interested in if it would be an
upgrade to the system and add value to use that", then "Just record a detailed task in tatr for
this for now". Not scheduled for a version.

## Today

- Pin: Ghostty v1.4.0, `DOLLY_GHOSTTY_COMMIT=83fb95624` (2026-10-27, "Bump version to 1.4.0",
  `config/source-pins.sh:45`), checked out by `scripts/prepare-ghostty-source.sh` with the file list
  `config/ghostty-source-manifest.txt`, and its own pins of Wuffs, translate-c and uucode
  (`config/source-pins.sh:47-57`).
- Build: `Dollyfile-ghostty-build` has Zig 0.17.0 emit Ghostty's VT library and compiler_rt as C,
  which Dolly's `cc` compiles into `/usr/lib/libghostty-vt.a` beside `libdisplay.so`; it ships in
  `dist/static/default/ghostty.tar`, so the terminal of every image holds it.
- Binding: `src/ghostty/display.c` calls the C API 91 times (`ghostty_grid_ref_*`, `ghostty_cell_get`,
  `ghostty_key_encoder_*`, `ghostty_key_event_*`, `ghostty_color_palette_default`, ...).
- Patch: `config/ghostty-dolly.patch`, 82 lines in four files, for a wasm build linked with libc,
  which upstream does not have: `src/lib_vt.zig` exports its wasm allocator functions only without
  libc; `src/os/wasm.zig` and `src/terminal/PageList.zig` use libc's allocator (no page pool, pages
  zeroed, since malloc does not return zeroed memory); `src/terminal/kitty/graphics_image.zig`
  refuses the shared-memory medium on emscripten.
- The GTK application (`demos/ghostty-gtk`, `prepare-ghostty.sh`) builds Ghostty's signed 1.4.0
  release tarball, `DOLLY_GHOSTTY_RELEASE_URL` (`config/source-pins.sh:506-511`), whose comment
  ties it to `DOLLY_GHOSTTY_COMMIT`.

## Upstream (read 2026-11-07)

- Tag `vt-1.0.0` names `0fa3d577a` (2026-11-06 22:28 UTC, "libghostty-vt: prepare for 1.0.0
  (#15126)"): the library's first release on its own version line; the application's newest
  release is still v1.4.0. As of 2026-11-07 the tag has no GitHub release entry.
- It is 266 commits ahead of v1.4.0 and none behind (300 files changed, 36 of them in
  `include/ghostty/`). Both need Zig 0.17.0 (`minimum_zig_version`), Dolly's pin.
- #15126 changes only version metadata ("This doesn't change the C API. The ABI goldens are
  untouched."); the C API changes are in the commits before it.

## What it would give

- A stable C API: versioned ELF exports and `GHOSTTY_DEPRECATED` (#15091), ABI checked in CI
  with abidiff (#15096), CI failing on ABI changes that are not additions (#15098). After one
  port, a later 1.x would be a re-pin rather than another port.
- Fixes Dolly's terminal would show: kitty graphics, which shows images such as plots saved as
  PNG (only virtual placements from placeholders #15086, newest numbered image by transmission
  #15094, eviction of the oldest by transmission #15103); the cursor pin after a resize (#15085);
  triple-click selection over blank lines (#15113); the right margin after wrapping (#15030);
  DECIC, DECDC, DECBI and DECFI (#14884).
- Throughput work in the terminal: the print fast path for mixed widths and ASCII runs (#15021,
  #15046), every SGR attribute at once and Style packed into 128 bits (#14995, #15023), skipping
  rows already blank (#14997, #15035), one blank-row write when a region scrolls (#15042), style
  runs in one scan (#15111), RefCountedSet reusing dead ids. Not measured in Dolly.

## What it costs

- Porting `src/ghostty/display.c` to the 1.0 API, which changed incompatibly since v1.4.0: frozen
  callback and value structs, the size field dropped from GridRef and Selection, GhosttyStyle a
  frozen 16-byte struct, formatter options set by key (#15074, #15075); INVALID=0 key enums,
  consistent setter names, results and NULL defaults, one shape for every function that fills a
  caller buffer (#15089); GHOSTTY_UNSUPPORTED for unknown keys (#15070); the selection format
  functions removed (#15098).
- Rebasing the patch: `patch -p1 --dry-run` of `config/ghostty-dolly.patch` against vt-1.0.0's
  four files applies every hunk (offsets: `lib_vt.zig` -27, `PageList.zig` +13 and +510). Upstream
  still has no `link_libc` handling, so the patch stays.
- Checking `config/ghostty-source-manifest.txt` and Ghostty's pins of Wuffs, translate-c and uucode
  (`build.zig.zon`) against the new commit.
- Separating the GTK application's pin from the terminal's: vt-1.0.0 is not an application
  release, so `demos/ghostty-gtk` keeps the 1.4.0 tarball under a commit pin of its own.
- Every image rebuilds, since the terminal is in all of them.

## Done when

- `DOLLY_GHOSTTY_COMMIT` names vt-1.0.0 (or a later vt-1.x), `display.c` uses the 1.0 API, and the
  patch is rebased.
- The display, terminal, display-cursor, pager, theme and indicators browser tests pass in
  Chromium and Firefox, and a PNG shown through kitty graphics (Pi's read tool on a Matplotlib
  plot) draws.
- The terminal's throughput before and after is measured the same way (for example `seq 1000000`
  and `cat` of a large file in `default`) and recorded here.
- `demos/ghostty-gtk` still builds its 1.4.0 application.

## Closed (2026-11-08)

- `088bbc0d0` (2026-11-07) moved `DOLLY_GHOSTTY_COMMIT` to vt-1.0.0, ported `display.c` to the
  1.0 API and rebased the patch.
- The 0.1.6 verification round (`integrate/0.1.6` at `c1479e7ac`) passed the display, display
  cursor, terminal (which draws a PNG through kitty graphics), pager, theme and indicators tests in
  Chromium and Firefox. It also built `ghostty-gtk`'s 1.4.0 application, whose X11 test passed
  (`work/integrate/build/round-1108-evidence/browser.log`, `demos.log`).
- Throughput, measured the same way before and after (`round-1108-evidence/throughput.mjs`):
  - `default` in a 1600 by 1000 page, `seq 1000000` and then `cat` of the same 6.9 MB, three
    times each.
  - Before: the published v0.1.5, served as Pages serves it. After: `integrate/0.1.6`.
  - Neither changed beyond noise: the time goes to `seq`'s million writes, not to the terminal.

| | v0.1.5 | 0.1.6 (vt-1.0.0) |
| --- | --- | --- |
| Chromium, `seq` | 8.36-8.54 s | 8.21-8.38 s |
| Chromium, `cat` | 135-139 ms | 130-154 ms |
| Firefox, `seq` | 12.33-12.46 s | 12.36-12.48 s |
| Firefox, `cat` | 173-177 ms | 154-162 ms |
