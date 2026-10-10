# A file manager in the Wine image

- STATUS: CLOSED
- PRIORITY: 140
- TAGS: wine,demo

Owner (2026-10-10): "I also want to add a file explorer program to the wine image."

Goal: a file manager on the Start menu that browses the Dolly filesystem the Wine prefix sees
(drives, directories, files with sizes and dates), opens a directory on double-click, goes up, and
opens a text file in Notepad and an image in Paint (programs here are threads of one process, so
"open with" is starting that built-in program's thread with the path). Delete, rename, copy and
make-directory if the program offers them and they work; what it offers and cannot do must fail
visibly. `demos/wine/` only, no contract change, its own commit and report.

Test (`demos/wine/test/wine-browser.mjs`): start it from the Start menu, see a known directory's
entries drawn (files created from the shell first), enter a subdirectory and come back, open a
text file into Notepad and read its text on screen. Record image size and build time before and
after (before: `wine` 178,871,458 bytes, both images built in 211 s).

## Read so far (not built)

Wine 4.0.4's `programs/winefile` (4,375 lines, in the pinned source) is the candidate. Its
shell-folder mode is no longer behind `_SHELL_FOLDERS`: it is always compiled, and start-up calls
`CoInitialize` and `SHGetDesktopFolder`. ole32 and mpr are not linked here, so as it is it would
end in Wine's "unimplemented function" exception at once. What a patch has to do: leave out
`CoInitialize` and the desktop folder, make the "Shell" namespace and the network-drive dialogs
(`WNetConnectionDialog`) fail with a message instead, and replace `ShellExecute` on a file (which
needs `CreateProcess`) by starting Notepad or Paint as a thread with the path
(`wine_dolly_start_program`), with a message for other file types. Its Windows-filesystem mode
(`FindFirstFile` over drives) and its Unix mode (`__WINE__`, `opendir`) need neither.

## Done (2026-10-10)

Wine's `winefile`, patched as read above, is "File Manager" on the Start menu. Chosen because it is
in the pinned source, needs no new pin, and its Windows-filesystem mode needs nothing this Wine
lacks; `explorer` needs the COM shell browser.

Measured in Chrome and Firefox by `node demos/wine/test/wine-browser.mjs` (the last part of its
third session): after `mkdir`/`echo` in the shell, the desktop is started again and File Manager
opened from the Start menu; it lists drive `Z:`; a double-click on `0test` shows five rows of
entries (`.`, `..`, `inner`, `notes.txt`, `ten.dat`; rows of text are counted in the frame),
`inner` three, `..` five again; Delete on `ten.dat` and Yes in shell32's question leaves four rows,
and `ls` in the shell afterwards does not find the file; a double-click on `notes.txt` opens
"notes.txt - Notepad" (the desktop's window list) with 411 dark pixels of text. The titles
`[Z:\0test]`, `[Z:\0test\inner]`, `[Z:\0test]` are read from the desktop's list.

What it took beyond the patch to winefile itself (all in `demos/wine/`, no contract change):

- `GetLogicalDrives` answered 0: the drive letters are objects mountmgr creates, and mountmgr is a
  driver process. On Dolly it now reads the prefix's `dosdevices` links. Before, the drive bar was
  empty and so were the drive lists of the file dialogs.
- Every date read "13/13/0013 13:13:13": libwine's `vsnprintfW` took each integer argument with
  `va_arg(valist, void *)`, which reads eight bytes where WebAssembly passed four. Patched to take
  an `int`. This was wrong for every program of the image since the first day.
- Delete ended the program in Wine's "unimplemented function" exception: shell32's `SHAlloc` is
  ole32's `CoTaskMemAlloc`. `port/ole32-taskmem.c` provides the allocator (the process heap, as in
  Wine); `SHChangeNotify` returns when nobody listens instead of asking ole32 for an item list.
- `Globals` is defined by Notepad and winefile both: two lines in `shared-names.txt`.

Not tried: Move and Copy (the same shell32 path as Delete), the properties dialog, the font
dialog, the Unix view beyond its button. Fails visibly by design: context menu, Run, network
drives, Help ("not supported"); opening a second file of a kind whose program is running ("in
use"). A folder's icon is a white square in a second child window (seen once, not looked into).

`wine` snapshot 178,877,414 bytes before, 179,048,487 after; `wine-build` and `wine` built in
191.5 s (about 210 s before, on a loaded machine); the test takes 62.5 s in Chrome.
