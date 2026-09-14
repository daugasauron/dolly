# Remove the superseded GPU shader demo

- STATUS: CLOSED
- PRIORITY: 100
- TAGS: gpu,cleanup

Removed the shader playground Dollyfile, embedded module, C program, WGSL,
preparation script and dedicated microbenchmark. The preview helper is now
`scripts/serve-gpu.mjs`, defaulting to fluid. Removed the generated demo image
and routes; the full catalog no longer includes it. Historical measurements
remain in closed tasks.

Moved the shared GPU boundary proof into `test/fluid-browser.mjs`. Chrome 151
and Firefox 155 passed visible fluid controls, compute readback/direct replay,
interrupt/restart and all ten boundary cases, including copied packets, stale
handles, quotas, capabilities and pipeline constants. Evidence:
`build/fluid-proof/results.json`. All 274 source tests and 39 recipe pins pass.
