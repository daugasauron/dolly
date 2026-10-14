# Investigate: the libraries inside the 0 A.D. builds, and SpiderMonkey, as packages

- STATUS: CLOSED
- PRIORITY: 254
- TAGS: packages,catalog,0ad,owner

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

The owner's example of what he meant by packages (2026-10-13): "One example
would be breaking out spidermonkey (just an example) into a package."

## Closed (2026-10-14)

Owner (2026-10-14), on the tasks that waited for him: "I'm not gonna go
through 35 tasks, I'm sure some are not relevant anymore and some are
confirmed actual good fixes. If your investigation confirms they are fixes
that improve things and aligh with the main goal of the project go ahead. If
you're uncertain, give me a short description".

The investigation stands as the record; this task has no step of its own.
SpiderMonkey as a package needs a build base that no image is today,
because a package's `INSTALL` rows arrive with it: Python, Rust and Cargo
(about 425 MB) and three host modules. That is
[what a package needs only to build](../20261013-144754-build-needs/TASK.md).
One confirmed step is done in the round of 2026-10-14: `xonotic-build` and
`wine-build` install `freetype` in place of thirteen `COPY` rows. The rest
is kept in [builds become generic](../20261013-142800-generic-builds/TASK.md).

## State (2026-10-14, 02:30): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read `main`
`8af8f983`, the built images and the build logs, and changed nothing. The
integrator checked the SpiderMonkey recipe's rows and configure line, the
patch's size, four commits, the two quoted records and that no pin names
SpiderMonkey. It gives no verdict. What it found:

- Why SpiderMonkey's build sits where it does is written down
  ([0 A.D. built in Dolly](../20260930-231200-self-host-zero-ad/TASK.md),
  2026-10-07, decided before the build): a build image of its own, `FROM
  zero-ad-deps` "for pkgconf, zlib.pc and the C++ toolchain", Python and
  Cargo by `INSTALL`, the engine taking two rows by `COPY`, because "the
  engine needs only headers and two archives; the deps image … should not
  carry Python, Rust and Cargo (about 700 MB) for every rebuild;
  SpiderMonkey's patch changes should rebuild SpiderMonkey alone".
- No version in `zero-ad-deps` is one 0 A.D. pins. Six are the versions of
  Emscripten's ports from the host build of 2026-09-23 (ICU 68.2, Boost
  1.83.0, FreeType, libpng, Ogg, Vorbis); four were Dolly's own choice with
  no reason recorded (fmt 7.1.3, libxml2, ENet, libsodium). 0 A.D. asks
  pkg-config for each and has one floor, fmt 5.3.0. SpiderMonkey's version
  is 0 A.D.'s: its release bundles `mozjs-128.13.0.tar.xz`.
- SpiderMonkey as a package, written out (section 5.a): it needs a build
  base that no image is today (compiler, `patch`, pkg-config, a `zlib.pc`,
  Python, Cargo with Rust, cbindgen), because a package's `INSTALL` rows
  arrive with it ([build needs](../20261013-144754-build-needs/TASK.md)).
  With the tools in the base, `amy install spidermonkey` brings two
  archives (26.6 MB), 341 header paths, a `.pc` file and `zlib`. With the
  tools as rows it would bring Python, Rust and Cargo (about 425 MB) and
  three host modules into the engine's image and into a session.
- Its source has no pin of its own: the staged tree is pinned by the recipe
  and the bytes by 0 A.D.'s release. 0 A.D.'s own script names where the
  archive comes from (Wildfire's server, or Mozilla's ESR source through a
  packaging script); whether those equal the bundled one was not checked
  (no network).
- Of 0 A.D.'s patches to SpiderMonkey two are needed to build here and one
  fixes a crash in garbage collection; Dolly's 490 lines share no hunk with
  them. Of the configure flags four are 0 A.D.'s, one (`--disable-shared-js`)
  is Dolly's and the opposite of 0 A.D.'s, the rest are the port's. A
  package's flags are chosen once for everyone, and the engine compiles
  against the feature set as configured.
- Nothing else would install SpiderMonkey today: every other JavaScript
  user links QuickJS, and the one time it was weighed as an engine (for
  Claude Code, 2026-10-05) the decision was "extend Janis".
- The plain libraries: FreeType and libpng are upstream's CMake builds,
  unchanged, and written out as packages on `cmake-build` they are a dozen
  rows each; `xonotic-build` and `wine-build` would say two `INSTALL` rows
  for five and eight `COPY` rows.
- The entangled ones are less entangled than the ruling of 2026-10-12 says
  ("ICU's data file is 0 A.D.'s, ENet's transport is 0 A.D.'s relay"): the
  data file is ICU's own, byte-identical to the one in ICU's archive, and
  only its delivery is the demo's; ENet's replaced socket file is a general
  transport over Dolly's HTTP module that names no game, and the relay
  server is the demo's. A package of ENet would declare `http@0`.
- No recipe outside the 0 A.D. chain asks for `pkg-config`, and nothing
  installs the three views except `freetype` installing `libpng`.
- Not found out, each needs a build or the network: whether SpiderMonkey
  builds unchanged on another base; whether Wildfire's archive equals the
  bundled one; whether 0 A.D. compiles against fmt 11; sizes of the single
  libraries.

## What the inventory says (2026-10-13, unchecked)

- `zero-ad-deps` compiles pkgconf, libpng, FreeType, Ogg, Vorbis, libxml2,
  ICU 68.2, libsodium, Boost's headers, fmt 7.1.3 and ENet, and writes the
  `.pc` files of `zlib`, `curl` and `sdl2`. ENet's sockets are replaced by
  `enet-dolly.c` (0 A.D.'s relay); ICU needs the data file 0 A.D.'s content
  supplies; fmt exists in three versions across the tree.
- FreeType and libpng are taken out of it by `COPY` in `xonotic-build`,
  `wine-build` and `xonotic`.
- SpiderMonkey 128.13.0 is built in `zero-ad-spidermonkey` with mozbuild,
  Python, Cargo and cbindgen; `zero-ad-engine` copies two rows. Its source
  is taken out of 0 A.D.'s release and has no pin of its own; any build
  needs three of 0 A.D.'s six patches; Dolly's 490-line patch is all the
  port's; nothing else would install it today. The inventory writes a
  recipe out and lists five things in the way.
- [A package cannot say what it needs only to build](../20261013-144754-build-needs/TASK.md).
