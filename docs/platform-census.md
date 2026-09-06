# Platform census

Dolly should derive its platform from real programs rather than a POSIX
checklist.

```sh
npm run census -- default
npm run census -- gamedev
npm run census -- python
```

The static census verifies snapshot size, digest and runtime identity, then
validates each executable against the exact current `dolly-process-0` contract.
The `dolly.process` stamp, typed imports and `_start` entry determine whether
a file is executable—not its extension, path or permission bits. Resident
display plugins and process-local DSOs are excluded.

`build/platform-census-IMAGE.md` maps exact callable imports to executables and
back. Every process uses the one `dolly_process_0.call` packet gate; the private
memory import is not counted as an operation. The current default image has
91 validated process executables. The previous census looked for the obsolete
`dolly_main` interface and silently produced zero rows; empty results now fail.

This is **not a platform-operation usage census**. File, lifecycle, clock,
entropy and HTTP requests are operation numbers inside packets, not separate
Wasm imports. Static imports cannot show whether a program uses those requests,
whether they succeed, or whether an operation should survive into ABI 1.

The next layer must count operations per process during real acceptance
workloads. Keep counters/reports in Wasm and export them only as explicit test
artifacts, without adding an ambient browser communication channel. Compare
those measurements with reference POSIX fixtures before freezing the substrate.

For the separate browser-boundary identity, see
[capability fingerprints](capability-fingerprint.md).
