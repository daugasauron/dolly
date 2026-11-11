// Published package snapshots for a running image. No Wasm imports: enabling
// packages@0 only lets the page admit GET https://packages.dolly.invalid/v1/…
// (host/http/local-services.mjs) once the image ENTRY starts. The guest names
// a package by the recipe pin an image directory publishes, by default the
// page's own; the page materializes and verifies its snapshot exactly as it
// does a build input, then serves the bytes. Another directory is read only
// where the page's HTTP policy admits it, as a request of the guest's would
// be. The index of names is a public file of the directory, amy-index.txt,
// read like any other URL.
import { PackageService } from "./service.mjs";

export function browser({ get }) {
  return {
    entryStarted() { const http = get("http"); http.services.packages = new PackageService(http.admit); },
    disabled() { delete get("http").services.packages; },
  };
}
