// Published package snapshots for a running image, over this module's own
// mailbox (dolly-packages-0.wat, transport.mjs). The guest names a package by
// the recipe pin an image directory publishes, by default the page's own; the
// page materializes and verifies its snapshot exactly as it does a build input.
// Another directory's files are each read only where the page's HTTP policy
// admits it, as a request of the guest's (page/network.mjs, worker.mjs).
import { PackagesTransport, maxSnapshots } from "./transport.mjs";
export { DOLLY_PACKAGES_ABI_DIGEST as digest } from "./abi.mjs";

// The page judges each file of another directory; a snapshot refused for the
// quota, it says what gives more, which the guest's error number cannot.
export function browser({ network, showStatus }) {
  return {
    messages: {
      "packages-quota": () => showStatus(`This page has handed over the ${maxSnapshots} package snapshots a page load gives: ` +
        "save the session (Ctrl+Shift+S) and reload the page to install more.", true),
      "packages-admit": ({ url }) => {
        const { maxResponseBytes, timeoutMilliseconds } = network.admit(new URL(url));
        return { maxResponseBytes, timeoutMilliseconds };
      },
    },
  };
}

// The kernel's mailbox reports each request at the service tick.
export function worker({ images, send, ask, get }) {
  let transport;
  // The packages Worker (worker.mjs), which the page makes from a blob: URL
  // that imports it (runtime.mjs pageWorkers).
  const workerUrl = URL.createObjectURL(new Blob([`import ${JSON.stringify(new URL("./worker.mjs", import.meta.url).href)};`],
    { type: "text/javascript" }));
  return {
    start({ kernel, memory }) {
      transport = new PackagesTransport(memory.buffer, Number(kernel.dolly_packages_mailbox_address()), images,
        () => send({ type: "packages-quota" }), url => ask({ type: "packages-admit", url: url.href }),
        () => get("runtime").pageWorker(workerUrl, { type: "module", name: "dolly-packages" }));
    },
    service() { transport?.service(); },
    dispose() { transport?.close(); },
  };
}
