// Wasm-initiated image builds. No Wasm imports: enabling build@0 only lets the
// page admit POST https://build.dolly.invalid/v1/builds (host/http/local-services.mjs)
// once the image ENTRY starts. Page-initiated rebuilds never need it. The page's
// imageBuilder builds (the site's routes give theirs) with the page network's
// builder; a result tab inherits its policies (page/network.mjs).
export const check = ({ imageBuilder }) => imageBuilder ? undefined : "this page builds no images";

export function browser({ mount, keyboard, imageBuilder, network, get }) {
  // The panel and the builder load on the page alone, while the image boots.
  const loading = Promise.all([import("./ui.mjs"), imageBuilder()]);
  return {
    async entryStarted() {
      const [{ mountImageBuild }, builder] = await loading;
      get("http").services.build = mountImageBuild(network, builder, mount, keyboard);
    },
    claimsKey: event => !!event.target.closest?.("#image-build"),
  };
}
