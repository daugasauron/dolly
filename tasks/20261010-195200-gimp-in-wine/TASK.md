# GIMP in the Wine image, through the x86-64 interpreter

- STATUS: CLOSED
- PRIORITY: 120
- TAGS: wine,demo,gimp

Owner (2026-10-10): "In parallel, would it be possible to add gimp to the wine environment and
run it through the emulator?"

Answer given: not as the interpreter stands; nothing was built or tried.

Owner, after that answer: "Any old version of GIMP is fine, I just want it as a tribute to the
original "The rise and death of JavaScript" talk." (Gary Bernhardt's "The Birth and Death of
JavaScript", where GIMP runs compiled to asm.js.) Taken up as: an old GIMP compiled from source
against Winelib into the Wine image, as Paint and NetSurf are, not interpreted. Branch
`demo/gimp`, worktree `work/wine`.

- `x86emu` has integer instructions and SSE moves only, no guest threads, and bridges window
  procedures but few other callbacks (`demos/wine/README.md`, "x86emu"). GIMP's own code, GLib,
  GTK, cairo, pango, babl and GEGL would all be guest code: floating point throughout, worker
  threads from start-up, and callbacks of many kinds (timers, font enumeration, thread entry
  points, COM objects for drag and drop).
- GIMP runs every file format and filter as a plug-in process; `CreateProcess` fails here.
- Measured: about 85 million instructions a second in Chrome. GIMP's start-up was not measured;
  the estimate of ten billion instructions or more is the integrator's.

What could work instead, none of it started:

- An editor built from source to wasm64, as Paint and NetSurf are. GrafX2 and Tux Paint draw
  through SDL, which Dolly has (`demos/sdl2`), and need neither Wine nor GTK.
- GIMP from source against Winelib would need GLib, GTK and some forty libraries ported and its
  plug-ins made threads; no estimate is honest before GLib alone runs.

## Result (2026-10-11)

GIMP 2.2.17 is on the Wine desktop, compiled from source against Winelib with GLib 2.12.13,
ATK 1.9.1, Pango 1.14.10, GTK+ 2.6.10 (the last without cairo), libart 2.3.17, fontconfig 2.3.2
and Expat 2.7.1 (`config/source-pins.sh`; patches in `demos/wine/gimp-dolly.patch`, five
files). Commits `d9015196` (GTK+ on the desktop) and `c52b3f3e` (GIMP), merged in `56b0223b`.

- The agent's test (`node demos/wine/test/wine-browser.mjs [firefox]`): "GIMP showed its toolbox
  803 ms after the Start menu's key; a paintbrush stroke of 4001 dark pixels was saved as XCF
  and came back in a second run", in Chrome and Firefox.
- The integrator, on the served copy: the toolbox, the layers and brushes dock and the tip
  window from the desktop's shortcut, beside a compiled x86-64 program and the prompt.
- What made it possible: Wasm traps on a call through a pointer of another type, which old C
  does everywhere; `demos/wine/icall.c` rewrites objects to call through thunks.
- The `wine` snapshot went from 179.0 MB to 191.8 MB; the image builds in 318 to 346 s (190 to
  211 s before).

Not there:

- Plug-ins, which GIMP runs as processes: XCF is the only file format and there is no
  Script-Fu. As threads they would need each plug-in linked as a program, GIMP's start of them
  replaced by a thread over pipes, those pipes in GLib's poll (which waits on Windows messages
  only), and an answer to several plug-ins sharing one GTK.
- One fault, Firefox only: in the GIMP session Ctrl+S after the first stroke is ignored, 9 of
  about 140 runs, 0 of 33 with message tracing on, not seen in Chrome. Cause not found
  (`work/wine/build/gimp-evidence/ff-*`).
- The executable is GPL-2.0-only as a whole (`docs/licences.md`, "Combined binaries").
