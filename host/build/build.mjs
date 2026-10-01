// Wasm-initiated image builds. No Wasm imports: enabling build@0 only lets the
// page admit POST https://build.dolly.invalid/v1/builds (host/http/local-services.mjs)
// once the image ENTRY starts. Page-initiated rebuilds never need it.
// The page configures the builders' network, the HTTP policies a result tab
// inherits, and the local services map that admits the build service.
export function browser({ keyboard, configuration: { network, policies, services } }) {
  // Imported here: a static import would cycle back into the host registry
  // through the image builder.
  const ui = import("./ui.mjs");
  return {
    async entryStarted() {
      const { mountImageBuild } = await ui;
      services.build = mountImageBuild(network, policies, keyboard);
    },
    claimsKey: event => !!event.target.closest?.("#image-build"),
  };
}
