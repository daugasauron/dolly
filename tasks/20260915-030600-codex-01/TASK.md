# Stream large selected file imports and exports

- STATUS: OPEN
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
