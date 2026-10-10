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

## The owner's first try (2026-10-11, 00:35)

On the build of 23:39, served from `work/wine/build/wine-release`: "Nothing happens when I run
hello_win after editing/saving/compiling. I see the .exe show up. It seems to be that after
quitting the program (or the original one), new ones can't be launchedd. So if you try the demo
one before launching the recompiled one it doesn't work. I want the Desktop to work more like in
windows, where it's like a folder on the system so I can put a shortcut to the .exe there. I also
want you to include a README.txt on the desktop that describes how to modify the program and
relaunch it."

Given to the same agent, in this order:

4. The bug: an x86-64 program starts every time the previous one has ended, however it ended and
   wherever it was started from; when the interpreter is busy, the prompt and the desktop say so.
5. The desktop shows the user's Desktop directory: today's shortcuts are entries in it, a file
   put there appears and opens on a double-click, and the owner's compiled program can be put
   there and started.
6. `README.txt` on the desktop: how to change, recompile, run and place the program.
