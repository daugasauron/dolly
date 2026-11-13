# A terminal workbench on x11-desktop: Ghostty, zsh, tmux, Neovim and Mojo installed in turn, then the best demo Dolly can give

- STATUS: CLOSED
- PRIORITY: 420
- TAGS: x11,demo,terminal,amy,0.1.6,owner

Owner (2026-11-13): "I think ghostty-gtk and some of the amy packages needs some love. I want you
to make a demo video that starts on x11-desktop, installs ghostty and runs it, then installs zsh,
then tmux, then installs nvim, then runs in split pane (nvim left, terminal right) installing
mojo, then doing the coolest possible demo with whats available in the dolly environment. This
task should use fable5.2. [...] Theres 2 parts here, part 1 is making this work and deciding what
to do, part 2 is the actual demo video." Part 2 is `20261112-223154-x11-workbench-video`. Both go
with 0.1.6.

## The sequence

1. `x11-desktop` opens on the page.
2. `amy install` Ghostty (the GTK one, `demos/ghostty-gtk`), and it runs in the X session.
3. In Ghostty: `amy install zsh`, then zsh; `amy install tmux`, then tmux; `amy install nvim`.
4. tmux splits the window: Neovim on the left, a shell on the right, where `amy install mojo` runs.
5. The best demo of what Dolly has, decided in this task: what is installed, built, run and shown,
   so that a viewer sees a real workbench in a browser tab.

## Do

Run the sequence by hand and by script in Chrome (and Firefox where it can), fix what does not
work in Ghostty, the packages and the X session ("needs some love": crashes, slow starts, missing
glyphs or keys, wrong sizes, unreadable output), each fix upstream-respecting as `AGENTS.md`
asks. Decide the final demo and write it down here with its timings, so part 2 records a take
that works every time. This task is to be done with Fable 5.2.

## Done when

The whole sequence runs from one script, start to end, three times in a row in Chrome without a
hand's help; the fixes are committed with their tests; the demo is written down.

## Closed (2026-11-13)

The sequence runs from one script: `work/videos-2026-11-13/x11-workbench/rehearse.mjs` (steps in
`sequence.mjs`, waits on the X frame's pixels in `bench.mjs`), in headless Chrome against the
tree's dev server.

### Fixed

- **Ctrl+C ended the X session** (`e71e86a77`). The terminal the server is started at kept its
  interrupt key while SDL had the keyboard, so Ctrl+C in any window was SIGINT to the server and
  its clients. Xsdl's keyboard driver clears `ISIG` on that terminal while enabled, as kdrive's
  Linux driver sets its console raw. Test: `demos/x11/test/x11-browser.mjs` interrupts a sleep in
  an xterm and goes on (Chrome, Firefox).
- **`ghostty` installed by amy showed an empty terminal** (`a9efb45fd`): it needed Mesa's version
  overrides in the environment, which only the `ghostty-x11` image set. The program sets them
  where Ghostty sets GTK's environment. (A first try set them later, in the renderer: Ghostty's
  copy of the environment then went stale and its shells lost `PATH`.)
- **A key's echo in Neovim took 1.2 s** in a 102x37 window (`a9efb45fd`): softpipe shaded every
  pixel of every row with a background, and Neovim's colour scheme gives every cell one. Cell
  backgrounds are scissored clears now, and a frame draws only the rows whose cells changed:
  0.15 s (the table is in `demos/ghostty-gtk/README.md`). Test: `ghostty-x11-browser.mjs` checks a
  coloured run of cells, and that an erased row is redrawn while another stays as drawn.
- **The package lacked what GTK reads at start** (`a9efb45fd`): GTK's compiled settings schemas
  (a dialog that keeps a setting aborts without them; two criticals at each start) and
  fontconfig's configuration (an error at each start).

### Found, not fixed

The first three are `20261113-101500-ghostty-gtk-leftovers`; the rest are how things are.

- GTK prints three GModule criticals at start: it opens the program itself (`g_module_open(NULL)`)
  and `dlopen(NULL)` fails in Dolly. A handle for the program is the dso@0 client's to give, which
  is in the seed: left for a seed round.
- Ghostty's new-tab button shows GTK's missing-image icon: `tab-new-symbolic` is Adwaita's icon
  theme's, which no package has.
- Text is still shaded a pixel at a time: a whole redraw of a window full of text takes about
  0.4 s (a scroll in Neovim).
- The X server repeats a key it has seen held for 660 ms, as X.Org does; when the machine stalls
  between a key's press and its release (load 15 on 16 cores), a letter repeats. Two in 1,600
  keys in one run. The script releases each key as soon as it is pressed, which leaves a stall
  nothing to stretch.
- Mojo reports an unknown name or a `Float32 / Int` as "statement indentation must match the
  rest of the block" on the lines after it.
- zsh's `%n` is empty (Dolly has no user names) and tmux starts `$SHELL`, which stays Slop under
  a zsh started by hand: the sequence writes a prompt to `~/.zshrc` and exports `SHELL`.
- Neovim has Mojo's filetype (syntax and Python's indent); its defaults there are tabs of 8, so
  the sequence sets `sw=4 sts=4 et`.

### The demo

After the owner's steps (Ghostty from xterm, zsh, tmux, Neovim, the split, `amy install mojo`): a
45-line Mojo program, `julia.mojo`, typed into Neovim, that computes a Julia set for a terminal of
any size and prints each frame as coloured cells, the constant moving round a circle for 12 s.
`mojo build` compiles it in the pane beside its source and it runs there; then tmux zooms the
pane, Ctrl+minus nine times shrinks Ghostty's font until the window is 340 by 111 cells, and the
same program draws 170 by 109 points at 36 to 40 frames a second; Ctrl+0 and the workbench is
back. Chosen over a kernel on the GPU (`gpu@0` is not what `x11-desktop` declares, and one frame
takes the CPU under a millisecond) and over a half-block picture (softpipe shades glyphs a pixel
at a time: 1.6 frames a second), since backgrounds are clears.

Timings of a run (headless Chrome, 2026-11-13, load 15): 217 s in all. `amy install`: ghostty-gtk
1.8 s, zsh 1.2 s, tmux 1.0 s, nvim 1.7 s, mojo with `cc` 4.9 s. Ghostty asks for its place 0.5 s
after `ghostty &` and shows its prompt 0.8 s after the click. Typing the program 88 s.
`mojo build` 9.2 s.

Three runs in a row in headless Chrome, each in a new page, ended with the program saved as typed
and built: 225 s, 249 s and 245 s (`build/x11bench-logs/rehearse-chromium-3.log` in the
`work/x11bench` tree, 2026-11-13). The x11 and ghostty-x11 tests pass in Chrome and Firefox
(`build/x11bench-logs/`), with the recipe lint and the source suite (392 tests).
