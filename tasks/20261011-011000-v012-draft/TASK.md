# A draft v0.1.2: a rebuild with the new Wine and pi-phone

- STATUS: OPEN
- PRIORITY: 180
- TAGS: release

Owner (2026-10-11), about the Wine relaunch bug, the desktop as a folder and its README: "After
that is fixed, I want a draft v0.1.2 rebuild that includes wine and the new pi-phone image."

A draft is local: built, tested, packaged and served on this machine. Nothing is tagged, pushed
or deployed without the owner saying so.

Done means:

1. `main` holds the Wine work (`demo/gimp`: GIMP, the Command Prompt, the relaunch fix, the
   desktop as a folder, `README.txt`) and the phone work (`buttons@0`, `pi-phone`, the new
   `speech-to-text`), with the version at 0.1.2.
2. Every image of the catalog rebuilt on that seed: the kernel and SDK changed after v0.1.1
   (`microphone@0`, `buttons@0`, the display's cursors and font rule), so none of v0.1.1's
   images is current.
3. The release round's checks, with what failed said plainly.
4. Both sites packaged; GitHub Pages under its 1 GB, and which images that leaves out.
5. Served locally, with the addresses in the report.
