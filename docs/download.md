# Explicit file download

Dolly has no host filesystem mount. Exporting a result is instead one explicit,
bounded transition from a regular file in WasmFS to an ordinary browser
download initiated for the local user.

## User surfaces

```text
download FILE
Dolly.download(path)
Pi tool: download { path }
```

`/bin/download` is a separately compiled command. QuickJS exposes the same
operation as `Dolly.download`. Pi registers a `download` tool whose description
requires an explicit user request; this is agent guidance, not the security
boundary.

## Two typed edges

The process-facing contract uses `DOLLY_PROCESS_DOWNLOAD_FILE` from
`<dolly/process.h>`. Its request contains a bounded path byte range and crosses
the executable's only function import:

```wat
(import "dolly_process_0" "call"
  (func (param i32 i64 i64 i64 i64) (result i64)))
```

This remains inside the Wasm userspace. The kernel validates that the path
names a regular file, limits it to 64 MiB, reads it from WasmFS, and derives
only its final path component as the suggested filename.

The browser-facing contract in `abi/dolly-download-0.wat` contains:

```wat
(import "env" "dolly_download_dispatch"
  (func $dolly_download_dispatch (param i64 i64 i64 i64) (result i32)))
```

The four values are name pointer/length and data pointer/length in kernel
memory64. They describe one capability call, not four capabilities. The binding
in `src/host/download.mjs` validates safe numeric ranges, literal UTF-8, filename
length and characters, and the 64 MiB bound before copying the bytes out of
shared memory. Leading U+FEFF is part of the name, not a BOM to discard.
It transfers the copied, unshared `ArrayBuffer` to the page, which validates it
again and shows **Save NAME (SIZE)** and **Dismiss** buttons. Nothing reaches
the browser's download manager until the user clicks Save; only then does the
page create a Blob URL for a hidden anchor carrying the validated base name. At
most four requests wait for a click; further requests fail with `EBUSY`. At most
four Blob URLs are retained, each for at most a minute.

The browser proofs check that no download starts before the click, that the
queue refuses a fifth request, literal ASCII/Unicode names, and the downloaded
bytes. The browser chooses the final local filename. Static
tests also verify the WAT signature and exact import allowlist.

## Security meaning

Download is not ambient host filesystem access:

- Wasm cannot choose a host directory or overwrite a named host path;
- no browser file handle, directory handle, DOM object, or host descriptor
  enters Wasm;
- the operation cannot read host bytes back into the sandbox;
- it is a visible local-user output, not a network request.

`env.dolly_http_dispatch` therefore remains the sole agent-selected network
edge. Download is nevertheless a real Wasm-to-browser capability: after total
userspace compromise, malicious Wasm can offer any readable sandbox file under
any valid name. The user's click is the confirmation; an embedding that needs
no downloads omits `download@0` with `DOLLY_HOST_MODULES`.
