# Preserve special characters in Janis file URLs

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: audit,bug,compatibility

## Evidence

Running the actual [Janis](../../src/runtimes/janis.js) and [Dolly JS](../../src/runtimes/dolly-node.js)
sources from `ff633f7` in a Node VM produced:

| Input filename | Result of fileURLToPath(pathToFileURL(filename)) |
| --- | --- |
| `/workspace/a#b.txt` | `/workspace/a` |
| `/workspace/a?b.txt` | `/workspace/a` |
| `/workspace/a%b.txt` | `URIError: URI malformed` |

Native Node preserved all three names. This was a source-runtime comparison, not a browser reproduction.
The `url` module currently interpolates raw filenames into URLs.

## Done when

- Supported file URL conversion round-trips literal `#`, `?`, `%`, spaces, and Unicode.
- Malformed or unsupported file URLs fail explicitly.
- Differential checks compare supported behavior with Node, and a browser test reads files with these names.

## Resolution

File URLs now encode literal path components and reject unsupported schemes,
remote hosts, encoded separators and malformed escapes. `createRequire(URL)`
uses the same checked conversion. Native comparisons cover spaces, #, ?, %,
Unicode, backslashes, trailing slashes and malformed URLs against Node.
The rebuilt JavaScript image passes actual file reads and CommonJS resolution
for those filenames in Chrome and Firefox, alongside the existing Janis
filesystem/environment suite.
