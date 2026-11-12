# A folder a server holds, mounted in Dolly over the HTTP broker

- STATUS: OPEN
- PRIORITY: 380
- TAGS: http,filesystem,packages,0.1.6,owner

Owner (2026-11-13): "I want to compile and provide some package that can "mount" a filesystem over
the dolly http broker through a server. I did some research and there seems to be available
packages that syncs a file system over http. The idea is that some server hosts a filesystem
folder (for example this machine) and then it can be mounted in dolly." With 0.1.6.

## Constraints

- All traffic goes through `env.dolly_http_dispatch` and its policy (`docs/http.md`): the folder's
  server is an origin an embedding's rule admits, with the methods and headers the protocol needs.
  No socket, WebSocket or path around the broker (`AGENTS.md`).
- Dolly has no FUSE: "mount" means a directory of the shared filesystem that a program keeps in
  step with the server (fetch, then send changes back), or a library a program links.
- Built from upstream source inside Dolly, as a package `amy install` gives; the server side is an
  ordinary program the user runs on their machine, with what a browser needs from it (CORS).

## Do

Survey what exists (WebDAV and HTTP sync tools, for example rclone's WebDAV remote and bisync, or a
WebDAV client in C), pick the one that builds with Dolly's toolchains and needs no more than the
broker gives, package it, and document the server side to run on this machine.

## Done when

From `default` in Chrome and Firefox: `amy install` the package, point it at a folder this machine
serves (the documented command), and files written on either side appear on the other; a browser
test with a local server; the policy rule it needs is in its documentation.
