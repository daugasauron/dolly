# Investigate: packages that are views of a build image (pkgconf, libpng, freetype, openal, libuv, lua, raylib, box3d and the rest)

- STATUS: OPEN
- PRIORITY: 252
- TAGS: packages,catalog,dollyfile,owner

Owner (2026-10-13), on
[the inventory of builds](../20261013-142800-generic-builds/inventory.md): "I
agree in some sense, but some of the judgement is again too blunt. These are
all good points but needs way more understanding to make a call if the
changes actually improve things or not."

This task investigates one group of its points. It decides nothing.

Done when it holds, with the evidence and without a verdict, for each thing
in the group:

- how its build came to be where it is: the commits and tasks that put it
  there, quoted, and the reason each gives;
- how it is built today (sources and pins, patches and whose they are, what
  the build needs that is not in its base) and who uses the result, read
  from the recipes;
- what a package holding its own build would look like in a real recipe,
  written out far enough to see what it needs: its base, its build tools,
  what it exports, what its users would then say;
- what that would improve and what it would cost or lose, each shown on a
  real case and not asserted: who else could use it, what gets simpler in
  the recipes that use it today, what gets more complicated (a base image
  per set of build tools, a pin that does not exist yet, a patch that is a
  demo's own, versions two users disagree on);
- what could not be found out without building.

The owner decides what, if anything, follows.

## State (2026-10-14, 02:45): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read `main`
`1b8e4b9c`, the built images and the logs, and changed nothing. The
integrator checked the counts (77 packages, 19 views under the strict rule,
9 made of `COPY` rows), Slopyard's second Box3D build, the two port patches'
sizes and the quoted rule. It gives no verdict. What it found:

- The document names three shapes of a package and ranks none
  (`docs/dollyfile.md:289-293`, both commits of 2026-10-05). The ranking,
  "Cheapest shape first: a thin `PACKAGE` over the image that builds the
  program … adds no image input and rebuilds nothing", is the packages
  task's of 2026-10-12, and it made the views of that night and the next.
  That the thin packages are "the shortcut" is the integrator's reading of
  the owner's words of 2026-10-13, not a sentence of his.
- Today 30 of 77 packages hold no build: 21 views and 9 made of `COPY`
  rows; 42 hold their build; 5 are data or a script. The inventory's
  numbers are right for its tree.
- Of the twelve views outside the base images, nine are installed by no
  recipe (`openal`, `libuv`, `raylib`, `box3d`, `llama`, `zig`,
  `session-recover`, `pkgconf`, `freetype`).
- "Nothing entangled" holds for the build steps (each is one block of rows
  that moves whole) and not for what stands around them:
  - `openal`: Dolly's 123-line patch applied at staging, options chosen for
    0 A.D. (a serial mixer, no threads, no backend), and `zero-ad-deps` is
    built on `openal-build`, so twelve images stand on it. The library plays
    nothing itself: a program renders samples and writes them to `audio@0`,
    so the package declares no host module (the ruling of 2026-10-12 read
    it the other way; both are on record).
  - `libuv`: Dolly's port (the 151-line patch, two C files, a header, a
    Makefile) of upstream's archive at Neovim's pin, not CMake's bundled
    copy; 82 images stand on `cmake-build` and each carries `libuv.a`.
  - `raylib` and `box3d`: one `sdk.mk` for both; Slopyard builds Box3D a
    second time from the SDK's kept source tree, with threads and SIMD, and
    links that one, so the SDK's `libbox3d.a` has no user but the `box3d`
    view. Here two users do want different options.
  - `nvim`: five libraries that exist only as static archives, plus CMake,
    libuv and the page formatter; no base holds all of it.
- Written out (section 5), a package holding its own build is the build
  image's recipe with the view's export rows appended, in every case but
  `nvim`; the build image then goes or becomes a composition. The question
  left open each time is [build needs](../20261013-144754-build-needs/TASK.md).
- The catalog already has both shapes for the same kind of thing:
  `libevent` and `libterminfo` hold their builds and `tmux` installs them,
  so `tmux-panes` carries 851 KB of libraries its program linked
  statically; `quickjs`, `janis` and `typescript` hold their builds since
  this night at 1.65 MB more than the view they replace, built in 14.9, 4.1
  and 5.2 s.
- What would rebuild, on today's graph: `openal` 12 images; `raylib` and
  `box3d` 4; `libuv` 82; `llama` 3; `nvim` and `lua` 4; `session-recover`
  51; `zig` and `display` 118 and 115.
- Not found out: the time and memory of these builds (no log holds a
  duration); what `zero-ad-deps` declares `audio@0` for; whether the
  rulings of 2026-10-05 and 2026-10-12 ("one consumer", "portable C …
  stays") still stand for the owner.

## What the inventory says (2026-10-13, unchecked)

- 31 of 79 packages hold no build: 22 are `FROM` a build image and compile
  nothing, 9 are `COPY` rows.
- For eight of them it finds "nothing entangled" or little: `pkgconf`,
  `libpng`, `freetype` (`zero-ad-deps`), `openal` (`openal-build`), `libuv`
  (`cmake-build`, a port with a 151-line patch), `lua` (`COPY` from
  `neovim-build`), `raylib` and `box3d` (`gamedev-sdk`, one `sdk.mk`).
- For others it names what is in the way: `nvim` needs five static
  libraries in its base, `display` needs Zig, `rust` and `cargo` come out of
  one recipe that replaces the seed compiler in place twice, `codex` and
  `pi` need protox and `tsc` in their base.
- `docs/dollyfile.md` ("Packages and amy") and the rule written on
  2026-10-12 ("cheapest shape first: a thin `PACKAGE`") recommend views.
