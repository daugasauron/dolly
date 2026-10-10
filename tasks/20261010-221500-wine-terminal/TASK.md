# A terminal in the Wine image, and editing, recompiling and running a window program

- STATUS: OPEN
- PRIORITY: 130
- TAGS: wine,demo,terminal

Owner (2026-10-10): "I also want to add a terminal inside the wine image. I want something
similar to the hello_win program to have the source code inside the image, and it should be
possible to edit it in notepad, recompile it and run it (for example to change the test printed
inside the window)."

Given to the agent working in `work/wine` (branch `demo/gimp`), ahead of GIMP. Done means:

1. "Command Prompt" on the Wine desktop: Wine's own `cmd` in a console window.
2. Programs start from it: those linked into `wine` as threads, x86-64 `.exe` files under
   `x86emu`; what one process cannot do fails with a message.
3. A browser test of the loop: the image's `hello_win.c` opened in Notepad, its text changed
   and saved, compiled by the image's TinyCC from the terminal, run, and the new text read from
   the window. The compile time in Chrome is measured.
