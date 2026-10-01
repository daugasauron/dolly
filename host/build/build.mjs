// Wasm-initiated image builds. No Wasm imports: enabling build@0 only lets the
// page admit POST https://build.dolly.invalid/v1/builds (host/http/local-services.mjs)
// once the image ENTRY starts. Page-initiated rebuilds never need it. Builders
// get http@0's builder configuration; a result tab inherits its policies.
export function browser({ keyboard, get }) {
  // Imported here: a static import would cycle back into the host registry
  // through the image builder.
  const ui = import("./ui.mjs");
  return {
    async entryStarted() {
      const { mountImageBuild } = await ui;
      const http = get("http");
      http.services.build = mountImageBuild(http, keyboard);
    },
    claimsKey: event => !!event.target.closest?.("#image-build"),
  };
}
