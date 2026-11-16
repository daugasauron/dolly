// Wasm-initiated image builds. No Wasm imports: enabling build@0 only lets the
// page admit POST https://build.dolly.invalid/v1/builds (host/http/local-services.mjs)
// once the image ENTRY starts. Page-initiated rebuilds never need it. The page's
// imageBuilder builds (the site's routes give theirs); builders get http@0's
// builder configuration; a result tab inherits its policies.
export const check = ({ imageBuilder }) => imageBuilder ? undefined : "this page builds no images";

export function browser({ mount, keyboard, imageBuilder, get }) {
  // The panel and the builder load on the page alone, while the image boots.
  const loading = Promise.all([import("./ui.mjs"), imageBuilder()]);
  return {
    async entryStarted() {
      const [{ mountImageBuild }, builder] = await loading;
      const http = get("http");
      http.services.build = mountImageBuild(http, builder, mount, keyboard);
    },
    claimsKey: event => !!event.target.closest?.("#image-build"),
  };
}
