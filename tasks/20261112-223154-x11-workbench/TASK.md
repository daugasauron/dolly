# A terminal workbench on x11-desktop: Ghostty, zsh, tmux, Neovim and Mojo installed in turn, then the best demo Dolly can give

- STATUS: OPEN
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
