# A file manager in the Wine image

- STATUS: OPEN
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
