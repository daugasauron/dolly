// Published package snapshots for a running image. The guest names a package
// by the recipe pin an image directory publishes, by default the page's own;
// the page materializes and verifies its snapshot exactly as it does a build
// input. From the page's own directory the index, amy-index.txt, and the
// snapshots come over this module's own mailbox (dolly-packages-0.wat,
// transport.mjs); another directory is read through http@0's broker, as
// https://packages.dolly.invalid/v1/… (host/http/local-services.mjs), each of
// its files only where the page's HTTP policy admits it, as a request of the
// guest's (worker.mjs).
import { PackageService } from "./service.mjs";
import { PackagesTransport, maxSnapshots } from "./transport.mjs";
export { DOLLY_PACKAGES_ABI_DIGEST as digest } from "./abi.mjs";

// A snapshot refused for the quota: the page says what gives more, which the
// guest's error number cannot.
export function browser({ get, showStatus }) {
  const spent = () => showStatus(`This page has handed over the ${maxSnapshots} package snapshots a page load gives: ` +
    "save the session (Ctrl+Shift+S) and reload the page to install more.", true);
  return {
    messages: { "packages-quota": spent },
    entryStarted() { const http = get("http"); http.services.packages = new PackageService(http.admit, spent); },
    disabled() { delete get("http").services.packages; },
  };
}

// The kernel's mailbox reports each request at the service tick.
export function worker({ images, send }) {
  let transport;
  return {
    start({ kernel, memory }) {
      transport = new PackagesTransport(memory.buffer, Number(kernel.dolly_packages_mailbox_address()), images,
        () => send({ type: "packages-quota" }));
    },
    service() { transport?.service(); },
    dispose() { transport?.close(); },
  };
}
