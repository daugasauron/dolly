# Decide the runtime's demo-only device capabilities

- STATUS: CLOSED
- PRIORITY: 120
- TAGS: core,boundary,demo

Games added `audio@0` (only 0 A.D.; a new outer browser import `abi/dolly-browser-0.wat:10`),
`threads@0` (only Slopyard and rebuild boots via `buildHost`, `src/host/modules.mjs:16`;
conflicts with "prefer simple serial semantics") and the GPU render path (games and fluid only;
Pi Local uses compute). AGENTS.md hard constraints were amended for GPU and audio
(`AGENTS.md:42-45`).

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Each optional capability is documented as optional, disabled for core images, and justified by a
consumer.

## Done when

- Owner decision recorded; core images do not enable demo capabilities.

## Resolution (2026-09-30)

Owner decision (2026-09-30): games stay in the repository, so the optional gpu@0, audio@0 and threads@0 host modules stay in the modular runtime.
