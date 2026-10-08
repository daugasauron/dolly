// Published package snapshots for a running image. No Wasm imports: enabling
// packages@0 only lets the page admit GET https://packages.dolly.invalid/v1/…
// (host/http/local-services.mjs) once the image ENTRY starts. The guest names
// a package by the recipe pin this release publishes; the page materializes
// and verifies its snapshot exactly as it does a build input, then serves the
// bytes. A request grants no network or other authority. The index of names
// is a public file of the site, amy-index.txt, read like any other URL.
import { PackageService } from "./service.mjs";

export function browser({ get }) {
  return { entryStarted() { get("http").services.packages = new PackageService(); } };
}
