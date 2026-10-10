Changing what "Hello_win" prints
================================

"Hello_win (x86-64)" on this desktop is a small Windows program. Its source
is hello_win.c in your directory, Z:\home\dolly, and Notepad and the TinyCC
compiler are here to change it.

1. Open "Command Prompt". It starts in Z:\home\dolly.

2. Open the source in Notepad:

       notepad hello_win.c

   Near the end, in WinMain, is the line

       pWindowText = lpCmdLine[0] ? lpCmdLine : "Hello Windows!";

   Change the text between the quotes, save with Ctrl+S (File, Save) and
   close Notepad.

3. Compile it. This writes hello_win.exe beside the source:

       tcc hello_win.c

4. Run it:

       hello_win

   The Escape key closes its window.

5. Close that window before you compile again. The compiler is an x86-64
   program too, and this Wine runs one of those at a time: a second one is
   refused with a message.

On the desktop
--------------

The desktop shows the files of your Desktop folder, Z:\home\dolly\Desktop.
From the prompt that is "Desktop", and the File Manager has it under
home\dolly. A file put there appears here, and one deleted there goes.

To have your program on the desktop, copy it there:

       copy hello_win.exe Desktop

Or make a shortcut to it: click the desktop with the right mouse button,
choose "New Shortcut...", type hello_win.exe and press Enter. The shortcut
starts whatever you compiled last. The copy stays as it was until you copy
again.
