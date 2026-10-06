# Call kernel exports by their contract names; drop the _NAME object

- STATUS: OPEN
- PRIORITY: 150
- TAGS: core,cleanup,boundary

Left by `20261005-133401-kernel-boundary`. Since the Worker instantiates the
kernel itself, trusted code could hold the instance's exports. It still holds
an object built in one line of `src/runtime-worker.mjs`, with every export
under Emscripten's `_NAME` spelling, because about 60 call sites in
`src/process-supervisor.mjs` and the providers use it (`dolly._dolly_process_dispatch`).

## State

`core/kernel-boundary-rename` (`e63b04f1`, on the step 3 branch before its
rebase) does the rename: `kernel.dolly_process_dispatch(...)`, `kernel.malloc`,
and a context that carries `kernel` where it carried `dolly` and
`kernelExports`. Source suite 399 of 399 and the eight core browser suites
8 of 8 in Chrome; in Firefox 7 of 8.

## Why it is not merged

The terminal suite failed in Firefox in 2 of 8 runs with the rename, both at
the pixel wait of `test/terminal-browser.mjs:118` and within two minutes of
each other, while the machine was building the catalog; 0 of 8 without it the
same night; four interleaved runs each way afterwards all passed
(`build/kboundary-evidence/rename/` in `work/kboundary`). Not explained.
`511cd751` measured that Firefox 155 can enter a directly called Wasm export
twice, which is why the dispatch goes through `Reflect.apply`; whether calls
made straight on the exports object are likelier to hit that is not known.

## Done when

- The failure is explained (reproduced without the rename, or traced to it),
  the call sites use the exports' names, the one-line object is gone, and the
  browser suites pass in Chrome and Firefox, the terminal suite twenty times.
