# Stream large selected file imports and exports

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: filesystem,browser,workflow

A complete Slopyard recovery archive grew to 87,224,320 bytes. Uploading it
through the ordinary file picker failed with `upload: File too large`. Earlier
archives below 64 MiB worked. The full native Pi conversation accounts for most
of the size; it must remain intact. This is separate from the completed HTTP
request-limit task.

The current upload cap is `UPLOAD_MAX_BYTES` in `src/upload-transport.mjs`;
download has corresponding 64 MiB bounds in `src/browser.mjs` and `src/dolly.c`.
Investigate bounded streaming of user-selected files into the shared in-Wasm
filesystem and streaming downloads, rather than simply allocating larger whole
buffers. Preserve explicit browser file selection and the existing authority
boundary. Verify a file over 64 MiB round-trips byte-for-byte in a real browser,
including cancellation/error handling without losing the shell.

Current recovery workaround: gzip compressed this archive to 63,057,451 bytes,
which fits the existing upload limit; decompress through ordinary Dolly tools.
Larger future archives may need chunks. The original complete archive remains
in `build/slopyard-walking/outposts-state.tar`.

The later focus-view migration verified the chunk workaround: a 143,513,600-byte
USTAR archive compressed to 104,211,289 bytes and was uploaded as three files
of at most 48 MiB through the ordinary file picker. Inside Dolly,
`cat /tmp/focus-restore-0.part /tmp/focus-restore-1.part /tmp/focus-restore-2.part | gzip -dc - | tar -xf - -C /workspace`
restored all 32 creations and the complete 141,563,139-byte native conversation.
Its original SHA-256 prefix matched after restoration. This gzip requires the
explicit `-` stdin argument. Temporary imported chunks were then removed.
Evidence: `build/slopyard-walking/focus-restored-proof.json`. This manual
workaround does not complete the streaming upload/download work above.

September25: two physics diagnostics completed but ordinary downloads of their
large JSONL traces failed(-22): `build/slopyard-biped-observe.log` and
`build/slopyard-warehouse-store-clear.log`. The latter retained its successful
world/regression result; a48MiB reduced diagnostic trace exported successfully.
The bundled gzip only supports decompression; the attempted compression helper
therefore failed before the next trace could export. A small local diagnostic
compressor using the existing zlib is now compiled inside Dolly and verifies its
output against the original bytes. This remains a test-workflow workaround, not
the requested streaming file interface. Core64MiB bounds remain unchanged.

## Resolution

Commit `e7d60b8` (pins in `b024699`) streams both directions with bounded
memory; the bound is now 1 GiB per file (`DOLLY_UPLOAD_MAX_SIZE`,
`DOLLY_DOWNLOAD_MAX_SIZE` in the WAT contracts), still checked by both sides.

- Upload (mailbox v1): 1 MiB chunks; the page reads the file through one
  reused BYOB buffer and waits on the kernel's notified `consumed` word. The
  first chunk announces the size, so the kernel sizes its temporary file once
  and publishes it only when EOF arrives at exactly that size. The dialog stays
  open with progress and Cancel (ECANCELED); Ctrl+C still interrupts.
- Download: `dolly_download_dispatch(op, span)` with OPEN/WRITE/CLOSE/ABORT.
  The kernel sends one 1 MiB chunk per deferred retry; the Worker copies it into
  a Blob part and the page offers the Blob for a Save click only after CLOSE.
  Ctrl+C or process exit aborts the stream; at most 4 offers wait.

Measured with a random file, picker upload, `sha256sum` in Dolly, download,
Save and host comparison (summed browser RSS):

| | Chrome | Firefox |
| --- | --- | --- |
| 60 MiB upload, before | 25.6 s, +196 MiB | 22.5 s, +167 MiB |
| 60 MiB upload, after | 1.0 s, +65 MiB | 1.0 s, +84 MiB |
| 200 MiB upload | 3.3 s, +219 MiB | 3.3 s, +212 MiB |
| 200 MiB download into the Blob | 3.2 s, +184 MiB | 3.3 s, +189 MiB |
| 200 MiB Save | +7 MiB | +212 MiB (download manager) |

Both 200 MiB round trips were byte-identical. Growing the temporary file by
appends cost +499/+659 MiB for 200 MiB, hence the announced size.
`test/upload-browser.mjs` uploads a 72 MiB file, interrupts a download and
saves a complete one byte for byte, cancels an upload from the dialog and with
Ctrl+C mid-transfer, and checks that no destination or scratch file remains,
in Chrome and Firefox. Evidence: `build/transfer-evidence/` in
`work/transfer-streaming`.
