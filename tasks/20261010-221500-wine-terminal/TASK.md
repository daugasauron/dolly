# A terminal in the Wine image, and editing, recompiling and running a window program

- STATUS: CLOSED
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

## Result (2026-10-11)

Commits `519958ae`, `5fc403b7`, `88ab27e6`, `b31e15e5`, `5d274072`, `ea21e73a`, `5f104d0e`,
merged in `56b0223b`. The test at the last of them, in Chrome (147 s) and Firefox (154 s): "the
terminal ran cmd's commands, a console program and an x86-64 one with their exit codes, and
refused what one process cannot do; the x86-64 sample started again after it had ended, from the
desktop and the prompt; hello_win.c, edited in Notepad, was compiled by tcc in 607 ms and showed
its new text, also from a shortcut made on the desktop and from a copy in the Desktop folder".

- The bug: the interpreter was not taken. The first run's window class was still registered, so
  the second run's `RegisterClass` failed and TinyCC's example returns without a word. A
  program's classes are now freed at every start. The desktop says in a box when a program is
  busy; the prompt and the file manager already did.
- The desktop is `Z:\home\dolly\Desktop` (`Desktop` from the prompt), listed four times a
  second, its icons by name. The eight shortcuts are real `.lnk` files written by shell32 at
  image build; a `.lnk` opens by its target, an `.exe` under `x86emu`, a directory in the file
  manager, a `.bmp` in Paint, anything else in Notepad. The owner's program goes there by
  `copy hello_win.exe Desktop` or by the desktop's right-click "New Shortcut...".
- `README.txt` on the desktop says the steps; each is in the test.
- The integrator, on the served copy: the desktop's sample, closed; `tcc hello_win.c`,
  `copy hello_win.exe Desktop`, `hello_win`, closed, `hello_win` again: a window each time.

Still so, each refused with a message: a running program is not started a second time, one
x86-64 program runs at a time (so `tcc` waits for the compiled program to be closed), no `start`
and no second `cmd`. Of a shortcut only target and arguments are used. Icons are not dragged,
renamed or deleted on the desktop. A key typed at once after clicking another program's window
can be lost (the test waits 300 ms).
