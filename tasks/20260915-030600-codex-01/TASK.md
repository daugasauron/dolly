# Stream large selected file imports and exports

- STATUS: OPEN
- PRIORITY: 200
- TAGS: filesystem,browser,workflow

A complete Blockwalker recovery archive grew to 87,224,320 bytes. Uploading it
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
in `build/blockwalker-walking/outposts-state.tar`.
