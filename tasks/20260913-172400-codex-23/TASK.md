# Separate JavaScript and Pi compilation from interactive image assembly

- STATUS: OPEN
- PRIORITY: 250
- TAGS: audit,build,core

## Evidence

The recovery/Zig image update rebuilt JavaScript in 21.0 s and Pi runtime in
70.9 s despite unchanged QuickJS, TypeScript and Pi source inputs. JavaScript
currently inherits the interactive system and compiles QuickJS/TypeScript; Pi
runtime then compiles upstream TypeScript while also installing settings, the
agent prompt, extension and theme. Any of these assembly edits repeats compilation.

## Done when

- Build QuickJS/TypeScript and Pi source artifacts on headless compiler bases.
- Assemble the existing interactive images with explicit artifact copies, keeping their tools, headers, libraries, source, licenses and configuration.
- System display changes and Pi prompt/configuration edits must reuse compiler/source producers; genuine compiler/source changes must still invalidate them.
- Measure reuse and leaf rebuilding, verify Pi/Studio and JavaScript in browsers, and validate the packaged producer inventories.
- Use the existing Dollyfile graph and artifact format; add no caching framework.

## Progress

Added headless `typescript-build` (QuickJS/TypeScript on system-tools) and
`pi-build` (upstream TypeScript emit and native launcher). Existing JavaScript
and Pi runtime images now copy their outputs and apply interactive configuration.
Pi's upstream source license is retained alongside the copied source and packages.
All prior JavaScript/Pi files and environment values are byte-identical except
recipe provenance; the license and producer provenance are the only new files.

Initial producer builds took 18.5 s / 64.7 s. Interactive assembly took 3.3 s /
8.0 s, compared with the prior 21.0 s / 70.9 s recompilations. A real Pi prompt
edit rebuilt Pi runtime, Pi, Pi-local and Studio in 25.892 s while both producers
remained byte-identical; restoring the exact prompt reproduced the original
images. The complete official `npm run image -- pi-build` path then took 3.31 s:
2.6 s source preparation/pinning, 0.2 s routes, 0.5 s artifact reuse; 134 HOST
sources (72.8 MB) were verified. No Rust or display bootstrap ran.

An isolated real recipe-graph variation confirmed display and Pi configuration
edits preserve producer identities, while QuickJS or Pi build-source edits
invalidate the corresponding producers and consumers. Chrome passed both
headless live inventories, Pi's local-provider TUI/tool round trip, and Studio's
Pi/Neovim/lint workflow. Chrome and Firefox passed the actual Wasm Janis checks
on the assembled JavaScript image. All 282 source checks passed in 3.06 s.
All 28 selected artifact checks pass; the unselected CPython archive is skipped.
A sealed local package with all 20 selected images is the remaining check.
