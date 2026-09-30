// Wasm-initiated image builds. No Wasm imports: enabling build@0 only lets the
// page admit POST https://build.dolly.invalid/v1/builds (host/build/local-services.mjs)
// once the image ENTRY starts. Page-initiated rebuilds never need it.
export function browser() {
  return { claimsKey: event => !!event.target.closest?.("#image-build") };
}
