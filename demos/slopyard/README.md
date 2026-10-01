# Slopyard

A physics sandbox: build walkers, boats, cranes and aircraft from boxes and servo
joints, program them in Lua, and let an embedded Pi agent learn to drive them in
a shared coastal scrapyard where two teams compete to deliver cargo.

## Images

- `slopyard`: Build machines, haul cargo and compete across a coastal scrapyard. Requires WebGPU.
- `gamedev-sdk`: raylib and Box3D headers, libraries and sources.

Open `/slopyard/`; build with `npm run image -- slopyard`. Slopyard needs
`threads@0` and a WebGPU adapter.

## Use

- The workshop opens with Starter Car. Place boxes, hinges, pistons, wheels,
  turntables, thrusters, winches, magnets and Eyes; Enter tests, Escape returns,
  Ctrl-Z undoes, World enters the shared map. Driving uses WASD, E and Q for the
  magnet, Backslash for the Eyes camera.
- Design library and Workshop Export/Import keep blueprints with their optional
  Lua controller; World Export/Import saves the whole population.
- The Pi panel (Tab) runs an agent inside the game process whose tools build,
  observe, hold joints, run trials and install Lua controllers. Connect it with a
  local Codex relay ([game-agent](../game-agent/README.md)); its state lives in
  `/workspace/slopyard-agent`.
- The world autosaves to `/workspace/slopyard-world.lua`; save a Dolly session to
  keep it across reloads.

## How it works

- Box3D runs real 3D physics at 60 Hz with a SIMD, pthread build compiled in
  Dolly; a WGSL renderer draws boxes, water and shadows through `gpu@0`; raylib
  draws the editor panels in software.
- Controllers run at 20 Hz by default in separate Lua 5.5 states with no I/O.
- Buoyancy samples each block's volume; it is not a fluid simulation.
- Key files: [`slopyard.dm`](slopyard.dm), [`gamedev-sdk.dm`](gamedev-sdk.dm),
  [`lua55.dm`](lua55.dm), [`src/main.c`](src/main.c),
  [`src/pi.mjs`](src/pi.mjs), catalog programs in [`src/programs/`](src/programs/);
  tests in [`test/`](test/).

## Limits

- An unfinished experiment.
- Winch cables do not collide with terrain.
- Walking after rescue and repeated combat rounds are incomplete.

Test: `node demos/slopyard/test/slopyard-browser.mjs` with `DISPLAY` set; it needs a GPU
window, so `npm run test:demos` skips it ([`test/`](test/)).
