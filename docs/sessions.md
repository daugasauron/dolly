# Sessions

`Ctrl+Shift+S` saves files in the current image. The first save asks for
a name; later saves update it. A small notification reports progress, success,
or failure.
Names use 1–64 ASCII letters, digits, dots, underscores, or hyphens;
`.`, `..`, and the static listing document `index.html` are reserved.

- `/session/` lists this browser's saved sessions, newest first, without booting Wasm.
- `/session/NAME` loads one. Save also changes the current URL to this address.
- Old `/load/?session=NAME` bookmarks redirect to the named path.

The list has **Export**, **Import session file**, and **Delete**. Export downloads
an unencrypted `.dolly-session` file; import checks its size, checksum and
compression, then asks for a name. Existing saves are never overwritten by an
import. Delete asks for confirmation and only removes that local checkpoint,
not an already-running session or an exported file. Importing does not start Wasm.

These routes also work below a deployment prefix, such as `/dolly/session/NAME`.
The local server maps named paths to one launcher; static hosting uses `404.html`
on first navigation and the isolation service worker thereafter.

## What survives

Pi writes conversations to `~/.pi/agent/sessions/` inside Dolly once an assistant
response exists. `/resume` lists them; `pi -c` continues the latest conversation
for the current directory. Exiting Pi does not delete them. Reloading a fresh
image resets the in-memory filesystem: save with Ctrl+Shift+S before leaving,
then load `/session/NAME` and use Pi's `/resume`. An empty Pi session has no file.

Saves preserve files, empty directories, symlinks, and deletions, including
workspace changes, installed tools, shell history, Pi conversations, and
credentials. Loading boots the same base image, applies the saved changes, then
starts the image's ordinary entry program. It does **not** resume running
processes, open descriptors, terminal scrollback, or transient environment/cwd.
Hard links and file timestamps/mode metadata are not preserved.

The in-Wasm kernel fingerprints the base filesystem at boot. Mailbox format 2
transfers only changed/new records and deletion records, not another copy of the
compiler and runtimes. SHA-256 comparisons and all filesystem encoding/restoring
stay in Wasm. `/dev` and `/seed` remain runtime-owned. The uncompressed **delta**
limit is 512 MiB; browser quota and available memory can impose lower limits.

The browser copies bounded opaque chunks, optionally compresses them with gzip,
and atomically replaces one IndexedDB record. A failed save leaves the previous
record intact. Both mailbox participants compare and wait on the same observed
sequence, with bounded waits and cancellation. The kernel services requests
independently of foreground stdin, including while a child sleeps. Capture
temporarily pauses filesystem service; programs can run again while the browser
compresses and stores the result. Transfer and restore staging buffers are freed.

## Limits and privacy

Saves are local to this browser profile and origin (scheme, hostname, and port).
They are not uploaded, synced, or shared by the session URL. Clearing site data
deletes them. Credentials are included intentionally; anyone with access to the
browser profile or an exported file can recover them. Import only files you
trust; exports are checksummed against corruption, not authenticated.
See [Security](security.md).

The runtime build ID and complete inherited Dollyfile identity must match before
loading. Older/incompatible saves remain listed and stored, but are not migrated
or silently applied to a different base. Updating Dolly can make an older save
unloadable. Export/import can move a save between browsers or domains, but
does not migrate it across runtime or image versions.

Named saves require a source-visible image with a matching prebuilt snapshot.
On a rebuild route, the first save verifies that the entire rebuilt base is
byte-identical to that snapshot before capturing a delta. A different base fails
visibly without writing a saved record. Uploaded custom recipes remain tab-local.
The `session-rebuild` browser regression compares the bases, rejects a changed
base, then saves on `/IMAGE/rebuild` and restores through `/session/NAME`.

Session persistence adds no Wasm import or path-level browser filesystem API.
The review surface is `src/session-snapshot.c`, the shared path restoration in
`src/fs-record.h`, `src/session-transport.mjs`,
`src/session-store.mjs`, `src/session-file.mjs`, and the boot/save call sites in the page and runtime worker.
`env.dolly_http_dispatch` remains the sole intentional agent-selected network edge.
