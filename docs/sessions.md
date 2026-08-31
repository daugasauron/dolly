# Sessions

`Ctrl+Shift+S` saves the current Dolly filesystem. The first save asks for a
name; later saves reuse it. Open the result at:

```text
/load/?session=NAME
```

The name and format version also live inside the sandbox at
`~/.dolly-session-name`.

## Data flow

```text
WasmFS walk and encoding
        │
        ▼
fixed 1 MiB shared-memory mailbox
        │ opaque chunks; no paths or operations
        ▼
browser gzip → IndexedDB (same origin)
        │
        ▼
/load → verify runtime + Dollyfile chain → WasmFS restore
```

Dolly serializes directories, regular files, and symlinks. `/dev` stays
runtime-owned and `/seed` is the immutable compiler seed; everything else is
captured, including `/workspace`, shell history, Pi sessions, and credentials.
The uncompressed format is bounded to 512 MiB.

The browser never mounts or interprets WasmFS. Session persistence adds no Wasm
import and therefore no new sandbox escape edge: the page only copies framed
bytes from shared memory. Records are accepted only when their runtime build ID
and complete inherited Dollyfile digest chain match the current deployment.

Sessions are local browser data, scoped by the page origin. They are not synced
or uploaded. Because credentials are intentionally included, anyone with
access to that browser profile can recover them. A compromised in-Wasm agent
can still exfiltrate them through the explicitly configured HTTP broker; see
[Security](security.md).
