// Published package snapshots for a running image. The guest names a package
// by the recipe pin an image directory publishes, by default the page's own;
// the page materializes and verifies its snapshot exactly as it does a build
// input. From the page's own directory the index, amy-index.txt, and the
// snapshots come over this module's own mailbox (dolly-packages-0.wat,
// transport.mjs); another directory is read through http@0's broker, as
// https://packages.dolly.invalid/v1/… (host/http/local-services.mjs), only
// where the page's HTTP policy admits it, as a request of the guest's would be.
import { PackageService } from "./service.mjs";
import { PackagesTransport } from "./transport.mjs";
export { DOLLY_PACKAGES_ABI_DIGEST as digest } from "./abi.mjs";

export function browser({ get }) {
  return {
    entryStarted() { const http = get("http"); http.services.packages = new PackageService(http.admit); },
    disabled() { delete get("http").services.packages; },
  };
}

// The kernel's mailbox reports each request at the service tick.
export function worker({ images }) {
  let transport;
  return {
    start({ kernel, memory }) {
      transport = new PackagesTransport(memory.buffer, Number(kernel.dolly_packages_mailbox_address()), images);
    },
    service() { transport?.service(); },
    dispose() { transport?.close(); },
  };
}
