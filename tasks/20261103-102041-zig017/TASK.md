# Zig 0.17 across the board: zig, its LLVM, Ghostty's build and every image built with them

- STATUS: OPEN
- PRIORITY: 220
- TAGS: zig,toolchain,display

Owner (2026-11-03): "I think a new version of zig was released, I want you to upgrade to that
across the board."

Zig 0.17.0 was released on 2026-10-01 (ziglang.org's download index; master is
0.18.0-dev). Dolly pins 0.16.0 (`config/source-pins.sh`: `DOLLY_ZIG_VERSION`, the host Zig that
fetches Ghostty's dependencies `DOLLY_ZIG_HOST_*`, and LLVM 21.1.8, "the version Zig 0.16 links").

What uses Zig (recipes naming it on 2026-11-03): `Dollyfile-zig`, `Dollyfile-zig-build`,
`Dollyfile-ghostty-build` (the terminal library every image's display holds, so the whole catalog
rebuilds), `demos/zig` (`zig-llvm`, `zig-llvm-build`), `demos/llvm` (`llvm21`,
`llvm21-tablegen`), `demos/ghostty-gtk/Dollyfile-ghostty-gtk`, `demos/zero-ad/Dollyfile-libsodium`.

To find out first, with evidence: the LLVM version Zig 0.17 links (a new LLVM is its own long
build); whether Ghostty at `DOLLY_GHOSTTY_COMMIT` builds with 0.17 or needs a newer commit (its
`build.zig.zon` `minimum_zig_version`), and what a newer Ghostty changes in the terminal; what
in Dolly's Zig port (`demos/zig`, the target's patches, if any) 0.17's changes touch.

Done when: every recipe that builds with Zig uses 0.17.0 (or the newest release then), the docs
and pins name it, nothing pins 0.16; the catalog is rebuilt in a round, and the terminal, zig's
own demo test and the images built with it pass their tests in Chromium and Firefox.
