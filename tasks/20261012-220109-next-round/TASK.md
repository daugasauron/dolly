# The next catalog round: what waits for it

- STATUS: OPEN
- PRIORITY: 150
- TAGS: catalog,owner,packages,host-modules

State (2026-10-13): nothing here is started. Each item changes an image
input or repins a chain, so it costs the round (5.5 h) and is the owner's to
take or leave; the items are independent. Main `b6c3d716` has every image
built without them.

Done when: each item is in a round that passed, or is dropped here with the
reason.

## Seed changes

1. **`pty@0`, and tmux with it**: on branch `demo/tmux`, not on main
   ([tmux](../20261012-130814-tmux/TASK.md)). First its regression: merged
   into main on 2026-10-13, Pi's demo test failed 3 of 7 runs with a stray
   `u` in what the test typed (`DOLLY-ENTRY-CWuD`), against 0 of 11 on the
   kernel without it, and the merge was taken out again. Then the owner's
   review of the contract's shape (two operations, the slave answered by the
   process contract's terminal request, `/dev/tty` by descriptor), and the
   seed step: the client and `<dolly/pty.h>` in `host/pty/` with a stamped
   digest, the module's row in `docs/browser-boundary.md` and its section in
   `docs/process-model.md`, `default` declaring it (then `amy install tmux`
   works there), `tmux` and `tmux-panes` in `config/domain-pages-images.txt`.
   Left beside it, each a change to the process contract: a spawn that is not
   the caller's child (tmux starting its own server), a terminal recorded per
   process, and `pipe-pane`, which forks.
2. **`default` installs `transfer`** in place of four `COPY` rows: commit
   `1240e208` on `core/packages`. `docs/dollyfile.md` names `default`'s
   packages and gains the name; `zero-ad` is `FROM default`.
3. **A failed start names the package** (`src/slop.c`): `command not found`
   could name the package from the index's `TOOL` rows.
4. **A package names its dependencies instead of holding them**
   (`src/dollyfile.c`, `src/commands/amy.c`): `cargo` is 500 MB of which
   463 MB is `rust`; with it Qwen3.5-4B is one package of four rows, not four.

## Repins without a seed change

5. **`python` installs `cc` and `ninja`**: commit `025cffb6` on
   `core/packages`, so that `amy install python` alone builds NumPy. It
   repins the chains that install `python` as a build tool: Rust, LLVM, Pi,
   0 A.D. and now Mojo. With item 4 it adds nothing to `python`'s snapshot.
6. **The builds move into the packages**, and **the builder supplies the
   engine**: the two stages of the lean base, about 600 recipe lines moved.
7. **`default`'s host list**: it declares neither `microphone@0`,
   `buttons@0`, `audio@0` nor `gpu@0`, so `transcribe`, `voice` and a kernel
   built by `mojo-compiler` are refused there by name. What the page people
   open may ask the browser for is the owner's decision.

The measurements and designs for items 2 to 7 are in
[packages](../20261012-130814-packages/TASK.md), "Held for a catalog round".

## At their next rebuild, no round

- `xonotic-build` and `wine-build` install `libpng` and `freetype` in place
  of their five and eight `COPY` rows.
- `gamedev-sdk` drops its `/usr/lib/libm.a` when `bhop` and `slopyard` next
  rebuild.
