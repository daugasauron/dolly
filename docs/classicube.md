# ClassiCube

`Dollyfile-classicube` starts offline single-player. Its separate
`Dollyfile-classicube-build` compiles the pinned upstream C source inside Dolly,
using SDL2, the upstream software renderer and cooperative map generation.
No JavaScript game engine, GPU backend or native game process is involved.

Build with `npm run image -- classicube`. As with other images, this requires
the Dolly runtime/compiler seed and Chrome. Source preparation only downloads,
verifies and archives source/assets; application compilation runs in the browser.

Click the canvas to capture the mouse. WASD moves, Space jumps, left click breaks
blocks, right click places blocks, B opens the inventory, and Escape opens the
menu and releases capture. The menu provides map generation and saving.
The initial settings use 640×480, a 32-block view distance and a 60 FPS limit;
the graphics menu can change them.

The working directory is `/home/dolly/classicube`; maps and options are ordinary
files in Dolly's filesystem. After exiting, restart from the recovery shell with
`cd /home/dolly/classicube; classicube --singleplayer`. Preserve the Dolly session
to retain saved files across browser sessions.

This first image has no agent integration, multiplayer or audio. It is
ClassiCube's Minecraft Classic-style creative game, not modern Minecraft.
